#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(__dirname, "..");

export async function copyPackagedResourcesToRuntime({
  resourcesRoot = path.join(defaultProjectRoot, "src-tauri", "resources"),
  runtimeRoot,
} = {}) {
  const root = runtimeRoot || (await fs.mkdtemp(path.join(os.tmpdir(), "fufan-release-runtime-")));
  const backendSource = path.join(resourcesRoot, "backend");
  const frontendSource = path.join(resourcesRoot, "frontend");
  const backendRoot = path.join(root, "backend");
  const frontendRoot = path.join(root, "frontend");

  await assertDirectory(backendSource);
  await assertDirectory(frontendSource);
  await fs.rm(backendRoot, { recursive: true, force: true });
  await fs.rm(frontendRoot, { recursive: true, force: true });
  await fs.cp(backendSource, backendRoot, { recursive: true, force: true });
  await fs.cp(frontendSource, frontendRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(backendRoot, "data"), { recursive: true });

  return {
    runtimeRoot: root,
    backendRoot,
    frontendRoot,
  };
}

export async function runReleaseSmoke({
  resourcesRoot = path.join(defaultProjectRoot, "src-tauri", "resources"),
  runtimeRoot,
} = {}) {
  const runtime = await copyPackagedResourcesToRuntime({ resourcesRoot, runtimeRoot });
  const appModuleUrl = `${pathToFileURL(path.join(runtime.backendRoot, "server", "app.js")).href}?smoke=${Date.now()}`;
  const { createApp } = await import(appModuleUrl);
  const app = await createApp({
    webRoot: "../frontend",
    env: {
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    },
  });

  const frontend = await textRequest(app, "/");
  const health = await jsonRequest(app, "/api/health");
  const pages = await jsonRequest(app, "/api/pages");
  const skillPacks = await jsonRequest(app, "/api/skill-packs");
  const terminal = await jsonRequest(app, "/api/terminal/status");
  const chat = await jsonRequest(app, "/api/chat", {
    method: "POST",
    body: {
      message: "请根据课程知识库说明本地部署大模型的学习起点。",
    },
  });
  const savedSettings = await jsonRequest(app, "/api/settings/model", {
    method: "POST",
    body: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-release-smoke-test",
    },
  });

  return {
    ok:
      frontend.ok &&
      health.ok &&
      pages.ok &&
      pages.json.pages.length > 0 &&
      skillPacks.ok &&
      skillPacks.json.packs.length > 0 &&
      terminal.ok &&
      terminal.json.available &&
      chat.ok &&
      Array.isArray(chat.json.sources) &&
      chat.json.sources.length > 0 &&
      savedSettings.ok &&
      savedSettings.json.settings.configured,
    runtimeRoot: runtime.runtimeRoot,
    frontend: {
      ok: frontend.ok && frontend.text.includes("赋范空间"),
      status: frontend.status,
    },
    health: {
      ok: health.ok && health.json.ok === true,
      pages: health.json.pages,
    },
    pages: {
      count: pages.json.pages.length,
    },
    skillPacks: {
      ids: skillPacks.json.packs.map((pack) => pack.id),
    },
    terminal: {
      available: terminal.json.available,
      binaryPath: terminal.json.binaryPath,
    },
    chat: {
      mode: chat.json.mode,
      sourceCount: chat.json.sources.length,
    },
    modelSettings: {
      configured: savedSettings.json.settings.configured,
      dbPath: savedSettings.json.settings.dbPath,
    },
  };
}

async function jsonRequest(app, requestPath, options = {}) {
  const response = await app.handleRequest(
    new Request(`http://release-smoke.test${requestPath}`, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
  return {
    ok: response.ok,
    status: response.status,
    json: await response.json(),
  };
}

async function textRequest(app, requestPath) {
  const response = await app.handleRequest(new Request(`http://release-smoke.test${requestPath}`));
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function assertDirectory(dirPath) {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Expected directory: ${dirPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReleaseSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
