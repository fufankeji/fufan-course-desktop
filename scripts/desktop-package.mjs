#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(__dirname, "..");

export function targetTripleFromRustc(output) {
  const host = String(output || "")
    .split(/\r?\n/)
    .find((line) => line.startsWith("host:"));
  return host ? host.replace("host:", "").trim() : "";
}

export function fallbackTargetTriple(platform = os.platform(), arch = os.arch()) {
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (platform === "win32") {
    return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  }
  if (platform === "linux") {
    return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  }
  throw new Error(`Unsupported desktop build platform: ${platform}/${arch}`);
}

export function sidecarBinaryName(baseName, targetTriple) {
  const suffix = targetTriple.includes("windows") ? ".exe" : "";
  return `${baseName}-${targetTriple}${suffix}`;
}

export function tuiBinaryNameForTarget(targetTriple) {
  return targetTriple.includes("windows") ? "codewhale-tui.exe" : "codewhale-tui";
}

export async function detectTargetTriple() {
  if (process.env.TAURI_TARGET_TRIPLE) return process.env.TAURI_TARGET_TRIPLE;
  try {
    const { stdout } = await execFileAsync("rustc", ["-vV"]);
    return targetTripleFromRustc(stdout) || fallbackTargetTriple();
  } catch {
    return fallbackTargetTriple();
  }
}

export async function copyDesktopResources({
  projectRoot = defaultProjectRoot,
  stagingRoot = path.join(projectRoot, "src-tauri", "resources"),
  targetTriple,
  env = process.env,
} = {}) {
  const triple = targetTriple || (await detectTargetTriple());
  const tuiRuntime = await resolveTuiRuntimeBinary({ projectRoot, targetTriple: triple, env });
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(stagingRoot, "backend", "runtime", "bin"), { recursive: true });

  await copyRequiredDirectory(path.join(projectRoot, "frontend"), path.join(stagingRoot, "frontend"));
  await copyRequiredDirectory(path.join(projectRoot, "backend", "server"), path.join(stagingRoot, "backend", "server"));
  await copyRequiredDirectory(path.join(projectRoot, "backend", "knowledge"), path.join(stagingRoot, "backend", "knowledge"));
  await copyRequiredDirectory(
    path.join(projectRoot, "backend", "runtime-packs"),
    path.join(stagingRoot, "backend", "runtime-packs"),
  );

  const tuiTarget = path.join(stagingRoot, "backend", "runtime", "bin", tuiRuntime.targetName);
  await fs.copyFile(tuiRuntime.sourcePath, tuiTarget);
  await fs.chmod(tuiTarget, 0o755).catch(() => {});

  return {
    stagingRoot,
    targetTriple: triple,
    tuiSource: tuiRuntime.sourcePath,
    tuiTarget,
    backendDataIncluded: await pathExists(path.join(stagingRoot, "backend", "data")),
  };
}

