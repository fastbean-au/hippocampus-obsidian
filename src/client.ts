import {
  Code,
  ConnectError,
  createGatewayTransport,
  createHippocampusClient,
} from "hippocampus-client";
import type { HippocampusClient as Generated } from "hippocampus-client";

import { requestUrlFetch } from "./fetch";
import type { RequestUrl } from "./fetch";
import { linkEdgesFrom, memoryViewsFrom } from "./parse";
import type { LinkEdge, LinkInput, MemoryView, SearchMemoriesInput, StoreMemoryInput, StoreResult } from "./types";

// The plugin's view of the service, over the shared TypeScript client (hippocampus-client).
//
// The wire is no longer this plugin's business. Routes, verbs, protojson encoding and error codes
// come from the client the service generates from its own contract, over the JSON gateway, so a
// moved path or renamed field is a build failure against the new client rather than a 404 a user
// meets. What is left here is the narrowing: the handful of calls the plugin makes, in the shapes
// sync.ts and main.ts were written against, with the gateway reached through requestUrl.

// isNotFound reports a memory the consolidation cycle has already deleted - the one error a caller
// recovers from rather than surfaces. Under group scoping it equally means "not this token's",
// which the plugin treats the same way: the note gets a fresh memory.
export function isNotFound(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.NotFound;
}

export interface HippocampusClientOptions {
  baseUrl: string;
  token?: string;
  callTimeoutMs?: number;
}

export class HippocampusClient {
  private readonly baseUrl: string;
  private readonly request: RequestUrl;
  private readonly rpc: Generated;

  // request is Obsidian's requestUrl, passed in by main.ts so this file imports nothing from
  // Obsidian and the tests can hand it a fake.
  constructor(options: HippocampusClientOptions, request: RequestUrl) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.request = request;
    this.rpc = createHippocampusClient(
      createGatewayTransport({
        baseUrl: this.baseUrl,
        token: options.token,
        clientVersion: `hippocampus-obsidian/${PLUGIN_VERSION}`,
        fetch: requestUrlFetch(request),
        timeoutMs: options.callTimeoutMs,
      }),
    );
  }

  // health pings the unauthenticated liveness endpoint. It is served by the gateway itself rather
  // than declared by an RPC, so it is the one call the shared client cannot make.
  async health(): Promise<void> {
    const res = await this.request({ url: this.baseUrl + "/healthz", method: "GET", throw: false });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`the service answered HTTP ${res.status} at /healthz`);
    }
  }

  async storeMemory(input: StoreMemoryInput): Promise<StoreResult> {
    const res = await this.rpc.storeMemory(input);

    return { id: res.id, rejected: res.rejected };
  }

  // updateMemory replaces an existing memory's body. A NotFound (isNotFound) means the sleep cycle
  // deleted it, and callers fall back to a fresh store. metadata REPLACES the stored labels
  // wholesale rather than merging with them, so a note whose frontmatter dropped a key has that
  // label removed on the next sync; undefined clears them, since an absent map and an empty one are
  // the same on the wire.
  async updateMemory(
    id: string,
    body: string,
    significance?: number,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.rpc.updateMemory({
      id,
      body,
      significance,
      metadata,
      clearMetadata: metadata === undefined,
    });
  }

  async deleteMemories(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.rpc.deleteMemories({ ids });
  }

  // linkMemories adds or re-weights links from one memory to others. It is an upsert per pair, so a
  // re-sync of an unchanged note costs nothing but the request. Every target must exist: the
  // service refuses the whole request if one does not.
  async linkMemories(id: string, links: LinkInput[]): Promise<void> {
    if (links.length === 0) {
      return;
    }

    await this.rpc.linkMemories({ id, links });
  }

  // unlinkMemories removes the edges between one memory and the named targets, in BOTH directions,
  // which is why callers decide what they own before asking.
  async unlinkMemories(id: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.rpc.unlinkMemories({ id, ids });
  }

  // getMemoryLinks reads a memory's edges in both directions: the inbound half tells a caller which
  // of its outbound edges another note also declares, and so must survive a removal.
  async getMemoryLinks(id: string): Promise<LinkEdge[]> {
    return linkEdgesFrom(await this.rpc.getMemoryLinks({ id }));
  }

  async searchMemories(input: SearchMemoriesInput): Promise<MemoryView[]> {
    return memoryViewsFrom(await this.rpc.searchMemories(input));
  }
}

// PLUGIN_VERSION is manifest.json's version, which esbuild injects at build time; the tests, which
// run the source directly, see the fallback.
declare const __PLUGIN_VERSION__: string | undefined;

const PLUGIN_VERSION = typeof __PLUGIN_VERSION__ === "string" ? __PLUGIN_VERSION__ : "dev";
