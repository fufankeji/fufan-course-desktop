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

async function createManageKnowledgeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-manage-api-"));
  await fs.mkdir(path.join(root, "pages"), { recursive: true });
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(
      {
        title: "Manageable Course",
        subtitle: "Knowledge Management",
        version: "test-manage",
        modules: [
          {
            id: "rag",
            title: "RAG 模块",
            theme: "RAG 管理测试",
            level: "测试",
            pageIds: ["rag-intro", "rag-eval"],
          },
          {
            id: "deploy",
            title: "部署模块",
            theme: "部署管理测试",
            level: "测试",
            pageIds: ["deploy-intro"],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const pages = [
    {
      file: "rag-intro.md",
      id: "rag-intro",
      title: "RAG 入门",
      module: "rag",
      summary: "介绍企业级 RAG 的基本流程。",
      body: "企业级 RAG 需要文档摄入、检索、重排和评估。",
    },
    {
      file: "rag-eval.md",
      id: "rag-eval",
      title: "RAG 评估",
      module: "rag",
      summary: "介绍企业级 RAG 的评估指标。",
      body: "RAG 评估需要关注召回、忠实度和回归测试。",
    },
    {
      file: "deploy-intro.md",
      id: "deploy-intro",
      title: "部署入门",
      module: "deploy",
      summary: "介绍模型部署上线的基本流程。",
      body: "部署上线需要关注容器化、日志、评估集和回归测试。",
    },
  ];

  for (const page of pages) {
    await fs.writeFile(
      path.join(root, "pages", page.file),
      [
        "---",
        `id: "${page.id}"`,
        `title: "${page.title}"`,
        'type: "lesson"',
        `module: "${page.module}"`,
        'tags: ["测试"]',
        `summary: "${page.summary}"`,
        "---",
        "",
        `# ${page.title}`,
        "",
        page.body,
      ].join("\n"),
      "utf8",
    );
  }

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

test("API chat accepts pageId and returns current lesson as a source", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: { DEEPSEEK_API_KEY: "" },
  });

  const result = await request(app, "/api/chat", {
    method: "POST",
    body: {
      message: "这句话怎么理解？",
      pageId: "rag-test",
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.sources[0].id, "rag-test");
  assert.match(result.json.answer, /RAG 测试知识页/);
});

test("API chat renders markdown answer html and supports current-page mode without sources", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "### 解释\n\n- 只结合当前课件回答" } }] }), {
        status: 200,
      }),
  });

  const result = await request(app, "/api/chat", {
    method: "POST",
    body: {
      message: "解释选中内容",
      pageId: "rag-test",
      contextMode: "current-page",
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.sources.length, 0);
  assert.match(result.json.answerHtml, /<h3/);
  assert.match(result.json.answerHtml, /<li>只结合当前课件回答<\/li>/);
});

test("API chat uses conversation history for follow-up questions", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: { DEEPSEEK_API_KEY: "" },
  });

  const result = await request(app, "/api/chat", {
    method: "POST",
    body: {
      message: "我刚才的问题是什么？",
      pageId: "rag-test",
      conversationHistory: [{ role: "user", content: "企业级 RAG 应该先看哪些评估指标？" }],
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.sources.length, 0);
  assert.match(result.json.answer, /企业级 RAG 应该先看哪些评估指标/);
});

