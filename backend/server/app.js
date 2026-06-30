import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { answerFromCourseWiki } from "./chat.js";
import { getImportStatus, importCourseDirectory, pickCourseDirectory, scanCourseDirectory } from "./importer.js";
import { getLlmStatus, testDeepSeekConnection } from "./llm.js";
import { renderMarkdownToHtml } from "./markdown.js";
import { searchPages, summarizePage } from "./search.js";
import { SettingsStore } from "./settings-store.js";
import { getSkillPack, listSkillPacks } from "./skill-packs.js";
import { TerminalManager } from "./terminal-runtime.js";
import { loadCourseWiki } from "./wiki-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const CHAT_HISTORY_LIMIT = 8;

export async function createApp(options = {}) {
  const knowledgeRoot = path.resolve(projectRoot, options.knowledgeRoot || "knowledge");
  const webRoot = path.resolve(projectRoot, options.webRoot || "web");
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const settingsStore = options.settingsStore || (await new SettingsStore({ projectRoot, env }).init());
  const terminalManager = options.terminalManager || new TerminalManager({ projectRoot, env });
  const getRuntimeEnv = (overrides = {}) => settingsStore.buildModelEnv(env, overrides);
  const wikiOptions = { includeSeedPages: options.includeSeedPages };
  const loadWiki = async () =>
    loadCourseWiki(knowledgeRoot, {
      ...wikiOptions,
      catalog: await settingsStore.getKnowledgeCatalog(),
    });
  let wiki = await loadWiki();

  const reloadWiki = async () => {
    wiki = await loadWiki();
    return wiki;
  };

  return {
    get wiki() {
      return wiki;
    },
    async handleRequest(request) {
      try {
        return await routeRequest(request, {
          getWiki: () => wiki,
          reloadWiki,
          knowledgeRoot,
          webRoot,
          env,
          fetchImpl,
          settingsStore,
          getRuntimeEnv,
          terminalManager,
        });
      } catch (error) {
        return jsonResponse(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          },
          500,
        );
      }
    },
  };
}

