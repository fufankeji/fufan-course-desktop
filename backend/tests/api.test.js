import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../server/app.js";
import { SettingsStore } from "../server/settings-store.js";

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

async function createKnowledgeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-api-"));
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
            theme: "测试检索问答",
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
      'tags: ["RAG", "评估"]',
      'summary: "介绍企业级 RAG 的评估方法。"',
      "---",
      "",
      "# RAG 测试知识页",
      "",
      "企业级 RAG 评估需要关注召回、证据忠实度、答案相关性和回归测试。",
    ].join("\n"),
    "utf8",
  );
  return root;
}

async function createEmptyKnowledgeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-empty-api-"));
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(
      {
        title: "赋范空间 · 大模型学习平台",
        subtitle: "不仅教会你，还教会你的智能体",
        version: "test-empty",
        includeSeedPages: false,
        modules: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

test("default course wiki starts empty for real import testing", async () => {
  const app = await createTestApp({ knowledgeRoot: await createEmptyKnowledgeFixture() });

  const manifest = await request(app, "/api/manifest");
  const pages = await request(app, "/api/pages");

  assert.equal(manifest.response.status, 200);
  assert.match(manifest.json.title, /赋范空间/);
  assert.equal(manifest.json.modules.length, 0);
  assert.equal(pages.response.status, 200);
  assert.equal(pages.json.pages.length, 0);
});

test("API exposes manifest and pages from a knowledge fixture", async () => {
  const app = await createTestApp({ knowledgeRoot: await createKnowledgeFixture() });

  const manifest = await request(app, "/api/manifest");
  const pages = await request(app, "/api/pages");

  assert.equal(manifest.response.status, 200);
  assert.equal(manifest.json.modules.length, 1);
  assert.equal(pages.response.status, 200);
  assert.equal(pages.json.pages.length, 1);
});

test("API chat returns deterministic answer with cited sources", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: { DEEPSEEK_API_KEY: "" },
  });

  const result = await request(app, "/api/chat", {
    method: "POST",
    body: { message: "我想做企业级 RAG 项目，应该先学什么？" },
  });

  assert.equal(result.response.status, 200);
  assert.match(result.json.answer, /RAG/);
  assert.ok(result.json.sources.length >= 1);
  assert.ok(result.json.sources[0].title);
});

test("API rejects empty chat messages", async () => {
  const app = await createTestApp({ knowledgeRoot: "knowledge" });

  const result = await request(app, "/api/chat", {
    method: "POST",
    body: { message: "   " },
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.json.error.code, "EMPTY_MESSAGE");
});

test("server serves the separated frontend entry", async () => {
  const app = await createTestApp({ knowledgeRoot: "knowledge", webRoot: "../frontend" });

  const response = await app.handleRequest(new Request("http://local.test/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /赋范空间 · 大模型学习平台/);
  assert.match(html, /\/app\.js/);
});

test("API stores model settings in sqlite and exposes runtime status", async () => {
  const app = await createTestApp({ knowledgeRoot: await createKnowledgeFixture(), env: {} });

  const saved = await request(app, "/api/settings/model", {
    method: "POST",
    body: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-secret",
    },
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.json.settings.configured, true);
  assert.equal(saved.json.settings.apiKeyMasked, "sk-te***cret");
  assert.equal(saved.json.llm.configured, true);

  const status = await request(app, "/api/settings/model");
  assert.equal(status.response.status, 200);
  assert.equal(status.json.settings.model, "deepseek-v4-flash");
  assert.equal(status.json.terminal.configured, true);
});

test("API persists successful model connection tests for status rendering", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: {},
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "连接正常" } }] }), {
        status: 200,
      }),
  });

  await request(app, "/api/settings/model", {
    method: "POST",
    body: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-secret",
    },
  });

  const tested = await request(app, "/api/settings/model/test", {
    method: "POST",
    body: {},
  });
  assert.equal(tested.response.status, 200);
  assert.equal(tested.json.llm.ok, true);

  const status = await request(app, "/api/settings/model");
  assert.equal(status.response.status, 200);
  assert.equal(status.json.lastTest.llm.ok, true);
  assert.equal(status.json.lastTest.llm.model, "deepseek-v4-flash");
  assert.equal(status.json.lastTest.llm.message, "连接正常");
  assert.ok(status.json.lastTest.llm.testedAt);
});

async function createTestApp(options = {}) {
  return createApp({
    ...options,
    settingsStore: await createTestSettingsStore(options.env || {}),
  });
}

async function createTestSettingsStore(env = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-settings-"));
  return new SettingsStore({ projectRoot: root, env }).init();
}
