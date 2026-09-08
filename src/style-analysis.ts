export interface StyleProfile {
  summary: string;
  rules: string[];
  commonPatterns: string[];
  avoid: string[];
  inventedExamples: string[];
  generatedAt?: string;
  sourceMessageCount?: number;
}

interface AnalysisConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid style profile field: ${field}`);
  }
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

export function parseStyleProfile(raw: string): StyleProfile {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new Error("LLM returned invalid style JSON");
  }
  if (!value || typeof value !== "object") throw new Error("Invalid style profile");

  const profile = value as Record<string, unknown>;
  if (typeof profile.summary !== "string" || !profile.summary.trim()) {
    throw new Error("Invalid style profile field: summary");
  }
  return {
    summary: profile.summary.trim(),
    rules: stringArray(profile.rules, "rules"),
    commonPatterns: stringArray(profile.commonPatterns, "commonPatterns"),
    avoid: stringArray(profile.avoid, "avoid"),
    inventedExamples: stringArray(profile.inventedExamples, "inventedExamples"),
  };
}

async function requestJson(
  system: string,
  user: string,
  config: AnalysisConfig,
): Promise<StyleProfile> {
  const request = config.fetchImpl ?? fetch;
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await request(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message ?? `LLM request failed (${response.status})`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty style analysis");
  return parseStyleProfile(content);
}

const PROFILE_SCHEMA = `只输出 JSON：
{
  "summary": "一句话风格总结",
  "rules": ["可执行的措辞规则"],
  "commonPatterns": ["反复出现的语言模式"],
  "avoid": ["该风格通常不会采用的表达"],
  "inventedExamples": ["体现风格但不是原文的虚构短例句"]
}`;

export async function analyzeStyleBatch(
  messages: string[],
  config: AnalysisConfig,
): Promise<StyleProfile> {
  const system = [
    "你是语言风格分析器，只分析表达方式，不推断身份、人格、事实、观点、关系或私人经历。",
    "输入已经过基础清洗。不要在输出中复述或保存原句；示例必须是新写的虚构句子。",
    "只记录在多条消息中稳定出现的特征，不要把讨论主题当成风格。",
    PROFILE_SCHEMA,
  ].join("\n");
  const numbered = messages.map((message, index) => `${index + 1}. ${message}`).join("\n");
  return requestJson(system, `分析以下消息的语言风格：\n${numbered}`, config);
}

export async function mergeStyleProfiles(
  profiles: StyleProfile[],
  config: AnalysisConfig,
): Promise<StyleProfile> {
  const system = [
    "你是语言风格分析器。合并多个分批分析，只保留跨批次稳定出现的表达特征。",
    "不得加入身份、经历、观点、关系或私人事实。虚构例句不得复制输入中可能出现的原句。",
    PROFILE_SCHEMA,
  ].join("\n");
  return requestJson(system, JSON.stringify(profiles), config);
}
