// The gateway routes this plugin calls, and nothing else. Kept free of any Obsidian import - like
// parse.ts beside it - so the contract-conformance suite can read the table without a running app.

// ROUTES is every gateway route this plugin calls, spelled as the OpenAPI document spells it. It
// exists so the contract-conformance suite can hold the set against contract/hippocampus.swagger.json:
// the plugin hand-writes its wire handling and imports nothing from the contract, so a renamed path
// or a changed verb would otherwise reach a user as a 404 at runtime and fail no test anywhere.
//
// Same shape as the service's own auth/authz.go policies table - one declaration, two consumers,
// held together by a test - and for the same reason.
export const ROUTES = {
  health: { method: "GET", path: "/healthz" },
  storeMemory: { method: "POST", path: "/v1/memories" },
  updateMemory: { method: "PATCH", path: "/v1/memories/{id}" },
  deleteMemories: { method: "POST", path: "/v1/memories/delete" },
  linkMemories: { method: "POST", path: "/v1/memories/{id}/links" },
  unlinkMemories: { method: "POST", path: "/v1/memories/{id}/links/delete" },
  getMemoryLinks: { method: "GET", path: "/v1/memories/{id}/links" },
  searchMemories: { method: "POST", path: "/v1/memories/search" },
  recallMemories: { method: "POST", path: "/v1/memories/recall" },
  listMemories: { method: "GET", path: "/v1/memories" },
  storeEvent: { method: "POST", path: "/v1/events" },
  listEvents: { method: "GET", path: "/v1/events" },
  getSummarisationCandidates: {
    method: "GET",
    path: "/v1/summarisation/candidates",
  },
} as const;

// route fills a ROUTES template. The id is percent-encoded because it reaches the gateway as a path
// segment and a memory id is caller-supplied.
export function route(template: string, id: string): string {
  return template.replace("{id}", encodeURIComponent(id));
}
