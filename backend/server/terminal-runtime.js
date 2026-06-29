import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getSkillPack } from "./skill-packs.js";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const DEFAULT_MODEL = "deepseek-v4-flash";
const EVENT_HISTORY_LIMIT = 250;

export async function getTerminalRuntimeStatus(projectRoot, env = process.env) {
  const binaryPath = path.resolve(projectRoot, env.CODEWHALE_TUI_BINARY || defaultTuiRuntimePath());
  try {
    const stat = await fs.stat(binaryPath);
    return {
      available: stat.isFile(),
      kind: "codewhale-tui",
      binaryPath,
    };
  } catch {
    return {
      available: false,
      kind: "codewhale-tui",
      binaryPath,
    };
  }
}

export function defaultTuiRuntimePath(platform = process.platform) {
  return path.join("runtime", "bin", platform === "win32" ? "codewhale-tui.exe" : "codewhale-tui");
}

export async function buildTerminalLaunch({
  projectRoot,
  packId,
  skillId,
  page,
  env = process.env,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
}) {
  const pack = await getSkillPack(projectRoot, packId);
  if (!pack) {
    const error = new Error(`未找到能力包：${packId}`);
    error.code = "SKILL_PACK_NOT_FOUND";
    throw error;
  }
  const skill = resolvePackSkill(pack, skillId);

  const runtime = await getTerminalRuntimeStatus(projectRoot, env);
  if (!runtime.available) {
    const error = new Error(`未找到赋范智能体运行环境：${runtime.binaryPath}`);
    error.code = "TERMINAL_RUNTIME_MISSING";
    throw error;
  }

  const codewhaleHome = path.join(pack.absolutePath, ".codewhale-home");
  await fs.mkdir(codewhaleHome, { recursive: true });

  const lessonContext = page ? await writeCourseSessionContext(pack, page, skill) : null;
  const configPath = pack.files.codewhaleConfig;
  const terminalEnv = {
    ...process.env,
    ...env,
    TERM: env.TERM || "xterm-256color",
    COLORTERM: env.COLORTERM || "truecolor",
    CODEWHALE_PROVIDER: env.CODEWHALE_PROVIDER || env.DEEPSEEK_PROVIDER || "deepseek",
    DEEPSEEK_PROVIDER: env.DEEPSEEK_PROVIDER || env.CODEWHALE_PROVIDER || "deepseek",
    DEEPSEEK_MODEL: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    CODEWHALE_MODEL: env.CODEWHALE_MODEL || env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    DEEPSEEK_CONFIG_PATH: configPath,
    CODEWHALE_CONFIG_PATH: configPath,
    CODEWHALE_HOME: codewhaleHome,
  };

  return {
    command: env.PYTHON || env.PYTHON3 || "python3",
    args: [path.join(projectRoot, "server", "pty_bridge.py"), runtime.binaryPath, String(cols), String(rows)],
    cwd: pack.absolutePath,
    env: terminalEnv,
    pack,
    runtime,
    page: page ? summarizeLaunchPage(page) : null,
    skill,
    contextFile: lessonContext?.contextFile || null,
    relativeContextFile: lessonContext?.relativeContextFile || null,
    bootstrapPrompt: buildBootstrapPrompt({
      page,
      skill,
      relativeContextFile: lessonContext?.relativeContextFile,
    }),
    cols,
    rows,
  };
}

export class TerminalManager {
  constructor({ projectRoot, env = process.env, spawnImpl = spawn } = {}) {
    this.projectRoot = projectRoot;
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.sessions = new Map();
  }

  setEnv(env = process.env) {
    this.env = env;
  }

  async status() {
    const runtime = await getTerminalRuntimeStatus(this.projectRoot, this.env);
    return {
      ...runtime,
      configured: Boolean(this.env.DEEPSEEK_API_KEY),
      model: this.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    };
  }

