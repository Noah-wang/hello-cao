import "dotenv/config";
import { resolve } from "node:path";
import { Client, Events, GatewayIntentBits, Message, PermissionFlagsBits } from "discord.js";
import {
  askLlm,
  decideWebSearch,
  extractDurableMemories,
  LlmTimeoutError,
} from "./llm.js";
import {
  formatMemories,
  isSafeMemoryText,
  mayContainDurableMemory,
  MemoryStore,
  parseMemoryCommand,
} from "./memory.js";
import { extractQuestion, splitDiscordMessage } from "./message.js";
import { loadStyleDescription, loadSystemPrompt } from "./style.js";
import { getUserTitle, loadUserTitles } from "./user-titles.js";
import { formatUsage, UsageStore } from "./usage.js";
import { calculateQwen38FlashCostCny } from "./pricing.js";
import { ensureTitleForSuspiciousReply, isSuspiciousRequest } from "./security.js";
import {
  formatWebContext,
  searchWeb,
  shouldAnswerSeriously,
  shouldSearchWeb,
} from "./web-search.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const config = {
  discordToken: requiredEnv("DISCORD_BOT_TOKEN"),
  llmApiKey: requiredEnv("LLM_API_KEY"),
  llmModel: requiredEnv("LLM_MODEL"),
  llmBaseUrl: process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1",
  styleDescription: loadStyleDescription(
    resolve(process.env.STYLE_PROFILE_PATH?.trim() || "data/style-profile.json"),
    process.env.STYLE_DESCRIPTION?.trim() ||
      "语气自然、简短、带一点冷幽默；先直接回答，再补充必要解释。",
  ),
  systemPrompt: loadSystemPrompt(
    resolve(process.env.SYSTEM_PROMPT_PATH?.trim() || "config/system-prompt.md"),
  ),
  monidApiKey: process.env.MONID_API_KEY?.trim(),
  monidBaseUrl: process.env.MONID_BASE_URL?.trim() || "https://api.monid.ai",
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const userTitles = loadUserTitles(
  resolve(process.env.USER_TITLES_PATH?.trim() || "config/user-titles.json"),
);
const usageStore = new UsageStore(
  resolve(process.env.TOKEN_USAGE_PATH?.trim() || "data/token-usage.json"),
);
const memoryStore = new MemoryStore(
  resolve(process.env.MEMORY_PATH?.trim() || "data/memories.json"),
);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (
    !message.inGuild() ||
    message.author.bot ||
    !client.user ||
    !message.mentions.has(client.user)
  ) {
    return;
  }

  const question = extractQuestion(message.content, client.user.id);
  if (!question) {
    await message.reply("叫我干嘛？把问题一起发过来。" );
    return;
  }

  if (["用量", "token用量", "usage"].includes(question.toLocaleLowerCase())) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("这个统计只给服务器管理员看。" );
      return;
    }
    await message.reply({
      content: formatUsage(await usageStore.snapshot()),
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const memoryCommand = parseMemoryCommand(question);
  if (memoryCommand) {
    if (memoryCommand.type === "list") {
      await message.reply({
        content: formatMemories(await memoryStore.list(message.author.id)),
        allowedMentions: { repliedUser: false },
      });
    } else if (memoryCommand.type === "clear") {
      const removed = await memoryStore.clear(message.author.id);
      await message.reply(`忘了，清掉 ${removed} 条。脑子腾出来了。`);
    } else if (memoryCommand.type === "forget") {
      const removed = await memoryStore.forget(message.author.id, memoryCommand.query);
      await message.reply(removed ? `忘了 ${removed} 条。就当没发生。` : "没找到这段记忆。可能压根没进脑子。");
    } else if (!isSafeMemoryText(memoryCommand.text)) {
      await message.reply("密码、密钥和联系方式这种东西我不记。脑子不是保险柜。");
    } else {
      await memoryStore.remember(message.author.id, memoryCommand.text);
      await message.reply("记住了。以后哪天突然提起来，别说我翻旧账。");
    }
    return;
  }

  let progress: Message | undefined;
  try {
    await message.channel.sendTyping();
    progress = await message.reply({
      content: "⏳ 正在判断怎么回答…",
      allowedMentions: { repliedUser: false },
    });
    const userTitle = getUserTitle(message.author.id, userTitles);
    const memories = (await memoryStore.list(message.author.id)).map((item) => item.text);
    const suspiciousRequest = isSuspiciousRequest(question);
    let seriousAnswer = shouldAnswerSeriously(question);
    let webContext: string | undefined;
    let webSearchFailed = false;
    let needsWeb = shouldSearchWeb(question);
    if (!needsWeb) {
      try {
        const decision = await decideWebSearch(question, {
          apiKey: config.llmApiKey,
          baseUrl: config.llmBaseUrl,
          model: config.llmModel,
        });
        const decisionCostCny = config.llmModel === "qwen3.8-flash"
          ? calculateQwen38FlashCostCny(decision.usage)
          : undefined;
        await usageStore.record(decision.usage, decisionCostCny);
        needsWeb = decision.needsWeb;
        if (needsWeb) seriousAnswer = true;
        console.log(`Web search decision: needsWeb=${needsWeb}, reason=${decision.reason}`);
      } catch (error) {
        console.error("Web search decision failed:", error instanceof Error ? error.message : error);
      }
    }
    if (needsWeb) {
      try {
        if (!config.monidApiKey) throw new Error("Missing required environment variable: MONID_API_KEY");
        await progress.edit("🔎 正在搜索网页…");
        const sources = await searchWeb(question, {
          apiKey: config.monidApiKey,
          baseUrl: config.monidBaseUrl,
        });
        webContext = formatWebContext(sources);
        await progress.edit(`📚 找到 ${sources.length} 个来源，正在整理回答…`);
      } catch (error) {
        webSearchFailed = true;
        console.error("Web search failed:", error instanceof Error ? error.message : error);
        await progress.edit("⚠️ 网页搜索暂时失败，正在用已有知识回答…");
      }
    } else {
      await progress.edit("💭 正在组织回答…");
    }
    const slowNotice = setTimeout(() => {
      void progress?.edit("⏳ 模型响应有点慢，正在再试一次…").catch(() => undefined);
    }, 25_000);
    let result: Awaited<ReturnType<typeof askLlm>>;
    try {
      result = await askLlm(question, {
        apiKey: config.llmApiKey,
        baseUrl: config.llmBaseUrl,
        model: config.llmModel,
        styleDescription: config.styleDescription,
        systemPrompt: config.systemPrompt,
        userTitle,
        forceUserTitle: suspiciousRequest,
        memories,
        webContext,
        seriousAnswer,
        webSearchFailed,
      });
    } finally {
      clearTimeout(slowNotice);
    }

    const estimatedCostCny = config.llmModel === "qwen3.8-flash"
      ? calculateQwen38FlashCostCny(result.usage)
      : undefined;
    await usageStore.record(result.usage, estimatedCostCny);
    console.log(
      `LLM usage: input=${result.usage?.promptTokens ?? "unknown"}, ` +
        `output=${result.usage?.completionTokens ?? "unknown"}, ` +
        `total=${result.usage?.totalTokens ?? "unknown"}, ` +
        `estimatedCostCny=${estimatedCostCny?.toFixed(6) ?? "unavailable"}`,
    );

    const answer = ensureTitleForSuspiciousReply(
      result.text,
      userTitle,
      suspiciousRequest,
    );
    const chunks = splitDiscordMessage(answer);
    await progress.edit({ content: chunks[0], allowedMentions: { repliedUser: false } });
    for (const chunk of chunks.slice(1)) await message.channel.send(chunk);

    if (mayContainDurableMemory(question)) {
      try {
        const extracted = await extractDurableMemories(question, {
          apiKey: config.llmApiKey,
          baseUrl: config.llmBaseUrl,
          model: config.llmModel,
        });
        const extractionCostCny = config.llmModel === "qwen3.8-flash"
          ? calculateQwen38FlashCostCny(extracted.usage)
          : undefined;
        await usageStore.record(extracted.usage, extractionCostCny);
        for (const memory of extracted.memories) {
          if (isSafeMemoryText(memory)) await memoryStore.remember(message.author.id, memory);
        }
      } catch (error) {
        console.error("Memory extraction failed:", error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error("Reply failed:", error instanceof Error ? error.message : error);
    const errorMessage = error instanceof LlmTimeoutError
      ? "模型接口连续超时了，这次没答出来。过会儿再试。"
      : "模型接口这次没响应，过会儿再试。";
    if (progress) await progress.edit(errorMessage);
    else await message.reply(errorMessage);
  }
});

client.login(config.discordToken);
