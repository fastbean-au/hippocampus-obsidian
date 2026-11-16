// Plain shapes the plugin works with.
//
// The views are projections of the generated messages hippocampus-client returns (parse.ts does the
// projecting): int64 fields arrive there as bigint and enums as numbers, and the plugin wants plain
// numbers and booleans. The inputs are the subset of each request the plugin sends; each is
// assignable to the generated request type, so the compiler holds them to the contract.

export interface MemoryView {
  id: string;
  body: string;
  significance: number;
  eventId: string;
  group: string;
  timeStamp: number;
  timeRecalled: number;
  recallCount: number;
  isSummary: boolean;
  isBinary: boolean;
}

export interface StoreResult {
  id: string;
  rejected: boolean;
}

// LinkEdge is one edge of the link graph, as GetMemoryLinks reports it. direction is an enum on the
// wire (OUTBOUND/INBOUND); parse.ts flattens it to a boolean, which is all the plugin needs -
// whether this end declared the link.
export interface LinkEdge {
  id: string;
  significance: number;
  outbound: boolean;
}

// Input shapes for the write endpoints. Timestamps are deliberately omitted so the server stamps
// them "now", which is what a note being synced means.

export interface StoreMemoryInput {
  body: string;
  significance?: number;
  group?: string;
  eventId?: string;
  metadata?: Record<string, string>;
}

export interface SearchMemoriesInput {
  query: string;
  limit?: number;
  group?: string;
  eventId?: string;
  reinforce?: boolean;
}

// LinkInput is one link to write: a target and the weight the edge carries. The weight is a plain
// number rather than part of the significance registry, so it is never ranked against a memory's.
export interface LinkInput {
  id: string;
  significance: number;
}
