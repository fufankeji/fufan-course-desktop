import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveTauriCli } from "../../scripts/tauri-runner.mjs";

test("resolveTauriCli prefers TAURI_CLI when provided", async () => {
  const result = await resolveTauriCli({
    env: { TAURI_CLI: "/tmp/custom-tauri" },
    commandExists: async () => true,
  });

  assert.equal(result.command, "/tmp/custom-tauri");
  assert.deepEqual(result.prefixArgs, []);
  assert.equal(result.source, "env");
});

test("resolveTauriCli uses local node_modules wrapper when installed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-tauri-runner-"));
  const wrapper = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
  await fs.mkdir(path.dirname(wrapper), { recursive: true });
  await fs.writeFile(wrapper, "console.log('tauri')");

  const result = await resolveTauriCli({
    projectRoot: root,
    nodeBin: "/usr/local/bin/node",
    commandExists: async () => false,
  });

  assert.equal(result.command, "/usr/local/bin/node");
  assert.deepEqual(result.prefixArgs, [wrapper]);
  assert.equal(result.source, "local");
});

test("resolveTauriCli falls back to global tauri", async () => {
  const result = await resolveTauriCli({
    projectRoot: "/tmp/missing-project",
    commandExists: async (command) => command === "tauri",
  });

  assert.equal(result.command, "tauri");
  assert.deepEqual(result.prefixArgs, []);
  assert.equal(result.source, "path");
});
