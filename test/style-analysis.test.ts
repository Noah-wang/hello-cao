import assert from "node:assert/strict";
import test from "node:test";
import { parseStyleProfile } from "../src/style-analysis.js";

const validProfile = {
  summary: "短句和冷幽默",
  rules: ["先给结论"],
  commonPatterns: ["偶尔反问"],
  avoid: ["长篇铺垫"],
  inventedExamples: ["这事吧，没想象中玄学。"],
};

test("parseStyleProfile accepts plain or fenced JSON", () => {
  assert.deepEqual(parseStyleProfile(JSON.stringify(validProfile)), validProfile);
  assert.deepEqual(parseStyleProfile(`\`\`\`json\n${JSON.stringify(validProfile)}\n\`\`\``), validProfile);
});

test("parseStyleProfile rejects malformed output", () => {
  assert.throws(() => parseStyleProfile("not json"), /invalid style JSON/i);
  assert.throws(
    () => parseStyleProfile(JSON.stringify({ ...validProfile, rules: "wrong" })),
    /rules/,
  );
});