  async startSession({ packId, page, skillId, cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
    const launch = await buildTerminalLaunch({
      projectRoot: this.projectRoot,
      packId: packId || "context-engineering",
      skillId,
      page,
      env: this.env,
      cols,
      rows,
    });

    const id = crypto.randomUUID();
    const child = this.spawnImpl(launch.command, launch.args, {
      cwd: launch.cwd,
      env: launch.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const session = new TerminalSession({ id, packId: launch.pack.id, child, launch });
    this.sessions.set(id, session);

    child.stdout.on("data", (chunk) => session.output(chunk));
    child.stderr.on("data", (chunk) => session.output(chunk));
    child.on("error", (error) => session.fail(error));
    child.on("exit", (code, signal) => {
      session.exit(code, signal);
      setTimeout(() => {
        if (this.sessions.get(id) === session) this.sessions.delete(id);
      }, 30_000).unref?.();
    });

    session.status("running");
    return session.summary();
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  writeInput(id, data) {
    const session = this.getSession(id);
    if (!session) return false;
    session.write(data);
    return true;
  }

  stopSession(id) {
    const session = this.getSession(id);
    if (!session) return false;
    session.stop();
    this.sessions.delete(id);
    return true;
  }

  eventStream(id) {
    const session = this.getSession(id);
    if (!session) return null;
    return terminalEventStream(session);
  }
}

class TerminalSession {
  constructor({ id, packId, child, launch }) {
    this.id = id;
    this.packId = packId;
    this.child = child;
    this.launch = launch;
    this.state = "starting";
    this.history = [];
    this.subscribers = new Set();
  }

  summary() {
    return {
      id: this.id,
      packId: this.packId,
      status: this.state,
      cwd: this.launch.cwd,
      model: this.launch.env.DEEPSEEK_MODEL,
      page: this.launch.page,
      skill: this.launch.skill
        ? {
            id: this.launch.skill.id,
            name: this.launch.skill.name,
            description: this.launch.skill.description,
          }
        : null,
      relativeContextFile: this.launch.relativeContextFile,
      bootstrapPrompt: this.launch.bootstrapPrompt,
    };
  }

  subscribe(send) {
    for (const event of this.history) send(event);
    this.subscribers.add(send);
    send({ type: "hello", session: this.summary() });
    return () => this.subscribers.delete(send);
  }

  emit(event) {
    const next = {
      at: new Date().toISOString(),
      ...event,
    };
    this.history.push(next);
    if (this.history.length > EVENT_HISTORY_LIMIT) {
      this.history.splice(0, this.history.length - EVENT_HISTORY_LIMIT);
    }
    for (const send of this.subscribers) send(next);
  }

  status(state) {
    this.state = state;
    this.emit({ type: "status", status: state, session: this.summary() });
  }

  output(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    this.emit({
      type: "output",
      encoding: "base64",
      data: buffer.toString("base64"),
    });
  }

  write(data) {
    if (!this.child.stdin.writable) return;
    this.child.stdin.write(String(data || ""));
  }

  fail(error) {
    this.state = "error";
    this.emit({
      type: "error",
      message: redactSecrets(error instanceof Error ? error.message : String(error)),
      session: this.summary(),
    });
  }

  exit(code, signal) {
    this.state = "exited";
    this.emit({
      type: "exit",
      code,
      signal,
      session: this.summary(),
    });
    this.cleanupContextFile();
  }

  stop() {
    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
    this.status("stopped");
    this.cleanupContextFile();
  }

  cleanupContextFile() {
    if (!this.launch.contextFile) return;
    const filePath = this.launch.contextFile;
    this.launch.contextFile = null;
    fs.unlink(filePath).catch(() => {});
  }
}

export function terminalEventStream(session) {
  const encoder = new TextEncoder();
  let unsubscribe = null;
  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (event) => {
          controller.enqueue(encoder.encode(`event: terminal\ndata: ${JSON.stringify(event)}\n\n`));
        };
        unsubscribe = session.subscribe(send);
      },
      cancel() {
        if (unsubscribe) unsubscribe();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    },
  );
}

function redactSecrets(message) {
  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/api key:\s*[^"'，,\s]+/gi, "api key: ***");
}

function resolvePackSkill(pack, skillId) {
  const skills = Array.isArray(pack.skills) ? pack.skills : [];
  if (!skills.length) return null;
  if (!skillId) return skills.find((skill) => skill.autoLoad) || skills[0];
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) {
    const error = new Error(`能力包 ${pack.id} 中未找到能力：${skillId}`);
    error.code = "SKILL_NOT_FOUND";
    throw error;
  }
  return skill;
}

async function writeCourseSessionContext(pack, page, skill) {
  const sessionRoot = path.join(pack.absolutePath, ".course-session");
  await fs.mkdir(sessionRoot, { recursive: true });

  const fileName = `${safeFilePart(page.id || page.title || "lesson")}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.md`;
  const contextFile = path.join(sessionRoot, fileName);
  const relativeContextFile = path.relative(pack.absolutePath, contextFile).replaceAll(path.sep, "/");
  await fs.writeFile(contextFile, renderCourseSessionContext(page, skill), "utf8");
  return { contextFile, relativeContextFile };
}

function renderCourseSessionContext(page, skill) {
  const body = page.body || page.plainText || "";
  const cappedBody = capText(body, 80_000);
  return [
    "# 当前课件上下文",
    "",
    `- 课件 ID：${page.id || ""}`,
    `- 课件标题：${page.title || ""}`,
    `- 课件类型：${page.type || ""}`,
    `- 所属模块：${page.module || ""}`,
    `- 来源路径：${page.metadata?.relativePath || page.source || ""}`,
    `- 标签：${(page.tags || []).join("、")}`,
    skill ? `- 已绑定能力：${skill.id}（${skill.name || ""}）` : "- 已绑定能力：未配置",
    skill?.description ? `- 能力说明：${skill.description}` : "",
    "",
    "## 课件摘要",
    "",
    page.summary || "无",
    "",
    "## 课件正文",
    "",
    cappedBody || "无",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildBootstrapPrompt({ page, skill, relativeContextFile }) {
  if (!page && !skill) return "";

  const lines = [
    skill ? `请加载课程能力包：${skill.id}（${skill.name || skill.id}）。` : "请进入课程能力验证模式。",
    "",
  ];

  if (skill?.paths?.codex) {
    lines.push(`能力文件：${skill.paths.codex}`, "");
  }

  if (page) {
    lines.push(`当前课件：${page.title || page.id}`);
    if (relativeContextFile) lines.push(`当前课件上下文文件：${relativeContextFile}`);
    lines.push("");
  }

  lines.push(
    "执行要求：",
    page ? `1. 第一句话必须写：已读取课件：《${page.title || page.id}》。` : "1. 第一句话必须说明已经进入课程能力验证模式。",
    "2. 先读取并理解当前课件上下文文件，把这次回答限定在当前课件和绑定能力上。",
    "3. 用 3 条以内说明这个能力包能帮这节课解决什么问题。",
    "4. 给出一个围绕当前课件可以立即运行的快速验证任务，并明确预期输出。",
    "5. 最后说明学员迁移到自己的智能体或项目时，需要复制哪些能力文件或规则。",
    "",
    "注意：本轮不要分析默认示例项目，也不要把能力包的通用验证提示词当成主任务；主任务永远是当前课件 + 当前能力包的绑定验证。",
  );

  if (skill?.quickPrompt) {
    lines.push("", "能力包原始验证提示词参考（仅作为迁移后的验证思路，本轮不要直接执行）：", skill.quickPrompt);
  }

  return lines.join("\n");
}

function summarizeLaunchPage(page) {
  return {
    id: page.id,
    title: page.title,
    module: page.module,
    type: page.type,
    summary: page.summary,
    source: page.metadata?.relativePath || page.source || "",
    tags: page.tags || [],
  };
}

function safeFilePart(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "lesson";
}

function capText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n> 当前课件内容较长，已截取前 ${maxLength} 字符用于本次能力快速验证。`;
}
