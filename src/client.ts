import { requestUrl } from "obsidian";

import { ROUTES, route } from "./routes";

import {
  candidatesFrom,
  eventsFrom,
  linksFrom,
  memoriesFrom,
  toNumber,
} from "./parse";
import type {
  EventView,
  LinkEdge,
  LinkInput,
  ListInput,
  MemoryView,
  SearchMemoriesInput,
  StoreEventInput,
  StoreMemoryInput,
  StoreResult,
  SummarisationCandidate,
} from "./types";

// HippocampusError carries the HTTP status so callers can distinguish, e.g., a 404 (a memory the
// consolidation cycle has already deleted) from a real failure.
export class HippocampusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HippocampusError";
    this.status = status;
  }
}

export interface HippocampusClientOptions {
  baseUrl: string;
  token?: string;
  callTimeoutMs?: number;
}

// HippocampusClient is a thin wrapper over the Hippocampus HTTP/JSON `/v1` gateway. It uses
// Obsidian's requestUrl (rather than fetch) so requests are not subject to the renderer's CORS
// policy, and it attaches the bearer token when one is configured.
export class HippocampusClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: HippocampusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token ?? "";
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token !== "") {
      headers["Authorization"] = "Bearer " + this.token;
    }

    const res = await requestUrl({
      url: this.baseUrl + path,
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      throw: false,
    });

    if (res.status < 200 || res.status >= 300) {
      const message =
        (res.json &&
          typeof res.json.message === "string" &&
          res.json.message) ||
        `request to ${path} failed with HTTP ${res.status}`;

      throw new HippocampusError(res.status, message);
    }

    return (res.json as Record<string, unknown>) ?? {};
  }

  private static queryString(input: ListInput): string {
    const params = new URLSearchParams();

    if (input.group) {
      params.set("group", input.group);
    }

    if (input.significanceMin) {
      params.set("significanceMin", String(input.significanceMin));
    }

    if (input.significanceMax) {
      params.set("significanceMax", String(input.significanceMax));
    }

    if (input.orderBy) {
      params.set("orderBy", input.orderBy);
    }

    if (input.limit) {
      params.set("limit", String(input.limit));
    }

    if (input.offset) {
      params.set("offset", String(input.offset));
    }

    const query = params.toString();

    return query === "" ? "" : "?" + query;
  }

  // health pings the unauthenticated liveness endpoint; it throws on any non-2xx response.
  async health(): Promise<Record<string, unknown>> {
    return this.request(ROUTES.health.method, ROUTES.health.path);
  }

  async storeMemory(input: StoreMemoryInput): Promise<StoreResult> {
    const json = await this.request(ROUTES.storeMemory.method, ROUTES.storeMemory.path, input);

    return { id: String(json.id ?? ""), rejected: json.rejected === true };
  }

  // updateMemory PATCHes an existing memory. A HippocampusError with status 404 means the memory
  // no longer exists (the sleep cycle deleted it) - callers fall back to a fresh store.
  // metadata REPLACES the stored labels wholesale rather than merging with them, so a note whose
  // frontmatter dropped a key has that label removed on the next sync. Passing undefined leaves
  // them untouched, which is why an empty result from resolveMetadata sends clearMetadata instead.
  async updateMemory(
    id: string,
    body: string,
    significance?: number,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.request(ROUTES.updateMemory.method, route(ROUTES.updateMemory.path, id), {
      id,
      body,
      significance,
      metadata,
      clear_metadata: metadata === undefined,
    });
  }

  async deleteMemories(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.request(ROUTES.deleteMemories.method, ROUTES.deleteMemories.path, { ids });
  }

  // linkMemories adds or re-weights links from one memory to others. It is an upsert per pair, so
  // re-declaring a link already held overwrites its weight rather than duplicating it, which is what
  // makes a re-sync of an unchanged note cost nothing but the request.
  //
  // Every target must exist: the service refuses the whole request if one does not, so callers
  // resolve targets against what they know is stored before calling.
  async linkMemories(id: string, links: LinkInput[]): Promise<void> {
    if (links.length === 0) {
      return;
    }

    await this.request(ROUTES.linkMemories.method, route(ROUTES.linkMemories.path, id), {
      id,
      links,
    });
  }

  // unlinkMemories removes the edges between one memory and the named targets. Unknown ids are
  // ignored, and the removal covers BOTH directions between the pair - which is why callers must
  // decide what they own before asking for one.
  async unlinkMemories(id: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.request(
      ROUTES.unlinkMemories.method,
      route(ROUTES.unlinkMemories.path, id),
      { id, ids },
    );
  }

  // getMemoryLinks reads a memory's edges in both directions. Both are asked for deliberately: the
  // inbound half is what tells a caller which of its outbound edges another note also declares, and
  // so must survive a removal.
  async getMemoryLinks(id: string): Promise<LinkEdge[]> {
    const json = await this.request(
      ROUTES.getMemoryLinks.method,
      route(ROUTES.getMemoryLinks.path, id),
    );

    return linksFrom(json);
  }

  async searchMemories(input: SearchMemoriesInput): Promise<MemoryView[]> {
    const json = await this.request(ROUTES.searchMemories.method, ROUTES.searchMemories.path, input);

    return memoriesFrom(json);
  }

  async recallMemories(ids: string[]): Promise<MemoryView[]> {
    const json = await this.request(ROUTES.recallMemories.method, ROUTES.recallMemories.path, { ids });

    return memoriesFrom(json);
  }

  async listMemories(
    input: ListInput,
  ): Promise<{ memories: MemoryView[]; totalCount: number }> {
    const json = await this.request(
      ROUTES.listMemories.method,
      ROUTES.listMemories.path + HippocampusClient.queryString(input),
    );

    return {
      memories: memoriesFrom(json),
      totalCount: toNumber(json.totalCount),
    };
  }

  async storeEvent(input: StoreEventInput): Promise<StoreResult> {
    const json = await this.request(ROUTES.storeEvent.method, ROUTES.storeEvent.path, input);

    return { id: String(json.id ?? ""), rejected: json.rejected === true };
  }

  async listEvents(
    input: ListInput,
  ): Promise<{ events: EventView[]; totalCount: number }> {
    const json = await this.request(
      ROUTES.listEvents.method,
      ROUTES.listEvents.path + HippocampusClient.queryString(input),
    );

    return { events: eventsFrom(json), totalCount: toNumber(json.totalCount) };
  }

  async getSummarisationCandidates(): Promise<SummarisationCandidate[]> {
    const json = await this.request(
      ROUTES.getSummarisationCandidates.method,
      ROUTES.getSummarisationCandidates.path,
    );

    return candidatesFrom(json);
  }
}
