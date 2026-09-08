import assert from "node:assert/strict";
import test from "node:test";
import { extractQuestion, splitDiscordMessage } from "../src/message.js";

test("extractQuestion removes normal and nickname mentions", () => {
  assert.equal(extractQuestion("<@123> 你好", "123"), "你好");
  assert.equal(extractQuestion("问一下 <@!123> 天气", "123"), "问一下 天气");
});

test("extractQuestion returns an empty string for a mention only", () => {
  assert.equal(extractQuestion("  <@123>  ", "123"), "");
});

test("splitDiscordMessage respects the requested limit", () => {
  const chunks = splitDiscordMessage("一段比较长的回答 应该被安全切开", 8);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 8));
  assert.equal(chunks.join("" ).replaceAll(" ", ""), "一段比较长的回答应该被安全切开");
});
