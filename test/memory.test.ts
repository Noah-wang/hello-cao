import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  formatMemories,
  isSafeMemoryText,
  mayContainDurableMemory,
  MemoryStore,
  parseMemoryCommand,
} from "../src/memory.js";

function makeStore(): MemoryStore {
  return new MemoryStore(join(mkdtempSync(join(tmpdir(), "hello-cao-memory-")), "memories.json"));
}

test("parses memory commands", () => {
  assert.deepEqual(parseMemoryCommand("你记得我什么？"), { type: "list" });
  assert.deepEqual(parseMemoryCommand("记住 我喜欢咖啡"), { type: "remember", text: "我喜欢咖啡" });
  assert.deepEqual(parseMemoryCommand("忘记咖啡"), { type: "forget", query: "咖啡" });
  assert.deepEqual(parseMemoryCommand("忘记我"), { type: "clear" });
});

test("detects durable statements and rejects secrets", () => {
  assert.equal(mayContainDurableMemory("我喜欢喝咖啡"), true);
  assert.equal(mayContainDurableMemory("我今天困死了"), false);
  assert.equal(isSafeMemoryText("用户喜欢咖啡"), true);
  assert.equal(isSafeMemoryText("我的 API key 是 abc"), false);
});

test("stores memories per user, deduplicates, forgets, and clears", async () => {
  const store = makeStore();
  await store.remember("u1", "用户喜欢咖啡");
  await store.remember("u1", "用户喜欢咖啡。 ");
  await store.remember("u2", "用户喜欢喝茶");
  assert.equal((await store.list("u1")).length, 1);
  assert.equal((await store.list("u2")).length, 1);
  assert.equal(await store.forget("u1", "咖啡"), 1);
  assert.equal((await store.list("u1")).length, 0);
  assert.equal(await store.clear("u2"), 1);
  assert.equal(formatMemories(await store.list("u2")), "还没记住你的什么东西。脑子目前挺干净。");
});

test("keeps at most thirty memories per user", async () => {
  const store = makeStore();
  for (let index = 0; index < 35; index += 1) {
    await store.remember("u1", `用户偏好编号${index}`);
  }
  const memories = await store.list("u1");
  assert.equal(memories.length, 30);
  assert.equal(memories[0]?.text, "用户偏好编号5");
});
