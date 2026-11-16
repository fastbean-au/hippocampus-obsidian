// The plugin's client end to end down to requestUrl: what reaches the wire, and how the replies come
// back. This replaces the old contract-conformance suite. That suite held a hand-written route table
// and hand-written field lists against a vendored OpenAPI document; there is no hand-written route
// or field left to hold, since both now come from hippocampus-client, which is generated from the
// contract and tested against it in the service's own repository. What is left to test is that the
// plugin drives that client through requestUrl correctly.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isNotFound, HippocampusClient } from "../src/client";
import { requestUrlFetch } from "../src/fetch";
import type { RequestUrl } from "../src/fetch";

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeRequest(status: number, reply: unknown, calls: Call[]): RequestUrl {
  return async (request) => {
    calls.push(request);

    return { status, headers: { "content-type": "application/json" }, text: JSON.stringify(reply) };
  };
}

test("a store is POST /v1/memories with the token and the plugin's version", async () => {
  const calls: Call[] = [];
  const client = new HippocampusClient(
    { baseUrl: "http://localhost:8080/", token: "t0k3n" },
    fakeRequest(200, { id: "m1", rejected: false }, calls),
  );

  const result = await client.storeMemory({ body: "a note", significance: 5, group: "vault", metadata: { tag: "x" } });

  assert.deepEqual(result, { id: "m1", rejected: false });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "http://localhost:8080/v1/memories");
  assert.equal(calls[0].headers?.["authorization"], "Bearer t0k3n");
  assert.match(calls[0].headers?.["hippocampus-client-version"] ?? "", /^hippocampus-obsidian\//);
  assert.deepEqual(JSON.parse(calls[0].body ?? ""), {
    body: "a note",
    significance: 5,
    group: "vault",
    metadata: { tag: "x" },
  });
});

test("an update is PATCH by id, and absent metadata clears it", async () => {
  const calls: Call[] = [];
  const client = new HippocampusClient({ baseUrl: "http://h" }, fakeRequest(200, { ok: true }, calls));

  await client.updateMemory("a/b", "new body", 7);

  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].url, "http://h/v1/memories/a%2Fb");
  assert.deepEqual(JSON.parse(calls[0].body ?? ""), { body: "new body", significance: 7, clearMetadata: true });
});

test("a memory the sleep cycle deleted reads as not found", async () => {
  const client = new HippocampusClient(
    { baseUrl: "http://h" },
    fakeRequest(404, { code: 5, message: "memory not found" }, []),
  );

  await assert.rejects(client.updateMemory("gone", "x"), (err: unknown) => isNotFound(err));
});

test("any other failure is not mistaken for not found", async () => {
  const client = new HippocampusClient(
    { baseUrl: "http://h" },
    fakeRequest(503, { code: 14, message: "purge in progress" }, []),
  );

  await assert.rejects(client.updateMemory("m", "x"), (err: unknown) => !isNotFound(err));
});

test("links are read over GET and narrowed to outbound or not", async () => {
  const calls: Call[] = [];
  const client = new HippocampusClient(
    { baseUrl: "http://h" },
    fakeRequest(
      200,
      {
        links: [
          { id: "m-a", significance: 5, direction: "LINK_DIRECTION_OUTBOUND" },
          { id: "m-b", significance: 3, direction: "LINK_DIRECTION_INBOUND" },
        ],
        linkSignificance: "8",
      },
      calls,
    ),
  );

  const edges = await client.getMemoryLinks("m1");

  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, "http://h/v1/memories/m1/links");
  assert.deepEqual(edges, [
    { id: "m-a", significance: 5, outbound: true },
    { id: "m-b", significance: 3, outbound: false },
  ]);
});

test("empty link and delete lists make no request", async () => {
  const calls: Call[] = [];
  const client = new HippocampusClient({ baseUrl: "http://h" }, fakeRequest(200, {}, calls));

  await client.linkMemories("m1", []);
  await client.unlinkMemories("m1", []);
  await client.deleteMemories([]);

  assert.equal(calls.length, 0);
});

test("health reads /healthz directly and fails on a non-2xx", async () => {
  const calls: Call[] = [];

  await new HippocampusClient({ baseUrl: "http://h" }, fakeRequest(200, { status: "ok" }, calls)).health();

  assert.equal(calls[0].url, "http://h/healthz");

  await assert.rejects(new HippocampusClient({ baseUrl: "http://h" }, fakeRequest(502, {}, [])).health());
});

test("the fetch adapter builds a body-less response for a null-body status", async () => {
  const response = await requestUrlFetch(async () => ({ status: 204, headers: {}, text: "" }))("http://h/x");

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("the fetch adapter honours an already-aborted signal without calling out", async () => {
  let called = false;
  const fetch = requestUrlFetch(async () => {
    called = true;

    return { status: 200, headers: {}, text: "{}" };
  });

  await assert.rejects(fetch("http://h/x", { signal: AbortSignal.abort() }));
  assert.equal(called, false);
});
