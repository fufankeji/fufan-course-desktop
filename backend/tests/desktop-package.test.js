import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkDesktopEnvironment,
  copyDesktopResources,
  prepareNodeSidecar,
  sidecarBinaryName,
  targetTripleFromRustc,
  tuiBinaryNameForTarget,
} from "../../scripts/desktop-package.mjs";

test("desktop resource staging copies runtime assets but excludes local sqlite secrets", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-desktop-fixture-"));
  const sourceRoot = path.join(fixture, "source");
  const stagingRoot = path.join(fixture, "src-tauri", "resources");

  await fs.mkdir(path.join(sourceRoot, "backend", "server"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "knowledge"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "runtime-packs", "context-engineering"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "runtime", "bin"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "data"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "frontend"), { recursive: true });

  await fs.writeFile(path.join(sourceRoot, "backend", "server", "index.js"), "server");
  await fs.writeFile(path.join(sourceRoot, "backend", "knowledge", "manifest.json"), "{}");
  await fs.writeFile(path.join(sourceRoot, "backend", "runtime-packs", "context-engineering", "manifest.json"), "{}");
  await fs.writeFile(path.join(sourceRoot, "backend", "runtime", "bin", "codewhale-tui"), "binary");
  await fs.writeFile(path.join(sourceRoot, "backend", "data", "settings.sqlite"), "secret");
  await fs.writeFile(path.join(sourceRoot, "frontend", "index.html"), "<main></main>");

  const result = await copyDesktopResources({ projectRoot: sourceRoot, stagingRoot });

  assert.equal(result.backendDataIncluded, false);
  assert.equal(
    await fs.readFile(path.join(stagingRoot, "backend", "server", "index.js"), "utf8"),
    "server",
  );
  assert.equal(
    await fs.readFile(path.join(stagingRoot, "backend", "runtime", "bin", "codewhale-tui"), "utf8"),
    "binary",
  );
  assert.equal(await pathExists(path.join(stagingRoot, "backend", "data", "settings.sqlite")), false);
  assert.equal(await pathExists(path.join(stagingRoot, "frontend", "index.html")), true);
});

test("desktop resource staging copies the Windows FuFan Agent runtime name", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-desktop-windows-fixture-"));
  const sourceRoot = path.join(fixture, "source");
  const stagingRoot = path.join(fixture, "src-tauri", "resources");

  await fs.mkdir(path.join(sourceRoot, "backend", "server"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "knowledge"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "runtime-packs", "context-engineering"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "backend", "runtime", "bin"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "frontend"), { recursive: true });

  await fs.writeFile(path.join(sourceRoot, "backend", "server", "index.js"), "server");
  await fs.writeFile(path.join(sourceRoot, "backend", "knowledge", "manifest.json"), "{}");
  await fs.writeFile(path.join(sourceRoot, "backend", "runtime-packs", "context-engineering", "manifest.json"), "{}");
  await fs.writeFile(path.join(sourceRoot, "backend", "runtime", "bin", "codewhale-tui.exe"), "MZ windows runtime");
  await fs.writeFile(path.join(sourceRoot, "frontend", "index.html"), "<main></main>");

  const result = await copyDesktopResources({
    projectRoot: sourceRoot,
    stagingRoot,
    targetTriple: "x86_64-pc-windows-msvc",
  });

  assert.match(result.tuiTarget, /codewhale-tui\.exe$/);
  assert.equal(
    await fs.readFile(path.join(stagingRoot, "backend", "runtime", "bin", "codewhale-tui.exe"), "utf8"),
    "MZ windows runtime",
  );
  assert.equal(await pathExists(path.join(stagingRoot, "backend", "runtime", "bin", "codewhale-tui")), false);
});

test("sidecar binary names match Tauri externalBin target naming", () => {
  assert.equal(sidecarBinaryName("fufan-node", "aarch64-apple-darwin"), "fufan-node-aarch64-apple-darwin");
  assert.equal(sidecarBinaryName("fufan-node", "x86_64-pc-windows-msvc"), "fufan-node-x86_64-pc-windows-msvc.exe");
});

test("FuFan Agent runtime binary names match desktop targets", () => {
  assert.equal(tuiBinaryNameForTarget("aarch64-apple-darwin"), "codewhale-tui");
  assert.equal(tuiBinaryNameForTarget("x86_64-pc-windows-msvc"), "codewhale-tui.exe");
});

test("rustc target triple parser reads host line", () => {
  assert.equal(
    targetTripleFromRustc("release: 1.78.0\nhost: aarch64-apple-darwin\nLLVM version: 18.1.2\n"),
    "aarch64-apple-darwin",
  );
});

test("tauri bundle config uses staged resources and node sidecar", async () => {
  const configPath = path.resolve("src-tauri", "tauri.conf.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));

  assert.deepEqual(config.bundle.resources, ["resources/backend", "resources/frontend"]);
  assert.deepEqual(config.bundle.externalBin, ["binaries/fufan-node"]);
});

test("desktop doctor reports missing packaging prerequisites", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-desktop-doctor-"));
  await fs.mkdir(path.join(root, "src-tauri", "binaries"), { recursive: true });

  const report = await checkDesktopEnvironment({
    projectRoot: root,
    targetTriple: "aarch64-apple-darwin",
    commandExists: async (command) => command === "rustc",
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.rust.ok, true);
  assert.equal(report.checks.tauriCli.ok, false);
  assert.equal(report.checks.resources.ok, false);
  assert.equal(report.checks.nodeSidecar.ok, false);
  assert.ok(report.nextSteps.some((step) => step.includes("npm install")));
  assert.ok(report.nextSteps.some((step) => step.includes("npm run prepare:desktop")));
});

test("desktop doctor accepts TAURI_CLI override", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-desktop-doctor-env-"));
  const tauriCli = path.join(root, "tauri.js");
  await fs.writeFile(tauriCli, "#!/usr/bin/env node\n");

  const report = await checkDesktopEnvironment({
    projectRoot: root,
    targetTriple: "aarch64-apple-darwin",
    env: { TAURI_CLI: tauriCli },
    commandExists: async (command) => command === "rustc",
  });

  assert.equal(report.checks.tauriCli.ok, true);
  assert.equal(report.checks.tauriCli.source, "env");
});

test("windows sidecar preparation rejects non-Windows node binaries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-windows-sidecar-"));
  const fakeMacNode = path.join(root, "node");
  await fs.writeFile(fakeMacNode, "not a windows executable");

  await assert.rejects(
    () =>
      prepareNodeSidecar({
        projectRoot: root,
        nodeBin: fakeMacNode,
        targetTriple: "x86_64-pc-windows-msvc",
      }),
    /Windows Node executable/,
  );
});

test("windows sidecar preparation accepts a node.exe input", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fufan-windows-sidecar-ok-"));
  const fakeWindowsNode = path.join(root, "node.exe");
  await fs.writeFile(fakeWindowsNode, "MZ fake windows executable");

  const result = await prepareNodeSidecar({
    projectRoot: root,
    nodeBin: fakeWindowsNode,
    targetTriple: "x86_64-pc-windows-msvc",
  });

  assert.match(result.targetPath, /fufan-node-x86_64-pc-windows-msvc\.exe$/);
  assert.equal(await fs.readFile(result.targetPath, "utf8"), "MZ fake windows executable");
});

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
