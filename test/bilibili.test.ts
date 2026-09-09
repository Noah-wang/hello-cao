import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBilibiliInput,
  parseBilibiliCredentialToml,
  readBilibiliVideo,
  sampleTranscript,
} from "../src/bilibili.js";

test("extracts Bilibili links and the user's question", () => {
  assert.deepEqual(
    extractBilibiliInput("https://www.bilibili.com/video/BV1abc123456/ 这个视频讲了什么"),
    { reference: "https://www.bilibili.com/video/BV1abc123456/", question: "这个视频讲了什么" },
  );
  assert.deepEqual(
    extractBilibiliInput("帮我总结 BV1abc123456"),
    { reference: "BV1abc123456", question: "帮我总结" },
  );
  assert.equal(extractBilibiliInput("普通聊天，没有视频"), undefined);
});

test("extracts a Bilibili short link", () => {
  assert.deepEqual(
    extractBilibiliInput("看看 https://b23.tv/AbCd123"),
    { reference: "https://b23.tv/AbCd123", question: "看看" },
  );
});

test("parses the COROS TOML credential without exposing unrelated fields", () => {
  assert.deepEqual(parseBilibiliCredentialToml(`
[credential]
sessdata = "session-value"
bili_jct = "csrf-value"
buvid3 = "device-value"
updated_at = "ignored"
  `), {
    sessdata: "session-value",
    biliJct: "csrf-value",
    buvid3: "device-value",
  });
});

test("samples the beginning, middle, and end of a long transcript", () => {
  const lines = Array.from({ length: 100 }, (_, index) => `第${index + 1}句-${"内容".repeat(10)}`);
  const sampled = sampleTranscript(lines.join("\n"), 600);
  assert.ok(sampled.length <= 600);
  assert.match(sampled, /第1句/);
  assert.match(sampled, /第50句/);
  assert.match(sampled, /第100句/);
});

test("reads matching Chinese subtitles from Bilibili", async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("web-interface/view")) {
      return Response.json({ code: 0, data: {
        aid: 1, cid: 2, bvid: "BV1abc123456", title: "测试视频", duration: 120,
        desc: "简介", owner: { name: "测试UP" }, pages: [{ cid: 2, duration: 120 }],
      } });
    }
    if (url.includes("player/wbi/v2")) {
      return Response.json({ code: 0, data: { subtitle: { subtitles: [
        { lan: "ai-zh", lan_doc: "中文（自动生成）", subtitle_url: "//example.test/subtitle.json" },
      ] } } });
    }
    if (url.includes("subtitle.json")) {
      return Response.json({ body: Array.from({ length: 30 }, (_, index) => ({
        from: index * 4, to: (index + 1) * 4, content: `字幕第${index + 1}句`,
      })) });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const result = await readBilibiliVideo("BV1abc123456", {
    credential: { sessdata: "s", biliJct: "j", buvid3: "b" },
    fetchImpl: fakeFetch,
  });
  assert.equal(result.info.title, "测试视频");
  assert.equal(result.subtitleAvailable, true);
  assert.match(result.transcript, /字幕第30句/);
});

test("falls back to metadata when a video has no Chinese subtitle", async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("web-interface/view")) {
      return Response.json({ code: 0, data: {
        aid: 1, cid: 2, bvid: "BV1abc123456", title: "无字幕视频", duration: 60,
        desc: "只有简介", owner: { name: "测试UP" }, pages: [{ cid: 2, duration: 60 }],
      } });
    }
    return Response.json({ code: 0, data: { subtitle: { subtitles: [] } } });
  };
  const result = await readBilibiliVideo("BV1abc123456", {
    credential: { sessdata: "s", biliJct: "j", buvid3: "b" },
    fetchImpl: fakeFetch,
  });
  assert.equal(result.subtitleAvailable, false);
  assert.equal(result.transcript, "");
  assert.match(result.subtitleNote, /没有中文字幕/);
});
