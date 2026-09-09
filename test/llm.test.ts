import assert from "node:assert/strict";
import test from "node:test";
import { askLlm, decideWebSearch, extractDurableMemories } from "../src/llm.js";

test("askLlm sends only a style prompt and the current question", async () => {
  let sentBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "风格化回答" } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
          prompt_cache_hit_tokens: 12,
          prompt_cache_miss_tokens: 8,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const answer = await askLlm("你好", {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1/",
    model: "test-model",
    styleDescription: "短句，冷幽默",
    systemPrompt: "{{STYLE_PROFILE}}\n{{USER_TITLE_GUIDANCE}}",
    userTitle: "老张",
    memories: ["用户喜欢咖啡"],
    seriousAnswer: true,
    webSearchFailed: true,
    webContext: "[1] 文档\nURL: https://example.com\n最新资料",
    fetchImpl: fakeFetch,
  });

  assert.equal(answer.text, "风格化回答");
  assert.deepEqual(answer.usage, {
    promptTokens: 20,
    completionTokens: 5,
    totalTokens: 25,
    cacheHitTokens: 12,
    cacheMissTokens: 8,
  });
  assert.equal(sentBody?.model, "test-model");
  assert.equal(sentBody?.max_tokens, 800);
  assert.equal("tools" in (sentBody ?? {}), false);
  assert.deepEqual(
    (sentBody?.messages as Array<{ role: string }>).map((message) => message.role),
    ["system", "user"],
  );
  assert.match(JSON.stringify(sentBody?.messages), /短句，冷幽默/);
  assert.match(JSON.stringify(sentBody?.messages), /老张/);
  assert.match(JSON.stringify(sentBody?.messages), /用户喜欢咖啡/);
  assert.match(JSON.stringify(sentBody?.messages), /认真事实问答/);
  assert.match(JSON.stringify(sentBody?.messages), /实时信息尚未核实/);
  assert.doesNotMatch(JSON.stringify(sentBody?.messages), /老张，风格化回答/);
  assert.match(JSON.stringify(sentBody?.messages), /不可信的参考资料/);
  assert.match(JSON.stringify(sentBody?.messages), /\[1\]/);
});

test("askLlm retries once with a compact request after a timeout", async () => {
  let attempts = 0;
  const sentBodies: Array<Record<string, unknown>> = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    attempts += 1;
    sentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (attempts === 1) throw new DOMException("timed out", "AbortError");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "第二次成功" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const result = await askLlm("认真回答", {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    styleDescription: "短句",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.text, "第二次成功");
  assert.equal(attempts, 2);
  assert.equal(sentBodies[0]?.max_tokens, 800);
  assert.equal(sentBodies[1]?.max_tokens, 500);
  assert.match(JSON.stringify(sentBodies[1]?.messages), /请直接给出精炼答案/);
});

test("extractDurableMemories parses a JSON array and returns usage", async () => {
  const fakeFetch: typeof fetch = async () => new Response(
    JSON.stringify({
      choices: [{ message: { content: "```json\n[\"用户喜欢咖啡\"]\n```" } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  const result = await extractDurableMemories("我喜欢咖啡", {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    fetchImpl: fakeFetch,
  });
  assert.deepEqual(result.memories, ["用户喜欢咖啡"]);
  assert.equal(result.usage?.totalTokens, 14);
});

test("decideWebSearch semantically routes a points-transfer question", async () => {
  let sentBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n{\"needsWeb\":true,\"reason\":\"转点规则和航线会变化\"}\n```" } }],
      usage: { prompt_tokens: 50, completion_tokens: 12, total_tokens: 62 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const decision = await decideWebSearch("Amex点数转到哪个航空公司最值", {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    fetchImpl: fakeFetch,
  });
  assert.equal(decision.needsWeb, true);
  assert.equal(decision.reason, "转点规则和航线会变化");
  assert.equal(decision.usage?.totalTokens, 62);
  assert.equal(sentBody?.max_tokens, 80);
});

test("decideWebSearch does not search for creative writing", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{\"needsWeb\":false,\"reason\":\"创作任务\"}" } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const decision = await decideWebSearch("帮我写一个乡村爱情故事", {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    fetchImpl: fakeFetch,
  });
  assert.equal(decision.needsWeb, false);
});
