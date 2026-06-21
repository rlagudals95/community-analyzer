import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("crawler CLI", () => {
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
});
