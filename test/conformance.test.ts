// The contract-conformance suite.
//
// This plugin talks to the service over its HTTP/JSON `/v1` gateway and hand-writes every wire
// shape it touches: src/routes.ts names the routes, src/types.ts mirrors the protojson projection.
// It imports nothing from the contract and generates nothing from it, so a renamed path, a changed
// verb or a dropped field fails no test - it reaches a user as a 404, or as a field that silently
// reads undefined.
//
// While the plugin lived inside the service repository that was at least mitigated by proximity: a
// contract edit was visible beside the client that parsed it. Out here there is no proximity, so
// this suite is the replacement. It holds both hand-written surfaces against
// contract/hippocampus.swagger.json - the OpenAPI document the service generates from
// contract/hippocampus.proto - vendored at the version in contract/SERVICE_VERSION, which is also
// this plugin's declared minimum service version.
//
// The checks are deliberately ONE-WAY: every route and field the plugin uses must exist in the
// contract. The reverse is not a fault - the contract carries a great deal this plugin has no use
// for, and requiring coverage of it would turn every new RPC into a failure here.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { ROUTES } from "../src/routes";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Swagger {
  paths: Record<string, Record<string, { parameters?: { name: string; in: string }[] }>>;
  definitions: Record<string, { properties?: Record<string, unknown> }>;
}

const swagger = JSON.parse(
  readFileSync(join(repoRoot, "contract", "hippocampus.swagger.json"), "utf8"),
) as Swagger;

const serviceVersion = readFileSync(
  join(repoRoot, "contract", "SERVICE_VERSION"),
  "utf8",
).trim();

// /healthz is served by the gateway itself rather than declared by a google.api.http annotation on
// an RPC, so it is absent from the generated document by construction. It is exempt here and
// nowhere else; every other route must be found.
const UNDECLARED_ROUTES = new Set(["/healthz"]);

// Field names the plugin defines itself rather than reading off the wire, with the reason. Anything
// not listed has to exist in the contract.
const DERIVED_FIELDS: Record<string, Record<string, string>> = {
  LinkEdge: {
    outbound:
      "flattened by parse.ts from the wire's `direction` enum (OUTBOUND/INBOUND); the plugin only " +
      "needs to know whether this end declared the link",
  },
  StoreResult: {
    rejected:
      "the gateway spells it `rejected` on v1StoreMemoryResponse/v1StoreEventResponse, which are " +
      "checked by the response-envelope test rather than as a shared definition",
    id: "as above",
  },
};

