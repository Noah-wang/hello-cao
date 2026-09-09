export interface WebSource {
  title: string;
  url: string;
  text: string;
}

interface MonidConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const SEARCH_TRIGGER = /(?:搜索|搜一下|查一下|查查|最新|今天|今日|现在|目前|实时|近期|新闻|价格|多少钱|汇率|天气|比分|赛程|发布了吗|官网|纪录|记录是多少|世界纪录|全国纪录|美国纪录|什么时候(?:开始|举行|报名)|何时(?:开始|举行|报名)|Amex|信用卡权益|转点|积分兑换|航空里程|航司|航线|(?:比赛|赛事|马拉松|越野赛).*(?:时间|日期|开始|报名)|(?:桑拿|疾病|症状|药物|用药|治疗|体检|血压|血糖|心率|健康).*(?:好处|坏处|作用|风险|怎么办|怎么做|是否|能不能))/iu;

const SERIOUS_TRIGGER = /(?:有什么好处|有什么坏处|为什么|原理|怎么(?:做|办|解决|治疗|使用)|多少|几号|什么时候|何时|纪录|记录|数据|法律|合同|税|投资|价格|医疗|健康|疾病|症状|药物|用药|治疗|体检|血压|血糖|心率|桑拿|比赛|赛事|马拉松|越野赛|代码|编程|数据库|Docker|API)/iu;

export function shouldSearchWeb(question: string): boolean {
  return SEARCH_TRIGGER.test(question);
}

export function shouldAnswerSeriously(question: string): boolean {
  return SERIOUS_TRIGGER.test(question);
}

function normalizeSources(value: unknown): WebSource[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const candidates = [
    object.results,
    (object.data as Record<string, unknown> | undefined)?.results,
    (object.output as Record<string, unknown> | undefined)?.results,
  ].find(Array.isArray) as unknown[] | undefined;
  if (!candidates) return [];

  return candidates
    .map((item): WebSource | null => {
      if (!item || typeof item !== "object") return null;
      const result = item as Record<string, unknown>;
      const url = typeof result.url === "string" ? result.url : "";
      if (!/^https?:\/\//i.test(url)) return null;
      const highlights = Array.isArray(result.highlights)
        ? result.highlights.filter((part): part is string => typeof part === "string").join("\n")
        : "";
      const text = [
        typeof result.summary === "string" ? result.summary : "",
        highlights,
        typeof result.text === "string" ? result.text : "",
      ].filter(Boolean).join("\n").slice(0, 1_000);
      return {
        title: typeof result.title === "string" ? result.title : url,
        url,
        text,
      };
    })
    .filter((source): source is WebSource => source !== null)
    .slice(0, 3);
}

async function waitForRun(
  runId: string,
  request: typeof fetch,
  baseUrl: string,
  apiKey: string,
): Promise<unknown> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const response = await request(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`Monid run polling failed (${response.status})`);
    if (body.status === "COMPLETED") return body.output;
    if (body.status === "FAILED" || body.status === "CANCELLED") {
      throw new Error(`Monid search ${String(body.status).toLocaleLowerCase()}`);
    }
  }
  throw new Error("Monid search timed out");
}

export async function searchWeb(question: string, config: MonidConfig): Promise<WebSource[]> {
  const request = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl || "https://api.monid.ai").replace(/\/$/, "");
  const response = await request(`${baseUrl}/v1/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "exa",
      endpoint: "/search",
      input: {
        query: question,
        type: "auto",
        numResults: 3,
        contents: { text: { maxCharacters: 900 } },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok && response.status !== 202) {
    throw new Error(`Monid search failed (${response.status})`);
  }
  const output = response.status === 202
    ? await waitForRun(String(body.runId || ""), request, baseUrl, config.apiKey)
    : body.output;
  const sources = normalizeSources(output);
  if (!sources.length) throw new Error("Monid search returned no usable sources");
  return sources;
}

export function formatWebContext(sources: WebSource[]): string {
  return sources.map((source, index) => [
    `[${index + 1}] ${source.title}`,
    `URL: ${source.url}`,
    source.text || "（仅有链接和标题）",
  ].join("\n")).join("\n\n");
}