async function routeRequest(request, context) {
  const url = new URL(request.url);
  const { pathname } = url;
  const wiki = context.getWiki();
  const { knowledgeRoot, webRoot } = context;

  if (pathname === "/api/health") {
    return jsonResponse({ ok: true, pages: wiki.pages.length, mode: "local" });
  }

  if (pathname === "/api/llm/status") {
    return jsonResponse(getLlmStatus(await context.getRuntimeEnv()));
  }

  if (pathname === "/api/settings/model" && request.method === "GET") {
    return jsonResponse(await modelStatusPayload(context));
  }

  if (pathname === "/api/settings/model" && request.method === "POST") {
    const payload = await readJson(request);
    await context.settingsStore.saveModelSettings(compactModelPayload(payload));
    return jsonResponse(await modelStatusPayload(context));
  }

  if (pathname === "/api/settings/model/test" && request.method === "POST") {
    const payload = await readJson(request);
    const overrides = compactModelPayload(payload);
    const runtimeEnv = await context.getRuntimeEnv(overrides);
    setTerminalEnv(context.terminalManager, runtimeEnv);
    const [llm, terminal] = await Promise.all([
      testDeepSeekConnection({ env: runtimeEnv, fetchImpl: context.fetchImpl }),
      terminalStatus(context.terminalManager, runtimeEnv),
    ]);
    let settings = await context.settingsStore.getModelSettings();
    let resultEnv = runtimeEnv;
    if (payload?.saveOnSuccess && llm.ok) {
      settings = await context.settingsStore.saveModelSettings(overrides);
      resultEnv = await context.getRuntimeEnv();
      setTerminalEnv(context.terminalManager, resultEnv);
    }
    const lastTest = await context.settingsStore.saveModelTestResult({
      llm,
      settings: modelSettingsFromRuntimeEnv(resultEnv),
    });
    return jsonResponse({
      settings: context.settingsStore.publicModelSettings(settings),
      llm,
      terminal: payload?.saveOnSuccess && llm.ok ? await terminalStatus(context.terminalManager, resultEnv) : terminal,
      lastTest,
    });
  }

  if (pathname === "/api/import/status") {
    return jsonResponse(await getImportStatus(knowledgeRoot));
  }

  if (pathname === "/api/skill-packs") {
    return jsonResponse({ packs: await listSkillPacks(projectRoot) });
  }

  if (pathname.startsWith("/api/skill-packs/")) {
    const id = decodeURIComponent(pathname.replace("/api/skill-packs/", ""));
    const pack = await getSkillPack(projectRoot, id);
    if (!pack) return jsonResponse({ error: { code: "SKILL_PACK_NOT_FOUND", message: `未找到能力包：${id}` } }, 404);
    return jsonResponse({ pack });
  }

  if (pathname === "/api/terminal/status") {
    const runtimeEnv = await context.getRuntimeEnv();
    setTerminalEnv(context.terminalManager, runtimeEnv);
    return jsonResponse(await terminalStatus(context.terminalManager, runtimeEnv));
  }

  if (pathname === "/api/terminal/sessions" && request.method === "POST") {
    const payload = await readJson(request);
    const pageId = String(payload.pageId || "").trim();
    const page = pageId ? wiki.getPage(pageId) : null;
    if (pageId && !page) {
      return jsonResponse({ error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${pageId}` } }, 404);
    }

    try {
      const runtimeEnv = await context.getRuntimeEnv();
      const modelReadyError = await terminalModelReadyError(context);
      if (modelReadyError) return jsonResponse({ error: modelReadyError }, 409);
      setTerminalEnv(context.terminalManager, runtimeEnv);
      const session = await context.terminalManager.startSession({
        packId: String(payload.packId || "context-engineering"),
        page,
        skillId: payload.skillId ? String(payload.skillId) : undefined,
        cols: Number(payload.cols || 100),
        rows: Number(payload.rows || 30),
      });
      return jsonResponse({ session });
    } catch (error) {
      return jsonResponse(
        {
          error: {
            code: error.code || "TERMINAL_START_FAILED",
            message: error instanceof Error ? error.message : "Terminal session failed to start",
          },
        },
        400,
      );
    }
  }

  const terminalMatch = pathname.match(/^\/api\/terminal\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (terminalMatch) {
    const sessionId = decodeURIComponent(terminalMatch[1]);
    const action = terminalMatch[2] || "";

    if (action === "events" && request.method === "GET") {
      const stream = context.terminalManager.eventStream(sessionId);
      if (!stream) return jsonResponse({ error: { code: "TERMINAL_SESSION_NOT_FOUND", message: "未找到智能体会话" } }, 404);
      return stream;
    }

    if (action === "input" && request.method === "POST") {
      const payload = await readJson(request);
      const ok = context.terminalManager.writeInput(sessionId, String(payload.data || ""));
      if (!ok) return jsonResponse({ error: { code: "TERMINAL_SESSION_NOT_FOUND", message: "未找到智能体会话" } }, 404);
      return jsonResponse({ ok: true });
    }

    if (action === "resize" && request.method === "POST") {
      const payload = await readJson(request);
      const ok = await context.terminalManager.resizeSession(sessionId, {
        cols: payload.cols,
        rows: payload.rows,
      });
      if (!ok) return jsonResponse({ error: { code: "TERMINAL_SESSION_NOT_FOUND", message: "未找到智能体会话" } }, 404);
      return jsonResponse({ ok: true });
    }

    if (!action && request.method === "DELETE") {
      const ok = context.terminalManager.stopSession(sessionId);
      if (!ok) return jsonResponse({ error: { code: "TERMINAL_SESSION_NOT_FOUND", message: "未找到智能体会话" } }, 404);
      return jsonResponse({ ok: true });
    }
  }

  if (pathname === "/api/import/pick-folder" && request.method === "POST") {
    const rootPath = await pickCourseDirectory();
    return jsonResponse(await scanCourseDirectory(rootPath, { knowledgeRoot }));
  }

  if (pathname === "/api/import/scan" && request.method === "POST") {
    const payload = await readJson(request);
    const rootPath = String(payload.rootPath || "");
    return jsonResponse(await scanCourseDirectory(rootPath, { knowledgeRoot }));
  }

  if (pathname === "/api/import" && request.method === "POST") {
    const payload = await readJson(request);
    const rootPath = String(payload.rootPath || "");
    const result = await importCourseDirectory(rootPath, {
      knowledgeRoot,
      force: Boolean(payload.force),
      limit: Number(payload.limit || 1000),
    });
    const nextWiki = await context.reloadWiki();
    return jsonResponse({ ...result, wikiPages: nextWiki.pages.length, manifest: nextWiki.manifest });
  }

  const knowledgePageMatch = pathname.match(/^\/api\/knowledge\/pages\/([^/]+)$/);
  if (knowledgePageMatch) {
    const id = decodeURIComponent(knowledgePageMatch[1]);
    const page = wiki.getPage(id);
    if (!page) return jsonResponse({ error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${id}` } }, 404);

    if (request.method === "PATCH") {
      const payload = await readJson(request);
      const update = knowledgePageUpdatePayload(payload, wiki.manifest);
      if (update.error) return jsonResponse({ error: update.error }, 400);
      await context.settingsStore.updateKnowledgePage(id, update.value);
      const nextWiki = await context.reloadWiki();
      const nextPage = nextWiki.getPage(id);
      return jsonResponse({ page: summarizePage(nextPage), manifest: nextWiki.manifest });
    }

    if (request.method === "DELETE") {
      await context.settingsStore.softDeleteKnowledgePage(id);
      const nextWiki = await context.reloadWiki();
      return jsonResponse({ ok: true, manifest: nextWiki.manifest });
    }
  }

  const knowledgeModuleMatch = pathname.match(/^\/api\/knowledge\/modules\/([^/]+)$/);
  if (knowledgeModuleMatch) {
    const id = decodeURIComponent(knowledgeModuleMatch[1]);
    const module = findManifestModule(wiki.manifest, id);
    if (!module) return jsonResponse({ error: { code: "MODULE_NOT_FOUND", message: `未找到知识库目录：${id}` } }, 404);

    if (request.method === "PATCH") {
      const payload = await readJson(request);
      const update = knowledgeModuleUpdatePayload(payload);
      if (update.error) return jsonResponse({ error: update.error }, 400);
      await context.settingsStore.updateKnowledgeModule(id, update.value);
      const nextWiki = await context.reloadWiki();
      return jsonResponse({ module: findManifestModule(nextWiki.manifest, id), manifest: nextWiki.manifest });
    }

    if (request.method === "DELETE") {
      await context.settingsStore.softDeleteKnowledgeModule(id);
      const nextWiki = await context.reloadWiki();
      return jsonResponse({ ok: true, manifest: nextWiki.manifest });
    }
  }

  if (pathname === "/api/knowledge/reorder" && request.method === "POST") {
    const payload = await readJson(request);
    const reorder = normalizeKnowledgeReorder(payload, wiki);
    if (reorder.error) return jsonResponse({ error: reorder.error }, 400);
    await context.settingsStore.reorderKnowledge(reorder.value);
    const nextWiki = await context.reloadWiki();
    return jsonResponse({ ok: true, manifest: nextWiki.manifest });
  }

  if (pathname === "/api/manifest") {
    return jsonResponse(wiki.manifest);
  }

  if (pathname === "/api/pages") {
    return jsonResponse({ pages: wiki.pages.map(summarizePage) });
  }

  if (pathname.startsWith("/api/pages/")) {
    const id = decodeURIComponent(pathname.replace("/api/pages/", ""));
    const page = wiki.getPage(id);
    if (!page) return jsonResponse({ error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${id}` } }, 404);
    return jsonResponse({ page: { ...page, html: renderMarkdownToHtml(page.body) } });
  }

  if (pathname === "/api/search") {
    const query = url.searchParams.get("q") || "";
    const moduleId = url.searchParams.get("module") || undefined;
    return jsonResponse({ results: searchPages(wiki.pages, query, { moduleId }) });
  }

  if (pathname === "/api/chat/history" && request.method === "GET") {
    const pageId = String(url.searchParams.get("pageId") || "").trim();
    if (!pageId) return jsonResponse({ error: { code: "PAGE_ID_REQUIRED", message: "pageId is required" } }, 400);
    if (!wiki.getPage(pageId)) {
      return jsonResponse({ error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${pageId}` } }, 404);
    }
    const limit = Number(url.searchParams.get("limit") || 50);
    return jsonResponse({ messages: await context.settingsStore.getChatMessages(pageId, limit) });
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    const payload = await readJson(request);
    const message = String(payload.message || "");
    if (!message.trim()) {
      return jsonResponse({ error: { code: "EMPTY_MESSAGE", message: "Message is required" } }, 400);
    }
    const pageId = String(payload.pageId || "").trim();
    const page = pageId ? wiki.getPage(pageId) : null;
    if (pageId && !page) {
      return jsonResponse({ error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${pageId}` } }, 404);
    }
    const persistedHistory = pageId ? await context.settingsStore.getChatMessages(pageId, CHAT_HISTORY_LIMIT) : [];
    const result = await answerFromCourseWiki({
      message,
      pages: wiki.pages,
      moduleId: payload.moduleId,
      pageId,
      contextMode: String(payload.contextMode || ""),
      conversationHistory: persistedHistory.length ? persistedHistory : payload.conversationHistory,
      env: await context.getRuntimeEnv(),
      fetchImpl: context.fetchImpl,
    });
    const answerHtml = renderMarkdownToHtml(result.answer);
    if (pageId) {
      await context.settingsStore.appendChatMessage(pageId, { role: "user", content: message, title: page.title });
      await context.settingsStore.appendChatMessage(pageId, {
        role: "assistant",
        content: result.answer,
        answerHtml,
        sources: result.sources,
        title: page.title,
      });
    }
    return jsonResponse({ ...result, answerHtml });
  }

  if (pathname.startsWith("/api/")) {
    return jsonResponse({ error: { code: "NOT_FOUND", message: "API route not found" } }, 404);
  }

  return serveStatic(webRoot, pathname);
}

async function modelStatusPayload(context) {
  const runtimeEnv = await context.getRuntimeEnv();
  setTerminalEnv(context.terminalManager, runtimeEnv);
  const settings = await context.settingsStore.getModelSettings();
  const currentModelSettings = modelSettingsFromRuntimeEnv(runtimeEnv);
  return {
    settings: context.settingsStore.publicModelSettings(settings),
    llm: getLlmStatus(runtimeEnv),
    terminal: await terminalStatus(context.terminalManager, runtimeEnv),
    lastTest: await context.settingsStore.getModelTestResult(currentModelSettings),
  };
}

function modelSettingsFromRuntimeEnv(runtimeEnv) {
  return {
    provider: runtimeEnv.DEEPSEEK_PROVIDER,
    baseUrl: runtimeEnv.DEEPSEEK_BASE_URL,
    model: runtimeEnv.DEEPSEEK_MODEL,
    apiKey: runtimeEnv.DEEPSEEK_API_KEY,
  };
}

async function terminalStatus(terminalManager, runtimeEnv) {
  const status = await terminalManager.status();
  return {
    ...status,
    configured: Boolean(runtimeEnv.DEEPSEEK_API_KEY),
    model: runtimeEnv.DEEPSEEK_MODEL,
  };
}

async function terminalModelReadyError(context) {
  const settings = await context.settingsStore.getModelSettings();
  if (!settings.apiKey) {
    return {
      code: "MODEL_CONFIG_REQUIRED",
      message: "请先配置 DeepSeek API Key，再打开赋范智能体。",
    };
  }
  return null;
}

function setTerminalEnv(terminalManager, runtimeEnv) {
  if (typeof terminalManager.setEnv === "function") {
    terminalManager.setEnv(runtimeEnv);
  } else {
    terminalManager.env = runtimeEnv;
  }
}

function compactModelPayload(payload = {}) {
  const next = {};
  for (const key of ["provider", "baseUrl", "model", "apiKey"]) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const value = String(payload[key] || "").trim();
    if (key === "apiKey" && !value) continue;
    if (value) next[key] = value;
  }
  return next;
}

function knowledgePageUpdatePayload(payload = {}, manifest) {
  const value = {};

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = String(payload.title || "").trim();
    if (!title) return { error: { code: "INVALID_TITLE", message: "课件名称不能为空" } };
    value.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "moduleId")) {
    const moduleId = String(payload.moduleId || "").trim();
    if (!moduleId) return { error: { code: "INVALID_MODULE", message: "目标目录不能为空" } };
    if (!findManifestModule(manifest, moduleId)) {
      return { error: { code: "MODULE_NOT_FOUND", message: `未找到知识库目录：${moduleId}` } };
    }
    value.moduleId = moduleId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sortOrder")) {
    value.sortOrder = normalizeKnowledgeSortOrder(payload.sortOrder, null);
  }

  return { value };
}

function knowledgeModuleUpdatePayload(payload = {}) {
  const value = {};

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = String(payload.title || "").trim();
    if (!title) return { error: { code: "INVALID_TITLE", message: "目录名称不能为空" } };
    value.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sortOrder")) {
    value.sortOrder = normalizeKnowledgeSortOrder(payload.sortOrder, null);
  }

  return { value };
}

function normalizeKnowledgeReorder(payload = {}, wiki) {
  if (!Array.isArray(payload.modules) && !Array.isArray(payload.pages)) {
    return { error: { code: "INVALID_REORDER", message: "排序数据不能为空" } };
  }

  const moduleIds = new Set(wiki.manifest.modules.map((module) => module.id));
  const modules = (payload.modules || []).map((module, index) => {
    const id = String(module?.id || "").trim();
    return {
      id,
      sortOrder: normalizeKnowledgeSortOrder(module?.sortOrder, index),
    };
  });
  for (const module of modules) {
    if (!module.id || !moduleIds.has(module.id)) {
      return { error: { code: "MODULE_NOT_FOUND", message: `未找到知识库目录：${module.id || "空"}` } };
    }
  }

  const pageIds = new Set(wiki.pages.map((page) => page.id));
  const pages = (payload.pages || []).map((page, index) => {
    const id = String(page?.id || "").trim();
    const currentPage = id ? wiki.getPage(id) : null;
    return {
      id,
      moduleId: String(page?.moduleId || currentPage?.module || "").trim(),
      sortOrder: normalizeKnowledgeSortOrder(page?.sortOrder, index),
    };
  });
  for (const page of pages) {
    if (!page.id || !pageIds.has(page.id)) {
      return { error: { code: "PAGE_NOT_FOUND", message: `未找到课件：${page.id || "空"}` } };
    }
    if (!page.moduleId || !moduleIds.has(page.moduleId)) {
      return { error: { code: "MODULE_NOT_FOUND", message: `未找到知识库目录：${page.moduleId || "空"}` } };
    }
  }

  return { value: { modules, pages } };
}

function normalizeKnowledgeSortOrder(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function findManifestModule(manifest, id) {
  return (manifest.modules || []).find((module) => module.id === id) || null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function serveStatic(webRoot, pathname) {
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(webRoot, safePath);

  if (!filePath.startsWith(webRoot)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".map") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