test("frontend knowledge management uses inline editor instead of native browser dialogs", async () => {
  const source = await fs.readFile(path.resolve(import.meta.dirname, "../../frontend/app.js"), "utf8");

  assert.doesNotMatch(source, /\bprompt\s*\(/);
  assert.doesNotMatch(source, /\bconfirm\s*\(/);
  assert.match(source, /knowledge-editor/);
});

test("frontend knowledge management actions use icons instead of visible text buttons", async () => {
  const source = await fs.readFile(path.resolve(import.meta.dirname, "../../frontend/app.js"), "utf8");

  assert.match(source, /knowledgeIcon\("edit"\)/);
  assert.match(source, /knowledgeIcon\("trash"\)/);
  assert.match(source, /knowledgeIcon\("x"\)/);
  assert.match(source, /knowledgeIcon\("check"\)/);
  assert.doesNotMatch(source, />改<\/button>/);
  assert.doesNotMatch(source, />删<\/button>/);
  assert.doesNotMatch(source, />取消<\/button>/);
  assert.doesNotMatch(source, />保存<\/button>/);
  assert.doesNotMatch(source, />确认删除<\/button>/);
});

test("frontend opens a required model config modal when no API key is stored", async () => {
  const html = await fs.readFile(path.resolve(import.meta.dirname, "../../frontend/index.html"), "utf8");
  const source = await fs.readFile(path.resolve(import.meta.dirname, "../../frontend/app.js"), "utf8");

  assert.match(html, /id="model-config-title"/);
  assert.match(html, /id="model-config-description"/);
  assert.match(source, /promptForModelConfigIfRequired\(modelPayload\)/);
  assert.match(source, /openModelConfig\(\{ required: true \}\)/);
  assert.match(source, /saveOnSuccess: true/);
  assert.match(source, /state\.modelConfigRequired/);
});

test("knowledge management renames pages and modules while keeping page id navigation stable", async () => {
  const app = await createTestApp({ knowledgeRoot: await createManageKnowledgeFixture() });

  const renamedPage = await request(app, "/api/knowledge/pages/rag-intro", {
    method: "PATCH",
    body: { title: "企业级 RAG 入门改名" },
  });
  assert.equal(renamedPage.response.status, 200);
  assert.equal(renamedPage.json.page.id, "rag-intro");
  assert.equal(renamedPage.json.page.title, "企业级 RAG 入门改名");

  const renamedModule = await request(app, "/api/knowledge/modules/rag", {
    method: "PATCH",
    body: { title: "RAG 新模块名" },
  });
  assert.equal(renamedModule.response.status, 200);
  assert.equal(renamedModule.json.module.title, "RAG 新模块名");

  const manifest = await request(app, "/api/manifest");
  const module = manifest.json.modules.find((item) => item.id === "rag");
  assert.equal(module.title, "RAG 新模块名");
  assert.equal(module.pages.find((page) => page.id === "rag-intro").title, "企业级 RAG 入门改名");

  const page = await request(app, "/api/pages/rag-intro");
  assert.equal(page.response.status, 200);
  assert.equal(page.json.page.title, "企业级 RAG 入门改名");

  const search = await request(app, "/api/search?q=%E6%94%B9%E5%90%8D");
  assert.equal(search.response.status, 200);
  assert.equal(search.json.results[0].id, "rag-intro");
});

test("knowledge management reorders modules and moves pages without changing page ids", async () => {
  const app = await createTestApp({ knowledgeRoot: await createManageKnowledgeFixture() });

  const reordered = await request(app, "/api/knowledge/reorder", {
    method: "POST",
    body: {
      modules: [
        { id: "deploy", sortOrder: 0 },
        { id: "rag", sortOrder: 1 },
      ],
      pages: [
        { id: "rag-eval", moduleId: "deploy", sortOrder: 0 },
        { id: "deploy-intro", moduleId: "deploy", sortOrder: 1 },
        { id: "rag-intro", moduleId: "rag", sortOrder: 0 },
      ],
    },
  });
  assert.equal(reordered.response.status, 200);

  const manifest = await request(app, "/api/manifest");
  assert.equal(manifest.json.modules[0].id, "deploy");
  assert.deepEqual(
    manifest.json.modules[0].pages.map((page) => page.id),
    ["rag-eval", "deploy-intro"],
  );

  const movedPage = await request(app, "/api/pages/rag-eval");
  assert.equal(movedPage.response.status, 200);
  assert.equal(movedPage.json.page.id, "rag-eval");
  assert.equal(movedPage.json.page.module, "deploy");
});

test("knowledge management soft deletes pages from manifest, search, and direct navigation", async () => {
  const app = await createTestApp({ knowledgeRoot: await createManageKnowledgeFixture() });

  const deleted = await request(app, "/api/knowledge/pages/rag-intro", { method: "DELETE" });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.json.ok, true);

  const manifest = await request(app, "/api/manifest");
  assert.equal(manifest.json.modules.flatMap((module) => module.pages).some((page) => page.id === "rag-intro"), false);

  const pages = await request(app, "/api/pages");
  assert.equal(pages.json.pages.some((page) => page.id === "rag-intro"), false);

  const page = await request(app, "/api/pages/rag-intro");
  assert.equal(page.response.status, 404);

  const search = await request(app, "/api/search?q=RAG");
  assert.equal(search.json.results.some((page) => page.id === "rag-intro"), false);
});

test("API persists chat history per lesson and uses it on the next turn", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createManageKnowledgeFixture(),
    env: { DEEPSEEK_API_KEY: "" },
  });

  const first = await request(app, "/api/chat", {
    method: "POST",
    body: {
      message: "企业级 RAG 应该先看哪些评估指标？",
      pageId: "rag-intro",
    },
  });
  assert.equal(first.response.status, 200);

  const history = await request(app, "/api/chat/history?pageId=rag-intro");
  assert.equal(history.response.status, 200);
  assert.deepEqual(
    history.json.messages.map((message) => message.role),
    ["user", "assistant"],
  );
  assert.match(history.json.messages[0].content, /企业级 RAG 应该先看哪些评估指标/);

  const followUp = await request(app, "/api/chat", {
    method: "POST",
    body: {
      message: "我刚才的问题是什么？",
      pageId: "rag-intro",
    },
  });
  assert.equal(followUp.response.status, 200);
  assert.equal(followUp.json.sources.length, 0);
  assert.match(followUp.json.answer, /企业级 RAG 应该先看哪些评估指标/);
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

test("server serves vendored terminal modules with JavaScript MIME type", async () => {
  const app = await createTestApp({ knowledgeRoot: "knowledge", webRoot: "../frontend" });

  const response = await app.handleRequest(new Request("http://local.test/vendor/xterm/xterm.mjs"));
  const source = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.match(source, /Terminal/);
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

test("API can verify and save first-run model settings in one request", async () => {
  const app = await createTestApp({
    knowledgeRoot: await createKnowledgeFixture(),
    env: {},
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "连接正常" } }] }), {
        status: 200,
      }),
  });

  const tested = await request(app, "/api/settings/model/test", {
    method: "POST",
    body: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-first-run-secret",
      saveOnSuccess: true,
    },
  });

  assert.equal(tested.response.status, 200);
  assert.equal(tested.json.llm.ok, true);
  assert.equal(tested.json.settings.configured, true);
  assert.equal(tested.json.settings.apiKeyMasked, "sk-fi***cret");

  const status = await request(app, "/api/settings/model");
  assert.equal(status.json.settings.configured, true);
  assert.equal(status.json.settings.apiKeyMasked, "sk-fi***cret");
  assert.equal(status.json.lastTest.llm.ok, true);
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
