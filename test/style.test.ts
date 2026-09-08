import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildStylePrompt, loadStyleDescription, loadSystemPrompt } from "../src/style.js";

test("loadStyleDescription uses a generated profile", () => {
  const directory = mkdtempSync(join(tmpdir(), "hello-cao-style-"));
  const path = join(directory, "profile.json");
  writeFileSync(
    path,
    JSON.stringify({
      summary: "自然短句",
      rules: ["先说结论"],
      commonPatterns: [],
      avoid: ["正式公文语气"],
      inventedExamples: ["这就很直接了。"],
    }),
  );
  const description = loadStyleDescription(path, "fallback");
  assert.match(description, /自然短句/);
  assert.match(description, /先说结论/);
  assert.match(description, /避免：正式公文语气/);
});

test("loadStyleDescription falls back when no profile exists", () => {
  assert.equal(loadStyleDescription("/missing/profile.json", "fallback"), "fallback");
});

test("system prompt template receives the generated style profile", () => {
  assert.equal(
    buildStylePrompt(
      "短句",
      "身份设定\n{{STYLE_PROFILE}}\n{{USER_TITLE_GUIDANCE}}",
      "老张",
    ),
    "身份设定\n短句\n本轮提问者配置的称谓是“老张”。只在语境自然、确实有交流作用时使用。",
  );
});

test("system prompt tells the model not to invent an unknown title", () => {
  assert.match(
    buildStylePrompt("短句", "{{STYLE_PROFILE}}\n{{USER_TITLE_GUIDANCE}}"),
    /没有配置称谓，不要创造称谓/,
  );
});

test("system prompt requires the title for suspicious requests", () => {
  const prompt = buildStylePrompt(
    "短句",
    "{{STYLE_PROFILE}}\n{{USER_TITLE_GUIDANCE}}",
    "老张",
    true,
  );
  assert.match(prompt, /必须在回复中自然地使用至少一次该称谓/);
  assert.match(prompt, /老张/);
});

test("loadSystemPrompt reads a non-empty prompt", () => {
  const directory = mkdtempSync(join(tmpdir(), "hello-cao-prompt-"));
  const path = join(directory, "prompt.md");
  writeFileSync(path, "  角色设定  \n");
  assert.equal(loadSystemPrompt(path), "角色设定");
});

test("production system prompt keeps the cold-humor guidance", () => {
  const prompt = loadSystemPrompt(resolve("config/system-prompt.md"));
  assert.match(prompt ?? "", /中等强度的冷幽默/);
  assert.match(prompt ?? "", /不能变成人身攻击/);
  assert.match(prompt ?? "", /严肃、安全或对方明显难过的场景要降低幽默强度/);
});

test("production system prompt avoids moralizing and keeps concise refusals", () => {
  const prompt = loadSystemPrompt(resolve("config/system-prompt.md"));
  assert.match(prompt ?? "", /保持很低的道德评判感/);
  assert.match(prompt ?? "", /不主动上价值/);
  assert.match(prompt ?? "", /一两句简短说明/);
  assert.match(prompt ?? "", /现实伤害、违法操作、诈骗、隐私侵犯/);
});
