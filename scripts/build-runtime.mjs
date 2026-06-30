#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { detectTargetTriple, ptyBridgeBinaryNameForTarget, tuiBinaryNameForTarget } from "./desktop-package.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  const targetTriple = await detectTargetTriple();
  const binRoot = path.join(projectRoot, "backend", "runtime", "bin");
  await fs.mkdir(binRoot, { recursive: true });

  await run(
    "cargo",
    [
      "build",
      "--manifest-path",
      path.join(projectRoot, "vendor", "codewhale-edu", "Cargo.toml"),
      "--package",
      "codewhale-tui",
      "--bin",
      "codewhale-tui",
      "--release",
    ],
  );

  await run(
    "cargo",
    [
      "build",
      "--manifest-path",
      path.join(projectRoot, "src-tauri", "Cargo.toml"),
      "--bin",
      "fufan-pty-bridge",
      "--release",
    ],
  );

  const tuiTargetName = tuiBinaryNameForTarget(targetTriple);
  const bridgeTargetName = ptyBridgeBinaryNameForTarget(targetTriple);
  await copyExecutable(
    path.join(projectRoot, "vendor", "codewhale-edu", "target", "release", tuiTargetName),
    path.join(binRoot, tuiTargetName),
  );
  await copyExecutable(
    path.join(projectRoot, "src-tauri", "target", "release", bridgeTargetName),
    path.join(binRoot, bridgeTargetName),
  );

  console.log(`FuFan Agent runtime: ${path.relative(projectRoot, path.join(binRoot, tuiTargetName))}`);
  console.log(`FuFan PTY bridge: ${path.relative(projectRoot, path.join(binRoot, bridgeTargetName))}`);
}

async function copyExecutable(source, target) {
  await fs.copyFile(source, target);
  await fs.chmod(target, 0o755).catch(() => {});
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal || code}`));
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
