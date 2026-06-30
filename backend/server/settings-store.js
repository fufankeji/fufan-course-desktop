import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const MODEL_KEYS = ["provider", "baseUrl", "model", "apiKey"];
const MODEL_TEST_KEY = "modelTest";

export class SettingsStore {
  constructor({ projectRoot, dbPath, sqlitePath = "sqlite3", env = process.env } = {}) {
    this.projectRoot = projectRoot || process.cwd();
    this.storePath = resolveStorePath({ projectRoot: this.projectRoot, dbPath });
    this.dbPath = this.storePath;
    this.sqlitePath = sqlitePath;
    this.env = env;
    this.ready = false;
    this.data = createEmptyStore();
  }

  async init() {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    this.data = await this.loadStore();
    this.ready = true;
    await this.seedFromEnvIfNeeded();
    return this;
  }

  async getModelSettings() {
    await this.ensureReady();
    const saved = this.data.settings || {};
    const fromEnv = {
      provider: this.env.DEEPSEEK_PROVIDER || this.env.CODEWHALE_PROVIDER || DEFAULT_PROVIDER,
      baseUrl: this.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
      model: this.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      apiKey: this.env.DEEPSEEK_API_KEY || "",
    };
    return normalizeModelSettings({
      provider: saved.provider?.value || fromEnv.provider,
      baseUrl: saved.baseUrl?.value || fromEnv.baseUrl,
      model: saved.model?.value || fromEnv.model,
      apiKey: saved.apiKey?.value || fromEnv.apiKey,
      updatedAt: latestUpdatedAt(Object.values(saved)),
    });
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
      this.data.settings[key] = {
        value: next[key],
        updatedAt: now,
      };
    }
    delete this.data.settings[MODEL_TEST_KEY];
    await this.persist();
    return { ...next, updatedAt: now };
  }

  async getModelTestResult(currentSettings) {
    await this.ensureReady();
    const saved = this.data.settings?.[MODEL_TEST_KEY]?.value;
    if (!saved?.signature) return null;
    if (currentSettings && saved.signature !== this.modelSettingsSignature(currentSettings)) return null;
    return saved;
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

    this.data.settings[MODEL_TEST_KEY] = { value, updatedAt: now };
    await this.persist();
    return value;
  }

  async clearModelTestResult() {
    await this.ensureReady();
    delete this.data.settings[MODEL_TEST_KEY];
    await this.persist();
  }

  async getKnowledgeCatalog() {
    await this.ensureReady();
    return {
      modules: Object.values(this.data.knowledgeModules || {}),
      pages: Object.values(this.data.knowledgePages || {}),
    };
  }

  async updateKnowledgeModule(id, payload = {}) {
    await this.ensureReady();
    const moduleId = normalizeId(id);
    const now = new Date().toISOString();
    const current = this.data.knowledgeModules[moduleId] || null;
    const next = {
      id: moduleId,
      title: Object.prototype.hasOwnProperty.call(payload, "title") ? normalizeOptionalText(payload.title) : current?.title || null,
      sortOrder: Object.prototype.hasOwnProperty.call(payload, "sortOrder") ? normalizeOptionalInteger(payload.sortOrder) : current?.sortOrder ?? null,
      deletedAt: Object.prototype.hasOwnProperty.call(payload, "deletedAt") ? payload.deletedAt : current?.deletedAt || null,
      updatedAt: now,
    };
    this.data.knowledgeModules[moduleId] = next;
    await this.persist();
    return next;
  }

  async updateKnowledgePage(id, payload = {}) {
    await this.ensureReady();
    const pageId = normalizeId(id);
    const now = new Date().toISOString();
    const current = this.data.knowledgePages[pageId] || null;
    const next = {
      id: pageId,
      moduleId: Object.prototype.hasOwnProperty.call(payload, "moduleId") ? normalizeOptionalText(payload.moduleId) : current?.moduleId || null,
      title: Object.prototype.hasOwnProperty.call(payload, "title") ? normalizeOptionalText(payload.title) : current?.title || null,
      sortOrder: Object.prototype.hasOwnProperty.call(payload, "sortOrder") ? normalizeOptionalInteger(payload.sortOrder) : current?.sortOrder ?? null,
      deletedAt: Object.prototype.hasOwnProperty.call(payload, "deletedAt") ? payload.deletedAt : current?.deletedAt || null,
      updatedAt: now,
    };
    this.data.knowledgePages[pageId] = next;
    await this.persist();
    return next;
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
    return this.data.chatMessages
      .filter((message) => message.sessionId === session.id)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
      .slice(-safeLimit)
      .map(publicChatMessage);
  }

  async appendChatMessage(pageId, message = {}) {
    await this.ensureReady();
    const session = await this.ensureChatSession(pageId, message.title || "");
    const content = String(message.content || "").trim();
    if (!content) return null;

    const now = new Date().toISOString();
    const entry = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content,
      answerHtml: message.answerHtml || "",
      sources: Array.isArray(message.sources) ? message.sources : [],
      createdAt: now,
    };
    this.data.chatMessages.push(entry);
    this.data.chatSessions[session.id] = { ...session, updatedAt: now };
    await this.persist();
    return publicChatMessage(entry);
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
    await this.ensureReady();
    return this.data.knowledgeModules[normalizeId(id)] || null;
  }

  async getKnowledgePage(id) {
    await this.ensureReady();
    return this.data.knowledgePages[normalizeId(id)] || null;
  }

  async getChatSessionByPageId(pageId) {
    await this.ensureReady();
    const normalizedPageId = normalizeId(pageId);
    return Object.values(this.data.chatSessions).find((session) => session.pageId === normalizedPageId) || null;
  }

  async ensureChatSession(pageId, title = "") {
    await this.ensureReady();
    const normalizedPageId = normalizeId(pageId);
    const existing = await this.getChatSessionByPageId(normalizedPageId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const session = {
      id: `chat-${crypto.randomUUID()}`,
      pageId: normalizedPageId,
      title,
      createdAt: now,
      updatedAt: now,
    };
    this.data.chatSessions[session.id] = session;
    await this.persist();
    return session;
  }

  async seedFromEnvIfNeeded() {
    if (!this.env.DEEPSEEK_API_KEY) return;
    if (this.data.settings.apiKey?.value) return;
    await this.saveModelSettings({
      provider: this.env.DEEPSEEK_PROVIDER || this.env.CODEWHALE_PROVIDER || DEFAULT_PROVIDER,
      baseUrl: this.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
      model: this.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      apiKey: this.env.DEEPSEEK_API_KEY,
    });
  }

  async loadStore() {
    try {
      const text = await fs.readFile(this.storePath, "utf8");
      return normalizeStore(JSON.parse(text));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return createEmptyStore();
    }
  }

  async persist() {
    const tempPath = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(tempPath, `${JSON.stringify(normalizeStore(this.data), null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.storePath);
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

function resolveStorePath({ projectRoot, dbPath }) {
  if (dbPath && !String(dbPath).endsWith(".sqlite")) return path.resolve(dbPath);
  return path.resolve(projectRoot, "data", "settings.json");
}

function createEmptyStore() {
  return {
    version: 1,
    settings: {},
    knowledgeModules: {},
    knowledgePages: {},
    chatSessions: {},
    chatMessages: [],
  };
}

function normalizeStore(value) {
  const store = createEmptyStore();
  if (!value || typeof value !== "object") return store;
  return {
    version: 1,
    settings: normalizeRecordMap(value.settings),
    knowledgeModules: normalizeEntityMap(value.knowledgeModules),
    knowledgePages: normalizeEntityMap(value.knowledgePages),
    chatSessions: normalizeEntityMap(value.chatSessions),
    chatMessages: Array.isArray(value.chatMessages) ? value.chatMessages.map(normalizeChatMessage).filter(Boolean) : [],
  };
}

function normalizeRecordMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, record]) => [
      key,
      {
        value: record?.value,
        updatedAt: record?.updatedAt || null,
      },
    ]),
  );
}

function normalizeEntityMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === "object"));
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== "object" || !message.id || !message.sessionId || !message.content) return null;
  return {
    id: String(message.id),
    sessionId: String(message.sessionId),
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content),
    answerHtml: String(message.answerHtml || ""),
    sources: Array.isArray(message.sources) ? message.sources : [],
    createdAt: message.createdAt || new Date().toISOString(),
  };
}

function publicChatMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    answerHtml: message.answerHtml || "",
    sources: Array.isArray(message.sources) ? message.sources : [],
    createdAt: message.createdAt,
  };
}

function latestUpdatedAt(rows) {
  return rows.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || null;
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