// interfaceFields parses src/types.ts for one interface's field names. The file is a flat list of
// `name: type;` / `name?: type;` lines, so this needs no TypeScript parser - and an interface whose
// shape stops matching yields an empty set, which fails the assertion rather than passing vacuously.
function interfaceFields(name: string): string[] {
  const source = readFileSync(join(repoRoot, "src", "types.ts"), "utf8");
  const match = source.match(
    new RegExp(`export interface ${name}\\s*\\{([^}]*)\\}`, "m"),
  );

  assert.ok(match, `src/types.ts declares no interface ${name}`);

  const fields = [...match[1].matchAll(/^\s*([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]);

  assert.ok(fields.length > 0, `interface ${name} parsed to no fields - has its shape changed?`);

  return fields;
}

function definitionProperties(name: string): string[] {
  const definition = swagger.definitions[name];

  assert.ok(definition, `the contract has no definition ${name}`);

  return Object.keys(definition.properties ?? {});
}

function assertFieldsExist(interfaceName: string, definitionName: string): void {
  const derived = DERIVED_FIELDS[interfaceName] ?? {};
  const properties = new Set(definitionProperties(definitionName));

  for (const field of interfaceFields(interfaceName)) {
    if (field in derived) {
      continue;
    }

    assert.ok(
      properties.has(field),
      `${interfaceName}.${field} is not a property of ${definitionName} in the contract ` +
        `(service ${serviceVersion}) - the gateway will never send or accept it`,
    );
  }
}

test("every route the plugin calls exists in the contract", () => {
  for (const [name, { method, path }] of Object.entries(ROUTES)) {
    if (UNDECLARED_ROUTES.has(path)) {
      continue;
    }

    const declared = swagger.paths[path];

    assert.ok(
      declared,
      `ROUTES.${name} calls ${path}, which the contract (service ${serviceVersion}) does not declare`,
    );
    assert.ok(
      declared[method.toLowerCase()],
      `ROUTES.${name} calls ${method} ${path}, but the contract declares only ` +
        `${Object.keys(declared).join(", ").toUpperCase()} on it`,
    );
  }
});

test("the response shapes the plugin reads exist in the contract", () => {
  assertFieldsExist("MemoryView", "v1Memory");
  assertFieldsExist("EventView", "v1Event");
  assertFieldsExist("LinkEdge", "v1LinkEdge");
  assertFieldsExist("SummarisationCandidate", "v1SummarisationCandidate");
});

test("the request shapes the plugin sends exist in the contract", () => {
  // StoreMemory and StoreEvent take the record itself as their request body, so the input shapes
  // are checked against the same definitions the responses use.
  assertFieldsExist("StoreMemoryInput", "v1Memory");
  assertFieldsExist("StoreEventInput", "v1Event");
  assertFieldsExist("SearchMemoriesInput", "v1SearchMemoriesRequest");
  assertFieldsExist("LinkInput", "v1Link");
});

test("the response envelopes the plugin unwraps carry the keys parse.ts reads", () => {
  // parse.ts reaches into these by name; a renamed envelope key yields an empty list rather than an
  // error, which on screen is a vault with nothing in it.
  const envelopes: [string, string[]][] = [
    ["v1GetMemoriesResponse", ["memories", "totalCount"]],
    ["v1GetEventsResponse", ["events", "totalCount"]],
    ["v1GetLinksResponse", ["links"]],
    ["v1GetSummarisationCandidatesResponse", ["candidates"]],
  ];

  for (const [definition, keys] of envelopes) {
    const properties = new Set(definitionProperties(definition));

    for (const key of keys) {
      assert.ok(
        properties.has(key),
        `parse.ts reads '${key}' off ${definition}, which the contract does not declare`,
      );
    }
  }
});

test("the list filters the plugin sends are accepted as query parameters", () => {
  // ListInput is sent as a query string, so its fields are parameters rather than a body schema.
  // Both listing routes must accept every one of them.
  const fields = interfaceFields("ListInput");

  for (const path of ["/v1/memories", "/v1/events"]) {
    const accepted = new Set(
      (swagger.paths[path].get.parameters ?? [])
        .filter((p) => p.in === "query")
        .map((p) => p.name),
    );

    for (const field of fields) {
      assert.ok(
        accepted.has(field),
        `ListInput.${field} is not a query parameter of GET ${path} - it would be ignored`,
      );
    }
  }
});

test("the pinned service version is well formed", () => {
  // The pin is this plugin's declared minimum service version, quoted in README.md and raised by
  // the contract-bump workflow. A malformed one would make that bump silently a no-op.
  assert.match(serviceVersion, /^v\d+\.\d+\.\d+$/);
});

test("README.md states the pinned service version as the minimum", () => {
  // README.md's Requirements section names the floor in prose, which is a second copy of
  // contract/SERVICE_VERSION. Nothing executes prose, so without this the documented minimum and the
  // contract the plugin was actually checked against drift apart silently - and the documented one
  // is what a user reads before deciding whether to upgrade the service.
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");

  assert.ok(
    readme.includes(`Hippocampus ${serviceVersion} or newer`),
    `README.md does not say "Hippocampus ${serviceVersion} or newer" - it has drifted from ` +
      "contract/SERVICE_VERSION",
  );
});
