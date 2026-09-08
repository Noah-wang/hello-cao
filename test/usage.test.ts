import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatUsage, UsageStore } from "../src/usage.js";

test("UsageStore persists and accumulates provider token counts", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "hello-cao-usage-")), "usage.json");
  const store = new UsageStore(path);
  await Promise.all([
    store.record({ promptTokens: 10, completionTokens: 4, totalTokens: 14 }, 0.001),
    store.record({ promptTokens: 20, completionTokens: 6, totalTokens: 26 }, 0.002),
  ]);
  const snapshot = await new UsageStore(path).snapshot();
  assert.equal(snapshot.requests, 2);
  assert.equal(snapshot.promptTokens, 30);
  assert.equal(snapshot.completionTokens, 10);
  assert.equal(snapshot.totalTokens, 40);
  assert.equal(snapshot.unknownUsageRequests, 0);
  assert.equal(snapshot.estimatedCostCny, 0.003);
});

test("UsageStore counts requests when provider omits usage", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "hello-cao-usage-")), "usage.json");
  const store = new UsageStore(path);
  await store.record();
  const snapshot = await store.snapshot();
  assert.equal(snapshot.requests, 1);
  assert.equal(snapshot.unknownUsageRequests, 1);
  assert.match(formatUsage(snapshot), /未返回 Token 数据的请求：1/);
  assert.match(formatUsage(snapshot), /预估消费：¥0\.000000/);
});
