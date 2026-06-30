import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../server/app.js";
import { SettingsStore } from "../server/settings-store.js";
import {
  buildTerminalLaunch,
  defaultPtyBridgeRuntimePath,
  defaultTuiRuntimePath,
  getTerminalRuntimeStatus,
  normalizeTerminalSize,
  TerminalManager,
} from "../server/terminal-runtime.js";

const projectRoot = new URL("..", import.meta.url).pathname;

async function request(app, path, options = {}) {
  const response = await app.handleRequest(
    new Request(`http://local.test${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "content-type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { response, json };
}

test("terminal runtime status finds the bundled CodeWhale TUI binary", async () => {
  const status = await getTerminalRuntimeStatus(projectRoot, {});

  assert.equal(status.available, true);
  assert.match(status.binaryPath, /runtime\/bin\/codewhale-tui$/);
  assert.equal(status.kind, "codewhale-tui");
});

test("terminal runtime path uses a Windows executable on Windows", () => {
  assert.equal(defaultTuiRuntimePath("win32"), path.join("runtime", "bin", "codewhale-tui.exe"));
  assert.equal(defaultTuiRuntimePath("darwin"), path.join("runtime", "bin", "codewhale-tui"));
  assert.equal(defaultPtyBridgeRuntimePath("win32"), path.join("runtime", "bin", "fufan-pty-bridge.exe"));
  assert.equal(defaultPtyBridgeRuntimePath("darwin"), path.join("runtime", "bin", "fufan-pty-bridge"));
});

test("terminal launch config uses the skill pack workspace and DeepSeek env", async () => {
  const launch = await buildTerminalLaunch({
    projectRoot,
    packId: "context-engineering",
    env: {
      DEEPSEEK_API_KEY: "test-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    },
  });

  assert.match(launch.command, /runtime\/bin\/fufan-pty-bridge$/);
  assert.deepEqual(launch.args.slice(0, 4), [
    path.resolve(projectRoot, "runtime", "bin", "codewhale-tui"),
    "100",
    "30",
    launch.resizeControlFile,
  ]);
  assert.match(launch.cwd, /runtime-packs\/context-engineering$/);
  assert.equal(launch.env.DEEPSEEK_API_KEY, "test-key");
  assert.equal(launch.env.DEEPSEEK_MODEL, "deepseek-v4-flash");
  assert.equal(launch.env.CODEWHALE_PROVIDER, "deepseek");
  assert.match(launch.env.DEEPSEEK_CONFIG_PATH, /runtime-packs\/context-engineering\/\.codewhale\/config\.toml$/);
  assert.equal(launch.env.FUFAN_DESKTOP_TUI, "1");

  const config = await fs.readFile(launch.env.CODEWHALE_CONFIG_PATH, "utf8");
  assert.match(config, /^provider = "deepseek"$/m);
  assert.match(config, /^base_url = "https:\/\/api\.deepseek\.com"$/m);
  assert.match(config, /^default_text_model = "deepseek-v4-flash"$/m);
  assert.match(config, /^api_key = "test-key"$/m);
});

test("terminal launch trusts the current skill pack workspace before starting TUI", async () => {
  const root = await createRuntimeFixture();

  const launch = await buildTerminalLaunch({
    projectRoot: root,
    packId: "context-engineering",
    env: {
      DEEPSEEK_API_KEY: "test-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    },
  });

  const config = await fs.readFile(path.join(launch.env.CODEWHALE_HOME, "config.toml"), "utf8");
  assert.ok(config.includes(`[projects."${launch.cwd}"]`));
  assert.match(config, /trust_level = "trusted"/);

  const marker = await fs.stat(path.join(launch.cwd, ".deepseek", "trusted"));
  assert.equal(marker.isFile(), true);
});

test("terminal launch hides the source TUI sidebar by default for the embedded desktop panel", async () => {
  const root = await createRuntimeFixture();

  const launch = await buildTerminalLaunch({
    projectRoot: root,
    packId: "context-engineering",
    env: { DEEPSEEK_API_KEY: "test-key" },
  });

  const config = await fs.readFile(launch.env.CODEWHALE_CONFIG_PATH, "utf8");
  assert.match(config, /^sidebar_focus = "hidden"$/m);
  const settings = await fs.readFile(path.join(path.dirname(launch.env.DEEPSEEK_CONFIG_PATH), "settings.toml"), "utf8");
  assert.match(settings, /^sidebar_focus = "hidden"$/m);
  assert.match(settings, /^show_thinking = false$/m);
  assert.match(settings, /^locale = "zh-Hans"$/m);
});

test("terminal launch writes current lesson context and builds a skill bootstrap prompt", async () => {
  const root = await createRuntimeFixture();
  const page = {
    id: "lesson-rag",
    title: "企业级 RAG 项目实战",
    summary: "用课程资料构建企业级 RAG 项目。",
    body: "# 企业级 RAG 项目实战\n\n这里是当前课件正文。",
    plainText: "企业级 RAG 项目实战 这里是当前课件正文。",
    metadata: { relativePath: "RAG/企业级 RAG 项目实战.md" },
    tags: ["RAG", "Agent"],
  };

  const launch = await buildTerminalLaunch({
    projectRoot: root,
    packId: "context-engineering",
    skillId: "context-compression",
    page,
    env: { DEEPSEEK_API_KEY: "test-key" },
  });

  assert.equal(launch.skill.id, "context-compression");
  assert.equal(launch.page.id, "lesson-rag");
  assert.match(launch.relativeContextFile, /^\.course-session\/lesson-rag-/);
  assert.match(launch.bootstrapPrompt, /加载课程能力包：context-compression/);
  assert.match(launch.bootstrapPrompt, /企业级 RAG 项目实战/);
  assert.match(launch.bootstrapPrompt, /当前课件上下文文件/);
  assert.match(launch.bootstrapPrompt, /第一句话必须写：已读取课件：《企业级 RAG 项目实战》/);
  assert.match(launch.bootstrapPrompt, /不要分析默认示例项目/);
  assert.match(launch.bootstrapPrompt, /本轮不要直接执行/);

  const context = await fs.readFile(launch.contextFile, "utf8");
  assert.match(context, /# 当前课件上下文/);
  assert.match(context, /企业级 RAG 项目实战/);
  assert.match(context, /这里是当前课件正文/);

  const instructions = await fs.readFile(path.join(launch.cwd, ".codewhale", "instructions.md"), "utf8");
  assert.match(instructions, /你是赋范智能体/);
  assert.doesNotMatch(instructions, /CodeWhale/);
  assert.match(instructions, /企业级 RAG 项目实战/);
  assert.match(instructions, new RegExp(launch.relativeContextFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(instructions, /不要使用 emoji/);
  assert.equal(launch.env.FUFAN_COURSE_TITLE, "企业级 RAG 项目实战");
  assert.equal(launch.env.FUFAN_SKILL_NAME, "Context Compression");
});

test("API exposes terminal status and starts sessions through the terminal manager", async () => {
  const started = [];
  const settingsStore = await createTestSettingsStore({ DEEPSEEK_API_KEY: "test-key" });
  const settings = await settingsStore.getModelSettings();
  await settingsStore.saveModelTestResult({
    settings,
    llm: { ok: true, provider: "deepseek", model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com" },
  });
  const app = await createApp({
    knowledgeRoot: await createKnowledgeFixture(),
    settingsStore,
    terminalManager: {
      async status() {
        return { available: true, kind: "codewhale-tui", binaryPath: "/tmp/codewhale-tui" };
      },
      async startSession(options) {
        started.push(options);
        return { id: "session-1", packId: options.packId, status: "running" };
      },
    },
  });

  const status = await request(app, "/api/terminal/status");
  assert.equal(status.response.status, 200);
  assert.equal(status.json.available, true);

  const created = await request(app, "/api/terminal/sessions", {
    method: "POST",
    body: { packId: "context-engineering", pageId: "rag-test", skillId: "context-compression" },
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.json.session.id, "session-1");
  assert.equal(started.length, 1);
  assert.equal(started[0].packId, "context-engineering");
  assert.equal(started[0].page.id, "rag-test");
  assert.equal(started[0].skillId, "context-compression");
  assert.equal(started[0].cols, 100);
  assert.equal(started[0].rows, 30);
});

test("API allows terminal sessions when a model key is stored even before connection testing", async () => {
  const started = [];
  const settingsStore = await createTestSettingsStore({ DEEPSEEK_API_KEY: "test-key" });
  const app = await createApp({
    knowledgeRoot: await createKnowledgeFixture(),
    settingsStore,
    terminalManager: {
      async status() {
        return { available: true, kind: "codewhale-tui", binaryPath: "/tmp/codewhale-tui" };
      },
      async startSession(options) {
        started.push(options);
        return { id: "session-1", packId: options.packId, status: "running" };
      },
    },
  });

  const created = await request(app, "/api/terminal/sessions", {
    method: "POST",
    body: { packId: "context-engineering", pageId: "rag-test", skillId: "context-compression" },
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.json.session.id, "session-1");
  assert.equal(started.length, 1);
});

test("API blocks terminal sessions only when no model key is stored", async () => {
  const started = [];
  const settingsStore = await createTestSettingsStore({});
  const app = await createApp({
    knowledgeRoot: await createKnowledgeFixture(),
    settingsStore,
    terminalManager: {
      async status() {
        return { available: true, kind: "codewhale-tui", binaryPath: "/tmp/codewhale-tui" };
      },
      async startSession(options) {
        started.push(options);
        return { id: "session-1", packId: options.packId, status: "running" };
      },
    },
  });

  const created = await request(app, "/api/terminal/sessions", {
    method: "POST",
    body: { packId: "context-engineering", pageId: "rag-test", skillId: "context-compression" },
  });

  assert.equal(created.response.status, 409);
  assert.equal(created.json.error.code, "MODEL_CONFIG_REQUIRED");
  assert.equal(started.length, 0);
});

test("terminal manager reuses a running session for the same course context", async () => {
  const root = await createRuntimeFixture();
  const spawned = [];
  const manager = new TerminalManager({
    projectRoot: root,
    env: { DEEPSEEK_API_KEY: "test-key" },
    spawnImpl(command, args, options) {
      spawned.push({ command, args, options });
      return createFakeChildProcess();
    },
  });
  const page = {
    id: "lesson-python",
    title: "Windows配置Python环境",
    summary: "配置 Python 开发环境。",
    body: "# Windows配置Python环境\n\n课程正文。",
    plainText: "Windows配置Python环境 课程正文。",
    metadata: {},
    tags: [],
  };

  const first = await manager.startSession({
    packId: "context-engineering",
    skillId: "context-compression",
    page,
    cols: 100,
    rows: 30,
  });
  const second = await manager.startSession({
    packId: "context-engineering",
    skillId: "context-compression",
    page,
    cols: 132,
    rows: 38,
  });

  assert.equal(second.id, first.id);
  assert.equal(spawned.length, 1);
});

test("API resizes an existing terminal session", async () => {
  const resized = [];
  const app = await createApp({
    knowledgeRoot: await createKnowledgeFixture(),
    settingsStore: await createTestSettingsStore({ DEEPSEEK_API_KEY: "test-key" }),
    terminalManager: {
      async status() {
        return { available: true, kind: "codewhale-tui", binaryPath: "/tmp/codewhale-tui" };
      },
      resizeSession(id, size) {
        resized.push({ id, size });
        return true;
      },
    },
  });

  const response = await request(app, "/api/terminal/sessions/session-1/resize", {
    method: "POST",
    body: { cols: 132, rows: 38 },
  });

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.deepEqual(resized, [{ id: "session-1", size: { cols: 132, rows: 38 } }]);
});

test("terminal size normalization clamps rows and columns", () => {
  assert.deepEqual(normalizeTerminalSize({ cols: 132, rows: 38 }), { cols: 132, rows: 38 });
  assert.deepEqual(normalizeTerminalSize({ cols: 0, rows: -1 }), { cols: 1, rows: 1 });
  assert.deepEqual(normalizeTerminalSize({ cols: 9999, rows: 9999 }), { cols: 500, rows: 200 });
});

test("terminal resize writes the bridge control file without Unix signals", async () => {
  const root = await createRuntimeFixture();
  const kills = [];
  const manager = new TerminalManager({
    projectRoot: root,
    env: { DEEPSEEK_API_KEY: "test-key" },
    spawnImpl() {
      const child = createFakeChildProcess();
      child.kill = (signal = "SIGTERM") => {
        kills.push(signal);
        child.killed = true;
        child.exitCode = 0;
        child.emit("exit", 0, null);
        return true;
      };
      return child;
    },
  });

  const started = await manager.startSession({ packId: "context-engineering", cols: 80, rows: 24 });
  await manager.resizeSession(started.id, { cols: 123, rows: 41 });

  const session = manager.getSession(started.id);
  const payload = JSON.parse(await fs.readFile(session.launch.resizeControlFile, "utf8"));
  assert.deepEqual(payload, { cols: 123, rows: 41 });
  assert.deepEqual(kills, []);
});

async function createRuntimeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-terminal-runtime-"));
  const packRoot = path.join(root, "runtime-packs", "context-engineering");
  await fs.mkdir(path.join(packRoot, ".codewhale"), { recursive: true });
  await fs.mkdir(path.join(root, "runtime", "bin"), { recursive: true });
  await fs.writeFile(path.join(root, "runtime", "bin", "codewhale-tui"), "", { mode: 0o755 });
  await fs.writeFile(path.join(root, "runtime", "bin", "fufan-pty-bridge"), "", { mode: 0o755 });
  await fs.writeFile(path.join(packRoot, ".codewhale", "config.toml"), 'provider = "deepseek"\n');
  await fs.writeFile(
    path.join(packRoot, "skill-manifest.json"),
    JSON.stringify(
      {
        id: "context-engineering",
        title: "上下文工程 Skill 运行包",
        skills: [
          {
            id: "context-compression",
            name: "Context Compression",
            description: "压缩上下文。",
            quickPrompt: "请使用 context-compression Skill。",
            paths: {
              codex: ".agents/skills/context-compression/SKILL.md",
              claude: ".claude/skills/context-compression/SKILL.md",
              cursor: ".cursor/rules/context-compression.mdc",
            },
          },
        ],
      },
      null,
      2,
    ),
  );
  return root;
}

async function createTestSettingsStore(env = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-terminal-settings-"));
  return new SettingsStore({ projectRoot: root, env }).init();
}

function createFakeChildProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    writable: true,
    write() {},
  };
  child.exitCode = null;
  child.killed = false;
  child.pid = 12345;
  child.kill = (signal = "SIGTERM") => {
    if (signal === "SIGUSR1") return true;
    child.killed = true;
    child.exitCode = 0;
    child.emit("exit", 0, null);
    return true;
  };
  return child;
}

async function createKnowledgeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-terminal-api-"));
  await fs.mkdir(path.join(root, "pages"), { recursive: true });
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(
      {
        title: "Fixture Agent Course",
        subtitle: "Fixture Wiki",
        version: "test",
        modules: [
          {
            id: "rag",
            title: "RAG 测试模块",
            theme: "测试 Skill 控制台",
            level: "测试",
            pageIds: ["rag-test"],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "pages", "rag-test.md"),
    [
      "---",
      'id: "rag-test"',
      'title: "RAG 测试知识页"',
      'type: "lesson"',
      'module: "rag"',
      'tags: ["RAG", "Skill"]',
      'summary: "用于测试终端启动时绑定当前课件。"',
      "---",
      "",
      "# RAG 测试知识页",
      "",
      "这是一节用于验证 Skill 控制台自动读取当前课件的内容。",
    ].join("\n"),
    "utf8",
  );
  return root;
}
