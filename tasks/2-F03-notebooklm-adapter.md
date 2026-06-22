# 2-F03 — NotebookLM-MCP adapter

- **Wave:** 2-foundation · **Module:** knowledge · **Lang:** Go · **Depends on:** 2-F01

## Goal
Implement `knowledge.Source` against an (unofficial) **NotebookLM MCP** server (spec §4 — prototype path). Isolated so it can be swapped for the official API later.

## Owns
- `backend/internal/knowledge/notebooklm/notebooklm.go`
- `backend/internal/knowledge/notebooklm/mcp_client.go`

## Steps
1. Connect to the MCP server (config: endpoint); map StudyRover calls to NotebookLM source ingestion + quiz/flashcard/guide generation.
2. Tolerate undocumented-endpoint breakage with clear errors (it's ToS-gray/prototype).

## Acceptance
- [ ] Satisfies `Source`; unit-tested against a stub MCP server. Marked experimental in docs.
