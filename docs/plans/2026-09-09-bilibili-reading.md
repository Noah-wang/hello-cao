# Bilibili Reading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read Bilibili metadata and Chinese subtitles from Discord mentions, then summarize or answer questions about the video.

**Architecture:** Add a standalone Bilibili integration that parses links, loads the existing COROS TOML credential, validates subtitles, and samples long transcripts. Route detected videos before normal web-search handling and pass a separately labelled video context into the existing LLM call.

**Tech Stack:** TypeScript, Node.js fetch, Discord.js, Bilibili web APIs, Node test runner

---

### Task 1: Parse Bilibili inputs and credentials

**Files:**
- Create: `src/bilibili.ts`
- Create: `test/bilibili.test.ts`
- Modify: `.gitignore`
- Modify: `.env.example`

**Steps:** Add failing tests for full links, short links, naked BV identifiers, question extraction, and TOML credential parsing; implement the minimal parsers; run focused tests.

### Task 2: Fetch and validate video subtitles

**Files:**
- Modify: `src/bilibili.ts`
- Modify: `test/bilibili.test.ts`

**Steps:** Add mocked API tests for metadata, Chinese subtitle selection, missing subtitles, density/timeline validation, and transcript sampling; implement fetch logic; run focused tests.

### Task 3: Route video messages into the LLM

**Files:**
- Modify: `src/index.ts`
- Modify: `src/llm.ts`
- Modify: `test/llm.test.ts`

**Steps:** Detect video before web search, update Discord progress, pass labelled untrusted video context, and add default summary guidance for link-only messages; test prompt construction.

### Task 4: Configure, verify, and deploy

**Files:**
- Modify: `README.md`

**Steps:** Run all tests, typecheck, and build; test one real Bilibili link with the reused credential; upload credential with mode 600; deploy source, rebuild, restart PM2, and verify online status.

