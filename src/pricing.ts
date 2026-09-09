import { TokenUsage } from "./usage.js";

const PER_MILLION = 1_000_000;

const DEEPSEEK_V4_FLASH_CNY = {
  offPeak: { cacheHitInput: 0.05, cacheMissInput: 1.5, output: 4.5 },
  peak: { cacheHitInput: 0.1, cacheMissInput: 3, output: 9 },
} as const;

export function isDeepSeekPeakTime(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (["Sat", "Sun"].includes(value.weekday)) return false;

  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return (minutes >= 9 * 60 && minutes < 12 * 60) ||
    (minutes >= 14 * 60 && minutes < 18 * 60);
}

export function calculateDeepSeekV4FlashCostCny(
  usage: TokenUsage | undefined,
  date = new Date(),
): number | undefined {
  if (!usage) return undefined;

  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const cacheHitTokens = Math.min(promptTokens, Math.max(0, usage.cacheHitTokens ?? 0));
  const cacheMissTokens = usage.cacheMissTokens === undefined
    ? Math.max(0, promptTokens - cacheHitTokens)
    : Math.min(promptTokens - cacheHitTokens, Math.max(0, usage.cacheMissTokens));
  const unclassifiedInputTokens = Math.max(0, promptTokens - cacheHitTokens - cacheMissTokens);
  const outputTokens = Math.max(0, usage.completionTokens ?? 0);
  const price = isDeepSeekPeakTime(date)
    ? DEEPSEEK_V4_FLASH_CNY.peak
    : DEEPSEEK_V4_FLASH_CNY.offPeak;

  return (
    cacheHitTokens * price.cacheHitInput +
    (cacheMissTokens + unclassifiedInputTokens) * price.cacheMissInput +
    outputTokens * price.output
  ) / PER_MILLION;
}

export function calculateModelCostCny(
  model: string,
  usage: TokenUsage | undefined,
  date = new Date(),
): number | undefined {
  return model === "deepseek-v4-flash"
    ? calculateDeepSeekV4FlashCostCny(usage, date)
    : undefined;
}
