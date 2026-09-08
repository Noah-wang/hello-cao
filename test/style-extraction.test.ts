import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanAndDedupe,
  HistoricalMessage,
  sampleAcrossTime,
  sanitizeMessage,
} from "../src/style-extraction.js";

test("sanitizeMessage removes contact data, links, and mentions", () => {
  const result = sanitizeMessage(
    "这个解释挺清楚的，找 <@123> 或 test@example.com，电话 13812345678，见 https://example.com",
  );
  assert.equal(result?.includes("test@example.com"), false);
  assert.equal(result?.includes("13812345678"), false);
  assert.equal(result?.includes("<@123>"), false);
  assert.equal(result?.includes("https://"), false);
});

test("sanitizeMessage rejects low-value messages", () => {
  assert.equal(sanitizeMessage("哈哈哈哈"), null);
  assert.equal(sanitizeMessage("ok"), null);
  assert.equal(sanitizeMessage("这确实有点离谱"), "这确实有点离谱");
});

test("cleanAndDedupe removes punctuation-only duplicates", () => {
  const messages: HistoricalMessage[] = [
    { id: "1", content: "这个办法应该可以解决", createdTimestamp: 1 },
    { id: "2", content: "这个办法，应该可以解决！", createdTimestamp: 2 },
  ];
  assert.equal(cleanAndDedupe(messages).length, 1);
});

test("sampleAcrossTime includes the full date range", () => {
  const messages = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    text: `有意义的消息 ${index}`,
    createdTimestamp: index,
  }));
  const sampled = sampleAcrossTime(messages, 5);
  assert.equal(sampled.length, 5);
  assert.equal(sampled[0].createdTimestamp, 0);
  assert.equal(sampled.at(-1)?.createdTimestamp, 99);
});
