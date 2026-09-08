import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Client, GatewayIntentBits } from "discord.js";
import { analyzeStyleBatch, mergeStyleProfiles, StyleProfile } from "./style-analysis.js";
import {
  cleanAndDedupe,
  HistoricalMessage,
  makeBatches,
  sampleAcrossTime,
} from "./style-extraction.js";

function requiredValue(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function loadStyleSource(): { channelId?: string; targetUserId?: string } {
  try {
    const path = resolve(process.env.STYLE_SOURCE_PATH?.trim() || "config/style-source.json");
    return JSON.parse(readFileSync(path, "utf8")) as {
      channelId?: string;
      targetUserId?: string;
    };
  } catch {
    return {};
  }
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const styleSource = loadStyleSource();

const config = {
  discordToken: requiredValue("DISCORD_BOT_TOKEN"),
  channelId: requiredValue("STYLE_CHANNEL_ID", styleSource.channelId),
  targetUserId: requiredValue("STYLE_TARGET_USER_ID", styleSource.targetUserId),
  maxMessages: positiveInteger("STYLE_MAX_MESSAGES", 3_000),
  scanLimit: positiveInteger("STYLE_SCAN_LIMIT", 20_000),
  outputPath: resolve(process.env.STYLE_PROFILE_PATH?.trim() || "data/style-profile.json"),
  apiKey: requiredValue("LLM_API_KEY"),
  model: requiredValue("LLM_MODEL"),
  baseUrl: process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1",
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function fetchTargetMessages(): Promise<HistoricalMessage[]> {
  const channel = await client.channels.fetch(config.channelId);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    throw new Error("STYLE_CHANNEL_ID is not a readable text channel");
  }

  const messages: HistoricalMessage[] = [];
  let before: string | undefined;
  let scanned = 0;

  while (scanned < config.scanLimit) {
    const page = await channel.messages.fetch({ limit: 100, before });
    if (page.size === 0) break;
    scanned += page.size;

    for (const message of page.values()) {
      if (message.author.id === config.targetUserId && !message.author.bot) {
        messages.push({
          id: message.id,
          content: message.content,
          createdTimestamp: message.createdTimestamp,
        });
      }
    }
    before = page.last()?.id;
    if (page.size < 100 || !before) break;
    console.log(`Scanned ${scanned} channel messages; matched ${messages.length}.`);
  }

  return messages;
}

function report(profile: StyleProfile): string {
  const section = (title: string, values: string[]) =>
    `## ${title}\n\n${values.map((value) => `- ${value}`).join("\n") || "- 无"}`;
  return [
    "# 风格分析报告",
    "",
    `生成时间：${profile.generatedAt}`,
    `分析消息数：${profile.sourceMessageCount}`,
    "",
    "## 摘要",
    "",
    profile.summary,
    "",
    section("表达规则", profile.rules),
    "",
    section("常见模式", profile.commonPatterns),
    "",
    section("避免使用", profile.avoid),
    "",
    section("虚构示例（非聊天原文）", profile.inventedExamples),
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  await client.login(config.discordToken);
  console.log("Connected to Discord. Reading the configured channel only.");

  const rawMessages = await fetchTargetMessages();
  const cleaned = cleanAndDedupe(rawMessages);
  const sampled = sampleAcrossTime(cleaned, config.maxMessages);
  if (sampled.length < 50) {
    throw new Error(`Only ${sampled.length} useful messages remain; at least 50 are required.`);
  }
  console.log(`Using ${sampled.length} sanitized messages from ${rawMessages.length} matches.`);

  const batches = makeBatches(sampled);
  const partialProfiles: StyleProfile[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    console.log(`Analyzing batch ${index + 1}/${batches.length}...`);
    partialProfiles.push(
      await analyzeStyleBatch(batches[index], {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      }),
    );
  }

  const merged = await mergeStyleProfiles(partialProfiles, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
  const profile: StyleProfile = {
    ...merged,
    generatedAt: new Date().toISOString(),
    sourceMessageCount: sampled.length,
  };

  await mkdir(dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  const examplesPath = resolve(dirname(config.outputPath), "style-examples.json");
  await writeFile(examplesPath, `${JSON.stringify(profile.inventedExamples, null, 2)}\n`, "utf8");
  const reportPath = resolve(dirname(config.outputPath), "style-report.md");
  await writeFile(reportPath, report(profile), "utf8");
  console.log(`Style profile written to ${config.outputPath}`);
  console.log("No raw Discord messages were written to disk.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => client.destroy());
