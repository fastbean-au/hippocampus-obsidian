// Projection of hippocampus-client's generated messages into the plugin's plain shapes. Kept free of
// any Obsidian import so it can be unit-tested directly.
//
// The decoding this file used to do - camelCase names, int64 fields as JSON strings, enums by name -
// is now the shared client's, done against the contract's own descriptor. What is left is the
// narrowing: bigint to number (every value here is a UnixNano time or a count, well inside 2^53 for
// a count and precise enough for a time), and the tri-state and direction enums to booleans.

import { Bool, LinkDirection } from "hippocampus-client";
import type { GetLinksResponse, GetMemoriesResponse, Memory } from "hippocampus-client";

import type { LinkEdge, MemoryView } from "./types";

export function toMemoryView(memory: Memory): MemoryView {
  return {
    id: memory.id,
    body: memory.body,
    significance: memory.significance,
    eventId: memory.eventId,
    group: memory.group,
    timeStamp: Number(memory.timeStamp),
    timeRecalled: Number(memory.timeRecalled),
    recallCount: memory.recallCount,
    isSummary: memory.isSummary,
    // A tri-state on the wire; only TRUE is binary, UNSPECIFIED and FALSE both mean text.
    isBinary: memory.isBinary === Bool.TRUE,
  };
}

export function memoryViewsFrom(response: GetMemoriesResponse): MemoryView[] {
  return response.memories.map(toMemoryView);
}

// linkEdgesFrom narrows a GetLinksResponse. Only OUTBOUND means this end declared the link; anything
// else - INBOUND, BOTH, or an unset value - is read as not ours, which is the safe reading, since the
// delta only ever removes an edge it believes it owns.
export function linkEdgesFrom(response: GetLinksResponse): LinkEdge[] {
  return response.links.map((edge) => ({
    id: edge.id,
    significance: edge.significance,
    outbound: edge.direction === LinkDirection.OUTBOUND,
  }));
}
