import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWebContext,
  searchWeb,
  shouldAnswerSeriously,
  shouldSearchWeb,
} from "../src/web-search.js";

test("search router detects explicit and time-sensitive questions", () => {
  assert.equal(shouldSearchWeb("帮我查一下 DeepSeek 价格"), true);
  assert.equal(shouldSearchWeb("今天有什么新闻"), true);
  assert.equal(shouldSearchWeb("蒸桑拿有什么好处"), true);
  assert.equal(shouldSearchWeb("美国马拉松记录是多少"), true);
  assert.equal(shouldSearchWeb("东北100什么时候开始"), true);
  assert.equal(shouldSearchWeb("Amex点数转到哪个航空公司最值"), true);
  assert.equal(shouldSearchWeb("讲个冷笑话"), false);
});

test("serious-answer router catches factual and health questions", () => {
  assert.equal(shouldAnswerSeriously("蒸桑拿有什么好处"), true);
  assert.equal(shouldAnswerSeriously("美国马拉松记录是多少"), true);
  assert.equal(shouldAnswerSeriously("东北100什么时候开始"), true);
  assert.equal(shouldAnswerSeriously("讲个冷笑话"), false);
});

test("searchWeb calls Monid Exa and normalizes sources", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      status: "COMPLETED",
      output: {
        results: [{
          title: "官方页面",
          url: "https://example.com/docs",
          text: "页面正文",
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const sources = await searchWeb("测试", { apiKey: "test-key", fetchImpl: fakeFetch });
  assert.equal((requestBody?.provider as string), "exa");
  assert.equal((requestBody?.endpoint as string), "/search");
  assert.equal((requestBody?.input as { numResults: number }).numResults, 3);
  assert.deepEqual(sources, [{
    title: "官方页面",
    url: "https://example.com/docs",
    text: "页面正文",
  }]);
  assert.match(formatWebContext(sources), /\[1\] 官方页面/);
});