export async function resolveTuiRuntimeBinary({
  projectRoot = defaultProjectRoot,
  targetTriple,
  env = process.env,
} = {}) {
  const targetName = tuiBinaryNameForTarget(targetTriple || (await detectTargetTriple()));
  const configured = env.CODEWHALE_TUI_BINARY || env.FUFAN_AGENT_BINARY;
  const candidates = configured
    ? [path.resolve(projectRoot, configured)]
    : [
        path.join(projectRoot, "backend", "runtime", "bin", targetName),
        path.join(projectRoot, "vendor", "codewhale-edu", "target", "release", targetName),
      ];
  const sourcePath = await firstExistingPath(candidates);

  if (!sourcePath) {
    throw new Error(
      [
        `Missing FuFan Agent runtime binary for ${targetName}.`,
        `Checked: ${candidates.join(", ")}`,
        "Build it with npm run runtime:build or provide CODEWHALE_TUI_BINARY=/path/to/codewhale-tui.",
      ].join(" "),
    );
  }

  return {
    sourcePath,
    targetName,
  };
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

export async function prepareNodeSidecar({
  projectRoot = defaultProjectRoot,
  nodeBin = process.env.NODE_BIN || process.execPath,
  targetTriple,
  sidecarBaseName = "fufan-node",
  binariesRoot = path.join(projectRoot, "src-tauri", "binaries"),
} = {}) {
  const triple = targetTriple || (await detectTargetTriple());
  validateNodeSidecarInput({ nodeBin, targetTriple: triple });
  const targetName = sidecarBinaryName(sidecarBaseName, triple);
  const targetPath = path.join(binariesRoot, targetName);

  await fs.mkdir(binariesRoot, { recursive: true });
  await fs.copyFile(nodeBin, targetPath);
  await fs.chmod(targetPath, 0o755).catch(() => {});

  return {
    nodeBin,
    targetTriple: triple,
    targetPath,
  };
}

export function validateNodeSidecarInput({ nodeBin, targetTriple }) {
  if (targetTriple.includes("windows") && path.basename(nodeBin).toLowerCase() !== "node.exe") {
    throw new Error(
      [
        "Windows Node executable is required for Windows desktop builds.",
        `Received: ${nodeBin}`,
        "Provide NODE_BIN=/path/to/node.exe on a Windows builder or from an official Windows Node distribution.",
      ].join(" "),
    );
  }
}

export async function checkDesktopEnvironment({
  projectRoot = defaultProjectRoot,
  targetTriple,
  env = process.env,
  commandExists: commandExistsImpl = commandExists,
} = {}) {
  const triple = targetTriple || (await detectTargetTriple());
  const localTauriWrapper = path.join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const localTauriBin = path.join(projectRoot, "node_modules", ".bin", "tauri");
  const tauriFromEnv = env.TAURI_CLI && (await pathExists(env.TAURI_CLI));
  const tauriFromLocal = (await pathExists(localTauriWrapper)) || (await pathExists(localTauriBin));
  const tauriFromPath = await commandExistsImpl("tauri");
  const checks = {
    rust: {
      ok: await commandExistsImpl("rustc"),
      label: "Rust toolchain",
    },
    tauriCli: {
      ok: Boolean(tauriFromEnv || tauriFromLocal || tauriFromPath),
      label: "Tauri CLI",
      source: tauriFromEnv ? "env" : tauriFromLocal ? "local" : tauriFromPath ? "path" : "missing",
    },
    resources: {
      ok:
        (await pathExists(path.join(projectRoot, "src-tauri", "resources", "backend", "server", "index.js"))) &&
        (await pathExists(path.join(projectRoot, "src-tauri", "resources", "frontend", "index.html"))),
      label: "Staged desktop resources",
    },
    tuiRuntime: {
      ok: await pathExists(
        path.join(projectRoot, "src-tauri", "resources", "backend", "runtime", "bin", tuiBinaryNameForTarget(triple)),
      ),
      label: `FuFan Agent runtime (${triple})`,
    },
    nodeSidecar: {
      ok: await pathExists(path.join(projectRoot, "src-tauri", "binaries", sidecarBinaryName("fufan-node", triple))),
      label: `Node sidecar (${triple})`,
    },
  };

  const nextSteps = [];
  if (!checks.rust.ok) {
    nextSteps.push("Install Rust from https://rustup.rs, then rerun npm run desktop:doctor.");
  }
  if (!checks.tauriCli.ok) {
    nextSteps.push("Run npm install to install @tauri-apps/cli, or install a compatible Tauri CLI globally.");
  }
  if (!checks.resources.ok || !checks.tuiRuntime.ok || !checks.nodeSidecar.ok) {
    nextSteps.push("Run npm run prepare:desktop to stage resources and prepare the Node sidecar.");
  }

  return {
    ok: Object.values(checks).every((check) => check.ok),
    targetTriple: triple,
    checks,
    nextSteps,
  };
}

export async function printDesktopDoctorReport(options = {}) {
  const report = await checkDesktopEnvironment(options);
  console.log(`Desktop package target: ${report.targetTriple}`);
  for (const check of Object.values(report.checks)) {
    console.log(`${check.ok ? "ok" : "missing"} - ${check.label}`);
  }
  if (report.nextSteps.length) {
    console.log("");
    console.log("Next steps:");
    for (const step of report.nextSteps) console.log(`- ${step}`);
  }
  return report;
}

async function copyRequiredDirectory(source, target) {
  if (!(await pathExists(source))) {
    throw new Error(`Missing required desktop resource: ${source}`);
  }
  await fs.cp(source, target, { recursive: true, force: true });
}

async function commandExists(command) {
  try {
    await execFileAsync(command, ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const command = process.argv[2] || "all";

  if (command === "doctor") {
    const report = await printDesktopDoctorReport();
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  if (command === "resources" || command === "all") {
    const result = await copyDesktopResources();
    console.log(`Desktop resources staged: ${path.relative(defaultProjectRoot, result.stagingRoot)}`);
    console.log(`Local sqlite included: ${result.backendDataIncluded ? "yes" : "no"}`);
  }

  if (command === "sidecars" || command === "all") {
    const result = await prepareNodeSidecar();
    console.log(`Node sidecar prepared: ${path.relative(defaultProjectRoot, result.targetPath)}`);
    console.log(`Target triple: ${result.targetTriple}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
