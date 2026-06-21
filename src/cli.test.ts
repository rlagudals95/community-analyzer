import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "./cli";

describe("crawler CLI", () => {
  it("maps positional keyword date and count to crawl options", () => {
    const options = parseArgs(["node", "src/cli.ts", "정수기 렌탈", "2025-01-01", "120"]);

    assert.deepEqual(options.keywords, ["정수기 렌탈"]);
    assert.equal(options.cutoffDate, "2025-01-01");
    assert.equal(options.maxPosts, 120);
    assert.equal(options.noCutoff, false);
    assert.equal(
      options.output,
      path.resolve(process.cwd(), "output", "정수기렌탈_2025-01-01까지_120건.csv"),
    );
  });

  it("maps positional keyword and count to latest count-limited crawl options", () => {
    const options = parseArgs(["node", "src/cli.ts", "인터넷 설치", "50"]);

    assert.deepEqual(options.keywords, ["인터넷 설치"]);
    assert.equal(options.noCutoff, true);
    assert.equal(options.maxPosts, 50);
    assert.equal(
      options.output,
      path.resolve(process.cwd(), "output", "인터넷설치_최신_50건.csv"),
    );
  });

  it("accepts post count limit options", () => {
    const result = spawnSync(
      "npx",
      [
        "tsx",
        "src/cli.ts",
        "--max-posts=10",
        "--max-posts-per-site=3",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--max-posts=100/);
    assert.match(result.stdout, /--max-posts-per-site=30/);
  });

  it("rejects invalid post count limits", () => {
    const result = spawnSync(
      "npx",
      ["tsx", "src/cli.ts", "--max-posts=abc", "--help"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--max-posts\/--limit must be a positive number/);
  });
});
