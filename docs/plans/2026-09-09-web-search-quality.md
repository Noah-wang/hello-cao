# Web Search Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate time-sensitive web results and retry one corrected search before answering.

**Architecture:** Add pure query-intent helpers to the web-search module and an LLM-backed source validator to the LLM module. Orchestrate validation and one retry in the Discord message flow, recording validator usage like every other model call.

**Tech Stack:** TypeScript, Node.js test runner, Discord.js, Monid Exa, OpenAI-compatible chat completions

---

### Task 1: Search-query intent helpers

**Files:**
- Modify: `src/web-search.ts`
- Test: `test/web-search.test.ts`

**Step 1:** Add failing tests for sports post-match and prediction query enrichment.

**Step 2:** Run `npm test -- --test-name-pattern="search query"` and verify failure.

**Step 3:** Implement `buildSearchQuery` and intent metadata with an explicit `YYYY-MM-DD` date.

**Step 4:** Run the focused tests and verify they pass.

### Task 2: Source-quality validator

**Files:**
- Modify: `src/llm.ts`
- Test: `test/llm.test.ts`

**Step 1:** Add failing tests for valid post-match sources and stale pre-match sources with a corrected query.

**Step 2:** Implement a strict JSON validator call with disabled DeepSeek thinking and a short timeout.

**Step 3:** Run focused LLM tests and verify they pass.

### Task 3: One-retry orchestration and prediction fallback

**Files:**
- Modify: `src/index.ts`
- Modify: `src/llm.ts`

**Step 1:** Search with the enriched query, validate results, and record validator Token usage.

**Step 2:** If invalid, update Discord progress and retry Monid exactly once with the corrected query.

**Step 3:** Give the final answer explicit guidance distinguishing factual reports from subjective predictions.

### Task 4: Verify and deploy

**Files:**
- Modify: `README.md`

**Step 1:** Run `npm test`, `npm run typecheck`, and `npm run build`.

**Step 2:** Commit and push the implementation.

**Step 3:** Upload changed runtime files, rebuild, restart PM2, and confirm the Bot is online.

