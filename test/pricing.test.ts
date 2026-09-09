import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDeepSeekV4FlashCostCny,
  calculateModelCostCny,
  isDeepSeekPeakTime,
} from "../src/pricing.js";

const beijingMondayPeak = new Date("2026-09-07T02:00:00Z");
const beijingMondayOffPeak = new Date("2026-09-07T05:00:00Z");

test("detects DeepSeek peak time in Beijing", () => {
  assert.equal(isDeepSeekPeakTime(beijingMondayPeak), true);
  assert.equal(isDeepSeekPeakTime(beijingMondayOffPeak), false);
  assert.equal(isDeepSeekPeakTime(new Date("2026-09-06T02:00:00Z")), false);
});

test("calculates DeepSeek V4 Flash peak price with cache details", () => {
  const cost = calculateDeepSeekV4FlashCostCny({
    promptTokens: 1_000_000,
    completionTokens: 100_000,
    cacheHitTokens: 400_000,
    cacheMissTokens: 600_000,
  }, beijingMondayPeak);
  assert.equal(cost, 2.74);
});

test("treats input as cache miss when the relay omits cache details", () => {
  const cost = calculateDeepSeekV4FlashCostCny({
    promptTokens: 1_000_000,
    completionTokens: 100_000,
  }, beijingMondayOffPeak);
  assert.equal(cost, 1.95);
});

test("only estimates supported models", () => {
  assert.equal(calculateModelCostCny("qwen3.8-flash", { promptTokens: 100 }), undefined);
  assert.equal(calculateModelCostCny("deepseek-v4-flash", undefined), undefined);
});
