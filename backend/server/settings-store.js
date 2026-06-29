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
