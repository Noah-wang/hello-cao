import assert from "node:assert/strict";
import test from "node:test";
import { calculateQwen38FlashCostCny } from "../src/pricing.js";

test("calculates Qwen 3.8 Flash input and output price", () => {
  const cost = calculateQwen38FlashCostCny({
    promptTokens: 1_000_000,
    completionTokens: 100_000,
  });
  assert.equal(cost, 1.3);
});

test("returns undefined when the provider omits usage", () => {
  assert.equal(calculateQwen38FlashCostCny(undefined), undefined);
});
