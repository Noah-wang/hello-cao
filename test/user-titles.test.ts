import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getUserTitle, loadUserTitles } from "../src/user-titles.js";

test("getUserTitle returns the configured title", () => {
  assert.equal(getUserTitle("123456789012345678", {
    "123456789012345678": "老张",
  }), "老张");
});

test("getUserTitle returns undefined for unknown users", () => {
  assert.equal(getUserTitle("100000000000000000", {}), undefined);
});

test("loadUserTitles ignores malformed entries and files", () => {
  const directory = mkdtempSync(join(tmpdir(), "hello-cao-titles-"));
  const path = join(directory, "titles.json");
  writeFileSync(path, JSON.stringify({
    "123456789012345678": " 老张 ",
    invalid: "无效",
    "987654321098765432": 123,
  }));
  assert.deepEqual(loadUserTitles(path), { "123456789012345678": "老张" });
  assert.deepEqual(loadUserTitles(join(directory, "missing.json")), {});
});
