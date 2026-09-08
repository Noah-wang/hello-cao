import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export interface UsageSnapshot {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unknownUsageRequests: number;
  estimatedCostCny: number;
  updatedAt: string | null;
}

const EMPTY_USAGE: UsageSnapshot = {
  requests: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  unknownUsageRequests: 0,
  estimatedCostCny: 0,
  updatedAt: null,
};

function validCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export class UsageStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  private async load(): Promise<UsageSnapshot> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as Partial<UsageSnapshot>;
      return {
        requests: validCount(value.requests),
        promptTokens: validCount(value.promptTokens),
        completionTokens: validCount(value.completionTokens),
        totalTokens: validCount(value.totalTokens),
        unknownUsageRequests: validCount(value.unknownUsageRequests),
        estimatedCostCny:
          typeof value.estimatedCostCny === "number" &&
          Number.isFinite(value.estimatedCostCny) &&
          value.estimatedCostCny >= 0
            ? value.estimatedCostCny
            : 0,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      };
    } catch {
      return { ...EMPTY_USAGE };
    }
  }

  record(usage?: TokenUsage, estimatedCostCny?: number): Promise<void> {
    const operation = this.queue.then(async () => {
      const current = await this.load();
      const promptTokens = validCount(usage?.promptTokens);
      const completionTokens = validCount(usage?.completionTokens);
      const reportedTotal = validCount(usage?.totalTokens);
      const hasUsage = usage !== undefined &&
        [usage.promptTokens, usage.completionTokens, usage.totalTokens].some(
          (value) => typeof value === "number",
        );
      const next: UsageSnapshot = {
        requests: current.requests + 1,
        promptTokens: current.promptTokens + promptTokens,
        completionTokens: current.completionTokens + completionTokens,
        totalTokens: current.totalTokens + (reportedTotal || promptTokens + completionTokens),
        unknownUsageRequests: current.unknownUsageRequests + (hasUsage ? 0 : 1),
        estimatedCostCny:
          current.estimatedCostCny +
          (typeof estimatedCostCny === "number" && Number.isFinite(estimatedCostCny)
            ? Math.max(0, estimatedCostCny)
            : 0),
        updatedAt: new Date().toISOString(),
      };

      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.path);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async snapshot(): Promise<UsageSnapshot> {
    await this.queue;
    return this.load();
  }
}

export function formatUsage(snapshot: UsageSnapshot): string {
  const unknown = snapshot.unknownUsageRequests
    ? `\n未返回 Token 数据的请求：${snapshot.unknownUsageRequests}`
    : "";
  return [
    `累计请求：${snapshot.requests}`,
    `输入 Token：${snapshot.promptTokens}`,
    `输出 Token：${snapshot.completionTokens}`,
    `总 Token：${snapshot.totalTokens}`,
    `预估消费：¥${snapshot.estimatedCostCny.toFixed(6)}${unknown}`,
  ].join("\n");
}
