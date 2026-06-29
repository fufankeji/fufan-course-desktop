import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { copyPackagedResourcesToRuntime, runReleaseSmoke } from "../../scripts/release-smoke.mjs";

test("release smoke copies packaged resources into a writable runtime root", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-release-fixture-"));
  const resourcesRoot = path.join(fixture, "resources");
  const runtimeRoot = path.join(fixture, "runtime");

  await fs.mkdir(path.join(resourcesRoot, "backend", "server"), { recursive: true });
  await fs.mkdir(path.join(resourcesRoot, "backend", "knowledge"), { recursive: true });
  await fs.mkdir(path.join(resourcesRoot, "backend", "runtime-packs", "context-engineering"), { recursive: true });
  await fs.mkdir(path.join(resourcesRoot, "backend", "runtime", "bin"), { recursive: true });
  await fs.mkdir(path.join(resourcesRoot, "frontend"), { recursive: true });

  await fs.writeFile(path.join(resourcesRoot, "backend", "server", "index.js"), "server");
  await fs.writeFile(path.join(resourcesRoot, "backend", "knowledge", "manifest.json"), "{}");
  await fs.writeFile(path.join(resourcesRoot, "backend", "runtime-packs", "context-engineering", "skill-manifest.json"), "{}");
  await fs.writeFile(path.join(resourcesRoot, "backend", "runtime", "bin", "codewhale-tui"), "binary", { mode: 0o755 });
  await fs.writeFile(path.join(resourcesRoot, "frontend", "index.html"), "<main>课程平台</main>");

  const result = await copyPackagedResourcesToRuntime({ resourcesRoot, runtimeRoot });

  assert.equal(await pathExists(path.join(result.backendRoot, "server", "index.js")), true);
  assert.equal(await pathExists(path.join(result.backendRoot, "data")), true);
  assert.equal(await pathExists(path.join(result.backendRoot, "data", "settings.sqlite")), false);
  assert.equal(await fs.readFile(path.join(result.frontendRoot, "index.html"), "utf8"), "<main>课程平台</main>");
});

test("release smoke verifies staged desktop resources without using source backend paths", async () => {
  const result = await runReleaseSmoke({
    resourcesRoot: path.resolve("src-tauri", "resources"),
    runtimeRoot: await fs.mkdtemp(path.join(os.tmpdir(), "fufan-release-runtime-")),
  });

  assert.equal(result.ok, true);
  assert.equal(result.frontend.ok, true);
  assert.equal(result.health.ok, true);
  assert.ok(result.pages.count > 0);
  assert.ok(result.skillPacks.ids.includes("context-engineering"));
  assert.equal(result.terminal.available, true);
  assert.match(result.terminal.binaryPath, /fufan-release-runtime-/);
  assert.equal(result.modelSettings.configured, true);
  assert.match(result.modelSettings.dbPath, /fufan-release-runtime-/);
  assert.equal(result.chat.sourceCount > 0, true);
});

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
