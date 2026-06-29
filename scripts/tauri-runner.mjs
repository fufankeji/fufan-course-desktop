#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(__dirname, "..");

export async function resolveTauriCli({
  projectRoot = defaultProjectRoot,
  env = process.env,
  nodeBin = process.execPath,
  commandExists: commandExistsImpl = commandExists,
} = {}) {
  if (env.TAURI_CLI) {
    return {
      source: "env",
      command: env.TAURI_CLI,
      prefixArgs: [],
    };
  }

  const localWrapper = path.join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  if (await pathExists(localWrapper)) {
    return {
      source: "local",
      command: nodeBin,
      prefixArgs: [localWrapper],
    };
  }

  if (await commandExistsImpl("tauri")) {
    return {
      source: "path",
      command: "tauri",
      prefixArgs: [],
    };
  }

  const error = new Error(
    [
      "未找到 Tauri CLI。",
      "请先执行 npm install，或设置 TAURI_CLI=/path/to/tauri，再重试。",
      "也可以执行 npm run desktop:doctor 查看当前打包环境状态。",
    ].join("\n"),
  );
  error.code = "TAURI_CLI_NOT_FOUND";
  throw error;
}

export async function runTauriCli(args, options = {}) {
  const resolved = await resolveTauriCli(options);
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      cwd: options.projectRoot || defaultProjectRoot,
      env: options.env || process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`Tauri CLI exited with ${signal || code}`);
      error.code = code;
      reject(error);
    });
  });
}

async function commandExists(command) {
  try {
    const child = spawn(command, ["--version"], { stdio: "ignore" });
    return await new Promise((resolve) => {
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runTauriCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = typeof error.code === "number" ? error.code : 1;
  });
}
