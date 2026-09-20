# Hippocampus Memory — Obsidian plugin

[![CI](https://github.com/fastbean-au/hippocampus-obsidian/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/fastbean-au/hippocampus-obsidian/actions/workflows/ci.yaml)
![Dependabot](https://img.shields.io/badge/dependabot-enabled-brightgreen)
[![Known Vulnerabilities](https://snyk.io/test/github/fastbean-au/hippocampus-obsidian/badge.svg)](https://snyk.io/test/github/fastbean-au/hippocampus-obsidian)

Use a [Hippocampus](https://github.com/fastbean-au/hippocampus) instance as a **bounded,
self-consolidating memory layer** for your vault. Store notes (or selections) as memories, search and
recall them from inside a note, and let Hippocampus's sleep/consolidation cycle forget low-value
noise while the high-value facts survive — so an AI assistant working over your vault reads a
distilled memory instead of thousands of raw daily entries.

A personal knowledge base accumulates a long tail of daily notes; most are noise ("fixed typo in
README") and a few are durable facts. Feeding all of it to an assistant bloats the context window
with the noise. Hippocampus keeps what matters — reinforcing notes that get recalled and letting the
rest decay under a finite budget.

## Why the shape fits

- **The link graph is the same idea on both sides.** Obsidian's entire model is `[[wikilinks]]`, and
  Hippocampus raises the effective significance of **both** ends of a link (`log1p`-damped, so a hub
  note cannot become unforgettable by being linked a thousand times). A well-connected note is kept
  for the reason it deserves to be, without anybody assigning it a significance.
- **Reinforcement through recall.** When you — or an assistant — repeatedly reference an old project
  note, recalling it resets its decay clock and raises its effective significance, so it survives.
- **Sleep and consolidation.** Instead of an ever-growing index full of trivial daily logs,
  Hippocampus consolidates low-value memories away and can condense a pile of related-but-quiet
  memories into a single summary. See
  [consolidation](https://github.com/fastbean-au/hippocampus/blob/main/docs/consolidation.md).

## Requirements

- **Hippocampus v0.49.0 or newer**, with the HTTP gateway enabled — set `gateway.port` to a non-zero
  value in its config (the shipped `deploy/compose/config.sqlite.json` uses `8080`; the root
  `config.json` ships with the gateway **disabled** at `0`). See
  [Contract conformance](#contract-conformance) for what that floor means and how it moves.
- **Obsidian 1.4.0 or newer** (`minAppVersion` in `manifest.json`).
- Node.js and npm, only if you are building from source.

The plugin talks to Hippocampus over its **HTTP/JSON `/v1` gateway** using Obsidian's `requestUrl`,
which is not subject to renderer CORS. It needs no gRPC and does not use `hippocampus-mcp` — that is
a separate route for MCP-capable AI assistants, and the two compose over one store: this plugin can
populate memories from your notes while an MCP-based assistant recalls and reinforces them. See the
[MCP server guide](https://github.com/fastbean-au/hippocampus/blob/main/docs/mcp.md).

## Install into a vault

### From a release (recommended)

Each release publishes `main.js`, `manifest.json` and `styles.css` as assets on a GitHub release
tagged with the bare plugin version (e.g. `0.3.0`). Either:

- **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** — add `fastbean-au/hippocampus-obsidian`
  as a beta plugin; BRAT tracks the releases and updates automatically.
- **Manually** — download the three assets from the
  [latest release](https://github.com/fastbean-au/hippocampus-obsidian/releases/latest) into
  `<your-vault>/.obsidian/plugins/hippocampus/`.

Then enable **Hippocampus Memory** under _Settings → Community plugins_.

> **Moving from the monorepo.** Releases up to `0.2.0` were published from
> `fastbean-au/hippocampus`. BRAT has no way to follow that move, so if you added the plugin from
> the old repository, remove it and re-add `fastbean-au/hippocampus-obsidian`.

### From source

```bash
npm install
npm run build     # tsc typecheck + esbuild bundle -> main.js
npm test          # wire parsing, note→memory mapping, and contract conformance
```

`npm run dev` runs esbuild in watch mode. Copy `manifest.json`, `styles.css` and the built `main.js`
into `<your-vault>/.obsidian/plugins/hippocampus/`, then enable the plugin. For development you can
symlink the plugin folder there and rely on `npm run dev`.

## What it does

- **Store note / selection as memory** — significance comes from a `significance:` frontmatter key
  (falling back to a configurable default); the `group` label comes from the note's top-level folder,
  a frontmatter key, or a fixed value; and `metadata` labels come from a named list of frontmatter
  keys plus any fixed `key=value` lines. The frontmatter keys are named explicitly rather than copied
  wholesale, so plugin bookkeeping, dates and tag arrays stay out of the labels unless you ask for
  them; awkward keys ("Project Name") are normalised to the service's charset.
- **Search memories and insert results** — content search (built into the service on every storage
  driver; `opensearch.enabled` adds semantic and hybrid modes), optionally reinforcing the matches.
- **Auto-sync a folder** — notes under a configured folder are pushed in as they are edited,
  idempotently (one memory per note path, updated in place, re-created if consolidation has since
  forgotten it). This is what lets the sleep cycle prune the noise: notes you keep touching are
  reinforced and survive; notes you never revisit fade.
- **Mirror the vault's `[[wikilinks]]`** — a synced note's links become links between the memories,
  in both the manual and automatic paths. On by default.

## Contract conformance

The plugin hand-writes every wire shape it touches: `src/routes.ts` names the gateway routes it
calls and `src/types.ts` mirrors the gateway's protojson projection. It imports nothing from the
service's contract and generates nothing from it — which is what keeps it a plain TypeScript project
with no toolchain beyond npm, and what makes a renamed path or a dropped field a runtime 404 rather
than a build failure.

`contract/hippocampus.swagger.json` is the service's generated OpenAPI document, vendored at the
version in `contract/SERVICE_VERSION`, and `test/conformance.test.ts` holds both hand-written
surfaces against it: every route, every field read off a response, every field sent in a request, and
every query parameter. That pinned version is the **minimum service version** this plugin declares.

It moves on its own: when the service cuts a release, `contract-bump.yaml` re-vendors the document
from that tag and opens a pull request carrying the conformance result. A **red** one means the
gateway has moved under the plugin and the plugin needs changing; a green one means this build is
compatible with that release, and merging raises the floor.

## Releasing

The tag **is** the version — bare semver, no `v` prefix, which is what Obsidian's updater and BRAT
key on.

1. Bump `version` in `manifest.json`, `package.json`, and add the matching
   `"<version>": "<minAppVersion>"` entry to `versions.json`.
2. Tag and push:

   ```bash
   git tag 0.3.0 && git push origin 0.3.0
   ```

`release.yaml` validates that the tag agrees with all three files **before** building — a mismatch
fails the run rather than shipping a release the updater cannot match — then builds, runs the full
test suite including conformance, and publishes the release with its three assets.

## Configure

Open _Settings → Hippocampus Memory_:

- **Server URL** — e.g. `http://127.0.0.1:8080`.
- **Bearer token** — only if the service has auth enabled; sent as `Authorization: Bearer <token>`.
- **Default significance** and **significance frontmatter key** — a note's `significance:`
  frontmatter overrides the default; higher significance survives longer.
- **Group source** — how a memory's `group` label is derived: the note's top-level folder, a
  frontmatter key, or a fixed value.
- **Strip frontmatter from body** — drop a note's leading YAML before storing it.
- **Search** — result limit and whether searching also _reinforces_ (recalls) the matches.
- **Auto-sync** — see below.
- **Mirror wikilinks** and **link weight** — see [Wikilinks](#wikilinks).

Use **Test connection** to confirm the URL/token reach a live gateway.

## Commands

| Command                                | What it does                                                                     |
| :------------------------------------- | :------------------------------------------------------------------------------- |
| **Store current note as memory**       | Store (or idempotently update) the active note as one memory, keyed by its path. |
| **Store selection as memory**          | Store the current editor selection as a standalone memory.                       |
| **Search memories and insert results** | Prompt for a query, search the content index, insert the matches at the cursor.  |
| **Sync folder now**                    | Run the auto-sync pass once over the configured folder.                          |
| **Test connection**                    | Ping `/healthz`.                                                                 |

"Search" runs a keyword search over the service's content index, which every storage driver
carries by default — `opensearch.enabled` is not required for it.

## Auto-sync

When enabled, notes under the configured **sync folder** (empty = whole vault) are pushed into
Hippocampus as you edit them, debounced per note. Sync is **idempotent**: the plugin remembers each
note's memory id (in its saved data) and updates that memory on re-save rather than creating
duplicates. Renames follow the note; deletes remove the memory. If the consolidation cycle has
already forgotten a note's memory, the next sync re-creates it.

This lets the decay cycle do its job: reinforced/important notes persist, while notes you never
touch again fade under the store's capacity budget.

## Wikilinks

A synced note's `[[wikilinks]]` become links between the memories, which is the part of the mapping
that actually matters to how long a note is kept: Hippocampus raises the effective significance of
**both** ends of a link, `log1p`-damped, so a heavily-linked note is exactly the note the decay model
should hold on to. Without this a synced vault is a set of isolated memories decaying as though the
vault had no structure at all.

It is **on by default** and costs one extra read per synced note, plus a write only when the links
have changed. Turn off **Mirror wikilinks** if you would rather not pay that.

What to expect:

- **A link to a note that does not exist yet is ignored**, silently. Writing `[[Some Idea]]` before
  the note exists is ordinary Obsidian, not an error — the edge appears once that note is synced.
- **Embeds count.** `![[Note]]` is the strongest statement one note makes about another, and
  Obsidian's own graph draws it.
- Aliases and subpaths do not change which note is linked: `[[Note|as shown]]`, `[[Note#Section]]`
  and `[[Note#^block]]` all link `Note`. A link within the same note (`[[#Section]]`) is not a link.
- **Resolution is Obsidian's own**, so shortest-path names, relative paths and folder notes behave
  exactly as they do in the editor, and a wikilink inside a code fence is not a link.
- **Deleting a wikilink removes the edge** — otherwise the graph only ever grows, and a note nothing
  links to any more stays propped up by edges describing a vault that no longer exists. The one
  exception: if the note at the other end links back, the edge stays, because it is still that note's
  to declare.
- **Link weight** is the significance each edge carries (5 by default). It is summed across a note's
  links and then damped, so raising it moves the needle far less than the number suggests.
- The service caps an item at **128 links in either direction**. A hub note past that has its extra
  links dropped, keeping the ones written first; a note whose _inbound_ links alone exceed the cap
  has its link writes refused, which the plugin logs to the developer console and otherwise ignores.

**Sync folder now** does this in two passes — every note is stored, then every note's links are
resolved — because a vault always contains a link whose target is written later.

## TLS / localhost note

`requestUrl` trusts only the operating system's certificate store and has **no**
`insecureSkipVerify` equivalent. Use plaintext `http://` against localhost, or put the gateway
behind a properly CA-signed certificate (or a TLS-terminating reverse proxy). A self-signed cert the
OS does not trust will not work from the plugin.
