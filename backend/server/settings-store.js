import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

const MODEL_KEYS = ["provider", "baseUrl", "model", "apiKey"];
const MODEL_TEST_KEY = "modelTest";

export class SettingsStore {
  constructor({ projectRoot, dbPath, sqlitePath = "sqlite3", env = process.env } = {}) {
    this.projectRoot = projectRoot || process.cwd();
    this.dbPath = path.resolve(dbPath || path.join(this.projectRoot, "data", "settings.sqlite"));
    this.sqlitePath = sqlitePath;
    this.env = env;
    this.ready = false;
  }

  async init() {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    await this.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_modules (
        id TEXT PRIMARY KEY,
        title TEXT,
        sort_order INTEGER,
        deleted_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_pages (
        id TEXT PRIMARY KEY,
        module_id TEXT,
        title TEXT,
        sort_order INTEGER,
        deleted_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL UNIQUE,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        answer_html TEXT,
        sources_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.ready = true;
    await this.seedFromEnvIfNeeded();
    return this;
  }

  async getModelSettings() {
    await this.ensureReady();
    const rows = await this.queryJson(
      `SELECT key, value, updated_at AS updatedAt FROM settings WHERE key IN (${MODEL_KEYS.map(sqlString).join(", ")})`,
    );
    const saved = Object.fromEntries(rows.map((row) => [row.key, row]));
    const fromEnv = {
      provider: this.env.DEEPSEEK_PROVIDER || this.env.CODEWHALE_PROVIDER || DEFAULT_PROVIDER,
      baseUrl: this.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
      model: this.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      apiKey: this.env.DEEPSEEK_API_KEY || "",
    };

    const settings = {
      provider: saved.provider?.value || fromEnv.provider,
      baseUrl: saved.baseUrl?.value || fromEnv.baseUrl,
      model: saved.model?.value || fromEnv.model,
      apiKey: saved.apiKey?.value || fromEnv.apiKey,
      updatedAt: latestUpdatedAt(rows),
    };

    return normalizeModelSettings(settings);
  }

  async saveModelSettings(payload = {}) {
    await this.ensureReady();
    const current = await this.getModelSettings();
    const next = normalizeModelSettings({
      provider: payload.provider || current.provider,
      baseUrl: payload.baseUrl || current.baseUrl,
      model: payload.model || current.model,
      apiKey: Object.prototype.hasOwnProperty.call(payload, "apiKey") && payload.apiKey !== "" ? payload.apiKey : current.apiKey,
    });
    const now = new Date().toISOString();

    for (const key of MODEL_KEYS) {
      await this.exec(
        [
          "INSERT INTO settings(key, value, updated_at)",
          `VALUES (${sqlString(key)}, ${sqlString(next[key])}, ${sqlString(now)})`,
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;",
        ].join(" "),
      );
    }

    await this.clearModelTestResult();
    return { ...next, updatedAt: now };
  }

  async getModelTestResult(currentSettings) {
    await this.ensureReady();
    const rows = await this.queryJson(`SELECT value FROM settings WHERE key = ${sqlString(MODEL_TEST_KEY)} LIMIT 1`);
    if (!rows.length) return null;

    try {
      const result = JSON.parse(rows[0].value);
      if (!result?.signature) return null;
      if (currentSettings && result.signature !== this.modelSettingsSignature(currentSettings)) return null;
      return result;
    } catch {
      return null;
    }
  }

  async saveModelTestResult({ llm, settings }) {
    await this.ensureReady();
    const now = new Date().toISOString();
    const normalized = normalizeModelSettings(settings);
    const value = {
      signature: this.modelSettingsSignature(normalized),
      llm: {
        ok: Boolean(llm?.ok),
        provider: llm?.provider || normalized.provider,
        model: llm?.model || normalized.model,
        baseUrl: llm?.baseUrl || normalized.baseUrl,
        latencyMs: llm?.latencyMs || null,
        message: llm?.message || "",
        testedAt: now,
      },
    };

    await this.exec(
      [
        "INSERT INTO settings(key, value, updated_at)",
        `VALUES (${sqlString(MODEL_TEST_KEY)}, ${sqlString(JSON.stringify(value))}, ${sqlString(now)})`,
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;",
      ].join(" "),
    );
    return value;
  }

  async clearModelTestResult() {
    await this.ensureReady();
    await this.exec(`DELETE FROM settings WHERE key = ${sqlString(MODEL_TEST_KEY)}`);
  }

  async getKnowledgeCatalog() {
    await this.ensureReady();
    const [modules, pages] = await Promise.all([
      this.queryJson("SELECT id, title, sort_order AS sortOrder, deleted_at AS deletedAt FROM knowledge_modules"),
      this.queryJson("SELECT id, module_id AS moduleId, title, sort_order AS sortOrder, deleted_at AS deletedAt FROM knowledge_pages"),
    ]);
    return { modules, pages };
  }

  async updateKnowledgeModule(id, payload = {}) {
    await this.ensureReady();
    const moduleId = normalizeId(id);
    const now = new Date().toISOString();
    const current = await this.getKnowledgeModule(moduleId);
    const next = {
      title: Object.prototype.hasOwnProperty.call(payload, "title") ? normalizeOptionalText(payload.title) : current?.title || null,
      sortOrder: Object.prototype.hasOwnProperty.call(payload, "sortOrder") ? normalizeOptionalInteger(payload.sortOrder) : current?.sortOrder ?? null,
      deletedAt: Object.prototype.hasOwnProperty.call(payload, "deletedAt") ? payload.deletedAt : current?.deletedAt || null,
    };

    await this.exec(
      [
        "INSERT INTO knowledge_modules(id, title, sort_order, deleted_at, updated_at)",
        `VALUES (${sqlString(moduleId)}, ${sqlString(next.title)}, ${sqlValue(next.sortOrder)}, ${sqlString(next.deletedAt)}, ${sqlString(now)})`,
        "ON CONFLICT(id) DO UPDATE SET",
        "title = excluded.title, sort_order = excluded.sort_order, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;",
      ].join(" "),
    );
    return { id: moduleId, ...next, updatedAt: now };
  }

  async updateKnowledgePage(id, payload = {}) {
    await this.ensureReady();
    const pageId = normalizeId(id);
    const now = new Date().toISOString();
    const current = await this.getKnowledgePage(pageId);
    const next = {
      moduleId: Object.prototype.hasOwnProperty.call(payload, "moduleId") ? normalizeOptionalText(payload.moduleId) : current?.moduleId || null,
      title: Object.prototype.hasOwnProperty.call(payload, "title") ? normalizeOptionalText(payload.title) : current?.title || null,
      sortOrder: Object.prototype.hasOwnProperty.call(payload, "sortOrder") ? normalizeOptionalInteger(payload.sortOrder) : current?.sortOrder ?? null,
      deletedAt: Object.prototype.hasOwnProperty.call(payload, "deletedAt") ? payload.deletedAt : current?.deletedAt || null,
    };

    await this.exec(
      [
        "INSERT INTO knowledge_pages(id, module_id, title, sort_order, deleted_at, updated_at)",
        `VALUES (${sqlString(pageId)}, ${sqlString(next.moduleId)}, ${sqlString(next.title)}, ${sqlValue(next.sortOrder)}, ${sqlString(next.deletedAt)}, ${sqlString(now)})`,
        "ON CONFLICT(id) DO UPDATE SET",
        "module_id = excluded.module_id, title = excluded.title, sort_order = excluded.sort_order, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;",
      ].join(" "),
    );
    return { id: pageId, ...next, updatedAt: now };
  }

  async reorderKnowledge({ modules = [], pages = [] } = {}) {
    await this.ensureReady();
    const updatedModules = [];
    const updatedPages = [];
    for (const module of modules) {
      updatedModules.push(await this.updateKnowledgeModule(module.id, { sortOrder: module.sortOrder, deletedAt: null }));
    }
    for (const page of pages) {
      updatedPages.push(
        await this.updateKnowledgePage(page.id, {
          moduleId: page.moduleId,
          sortOrder: page.sortOrder,
          deletedAt: null,
        }),
      );
    }
    return { modules: updatedModules, pages: updatedPages };
  }

  async softDeleteKnowledgePage(id) {
    return this.updateKnowledgePage(id, { deletedAt: new Date().toISOString() });
  }

  async softDeleteKnowledgeModule(id) {
    return this.updateKnowledgeModule(id, { deletedAt: new Date().toISOString() });
  }

  async getChatMessages(pageId, limit = 50) {
    await this.ensureReady();
    const session = await this.getChatSessionByPageId(pageId);
    if (!session) return [];
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    const rows = await this.queryJson(
      [
        "SELECT id, role, content, answer_html AS answerHtml, sources_json AS sourcesJson, created_at AS createdAt",
        "FROM chat_messages",
        `WHERE session_id = ${sqlString(session.id)}`,
        "ORDER BY created_at DESC",
        `LIMIT ${safeLimit}`,
      ].join(" "),
    );
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      answerHtml: row.answerHtml || "",
      sources: parseJsonArray(row.sourcesJson),
      createdAt: row.createdAt,
    }));
  }

  async appendChatMessage(pageId, message = {}) {
    await this.ensureReady();
    const session = await this.ensureChatSession(pageId, message.title || "");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = String(message.content || "").trim();
    if (!content) return null;
    await this.exec(
      [
        "INSERT INTO chat_messages(id, session_id, role, content, answer_html, sources_json, created_at)",
        "VALUES (",
        [
          sqlString(id),
          sqlString(session.id),
          sqlString(role),
          sqlString(content),
          sqlString(message.answerHtml || ""),
          sqlString(JSON.stringify(Array.isArray(message.sources) ? message.sources : [])),
          sqlString(now),
        ].join(", "),
        ");",
      ].join(" "),
    );
    await this.exec(`UPDATE chat_sessions SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(session.id)}`);
    return { id, role, content, answerHtml: message.answerHtml || "", sources: message.sources || [], createdAt: now };
  }

  modelSettingsSignature(settings = {}) {
    const normalized = normalizeModelSettings(settings);
    return crypto
      .createHash("sha256")
      .update([normalized.provider, normalized.baseUrl, normalized.model, normalized.apiKey].join("\0"))
      .digest("hex");
  }

  async buildModelEnv(baseEnv = process.env, overrides = {}) {
    const settings = normalizeModelSettings({
      ...(await this.getModelSettings()),
      ...overrides,
    });
    return {
      ...baseEnv,
      DEEPSEEK_PROVIDER: settings.provider,
      CODEWHALE_PROVIDER: settings.provider,
      DEEPSEEK_BASE_URL: settings.baseUrl,
      DEEPSEEK_MODEL: settings.model,
      CODEWHALE_MODEL: settings.model,
      DEEPSEEK_API_KEY: settings.apiKey,
    };
  }

  publicModelSettings(settings) {
    const normalized = normalizeModelSettings(settings);
    return {
      provider: normalized.provider,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      configured: Boolean(normalized.apiKey),
      apiKeyMasked: maskSecret(normalized.apiKey),
      updatedAt: normalized.updatedAt || null,
      dbPath: this.dbPath,
    };
  }

  async ensureReady() {
    if (!this.ready) await this.init();
  }

  async getKnowledgeModule(id) {
    const rows = await this.queryJson(
      `SELECT id, title, sort_order AS sortOrder, deleted_at AS deletedAt FROM knowledge_modules WHERE id = ${sqlString(id)} LIMIT 1`,
    );
    return rows[0] || null;
  }

  async getKnowledgePage(id) {
    const rows = await this.queryJson(
      `SELECT id, module_id AS moduleId, title, sort_order AS sortOrder, deleted_at AS deletedAt FROM knowledge_pages WHERE id = ${sqlString(id)} LIMIT 1`,
    );
    return rows[0] || null;
  }

  async getChatSessionByPageId(pageId) {
    const rows = await this.queryJson(
      `SELECT id, page_id AS pageId, title, created_at AS createdAt, updated_at AS updatedAt FROM chat_sessions WHERE page_id = ${sqlString(pageId)} LIMIT 1`,
    );
    return rows[0] || null;
  }

  async ensureChatSession(pageId, title = "") {
    const normalizedPageId = normalizeId(pageId);
    const existing = await this.getChatSessionByPageId(normalizedPageId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const id = `chat-${crypto.randomUUID()}`;
    await this.exec(
      [
        "INSERT INTO chat_sessions(id, page_id, title, created_at, updated_at)",
        `VALUES (${sqlString(id)}, ${sqlString(normalizedPageId)}, ${sqlString(title)}, ${sqlString(now)}, ${sqlString(now)})`,
      ].join(" "),
    );
    return { id, pageId: normalizedPageId, title, createdAt: now, updatedAt: now };
  }

  async seedFromEnvIfNeeded() {
    if (!this.env.DEEPSEEK_API_KEY) return;
    const rows = await this.queryJson("SELECT key FROM settings WHERE key = 'apiKey' LIMIT 1");
    if (rows.length) return;
    await this.saveModelSettings({
      provider: this.env.DEEPSEEK_PROVIDER || this.env.CODEWHALE_PROVIDER || DEFAULT_PROVIDER,
      baseUrl: this.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
      model: this.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      apiKey: this.env.DEEPSEEK_API_KEY,
    });
  }

  async exec(sql) {
    await execFileAsync(this.sqlitePath, [this.dbPath, sql], { timeout: 10_000 });
  }

  async queryJson(sql) {
    const { stdout } = await execFileAsync(this.sqlitePath, ["-json", this.dbPath, sql], { timeout: 10_000 });
    const text = stdout.trim();
    return text ? JSON.parse(text) : [];
  }
}

export function normalizeModelSettings(settings = {}) {
  return {
    provider: String(settings.provider || DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER,
    baseUrl: String(settings.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_BASE_URL,
    model: String(settings.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    apiKey: String(settings.apiKey || "").trim(),
    updatedAt: settings.updatedAt || null,
  };
}

export function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 5)}***${text.slice(-4)}`;
}

function latestUpdatedAt(rows) {
  return rows.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || null;
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return Number.isFinite(Number(value)) ? String(Number(value)) : "NULL";
}

function normalizeId(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("ID is required.");
  return text;
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
