import { TokenUsage } from "./usage.js";

const PER_MILLION = 1_000_000;

const QWEN_3_8_FLASH_CNY = {
  input: 1,
  output: 3,
} as const;

export function calculateQwen38FlashCostCny(
  usage: TokenUsage | undefined,
): number | undefined {
  if (!usage) return undefined;

  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const outputTokens = Math.max(0, usage.completionTokens ?? 0);

  return (
    promptTokens * QWEN_3_8_FLASH_CNY.input +
    outputTokens * QWEN_3_8_FLASH_CNY.output
  ) / PER_MILLION;
}
