import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createTerminalScreen } from "../../frontend/terminal-screen.js";
import { shouldSubmitTerminalKey, terminalInputChunks, terminalSubmitDelayMs } from "../../frontend/terminal-input.js";
import { cleanTerminalTranscript, terminalTurnCompleted } from "../../frontend/terminal-transcript.js";

const projectRoot = new URL("../..", import.meta.url).pathname;

test("terminal screen applies cursor movement and clear screen redraws", () => {
  const screen = createTerminalScreen({ cols: 12, rows: 4 });

  screen.write("first frame");
  screen.write("\x1b[2J\x1b[1;1HAgent\n\x1b[3;4HReady");

  const rendered = screen.toString();

  assert.match(rendered, /^Agent/m);
  assert.match(rendered, /^   Ready/m);
  assert.doesNotMatch(rendered, /first frame/);
});

test("terminal screen keeps redraws in a fixed viewport instead of appending frames", () => {
  const screen = createTerminalScreen({ cols: 14, rows: 3 });

  screen.write("\x1b[2J\x1b[1;1HFrame A");
  screen.write("\x1b[2J\x1b[1;1HFrame B");

  const rendered = screen.toString();

  assert.equal(rendered.split("\n").length, 3);
  assert.match(rendered, /Frame B/);
  assert.doesNotMatch(rendered, /Frame A/);
});

test("terminal input sends content and enter as separate terminal writes", () => {
  assert.deepEqual(terminalInputChunks("你好"), ["你好", "\r"]);
  assert.deepEqual(terminalInputChunks("   "), ["\r"]);
  assert.ok(terminalSubmitDelayMs("你好") >= 300);
});

test("terminal input submits on Enter and keeps Shift Enter for newline", () => {
  assert.equal(shouldSubmitTerminalKey({ key: "Enter" }), true);
  assert.equal(shouldSubmitTerminalKey({ key: "Enter", ctrlKey: true }), true);
  assert.equal(shouldSubmitTerminalKey({ key: "Enter", metaKey: true }), true);
  assert.equal(shouldSubmitTerminalKey({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitTerminalKey({ key: "Enter", isComposing: true }), false);
  assert.equal(shouldSubmitTerminalKey({ key: "a" }), false);
});

test("terminal screen renders box drawing characters as single-width cells", () => {
  const screen = createTerminalScreen({ cols: 8, rows: 2 });

  screen.write("┌──┐");
  assert.equal(screen.toString().split("\n")[0], "┌──┐");

  screen.write("\x1b[1;2HXX\x1b[1X");
  assert.equal(screen.toString().split("\n")[0], "┌XX");
});

test("terminal screen clears continuation cells when wide characters overwrite line art", () => {
  const screen = createTerminalScreen({ cols: 12, rows: 2 });

  screen.write("────────────");
  screen.write("\x1b[1;1H你好");

  const line = screen.toString().split("\n")[0];
  assert.match(line, /^你好/);
  assert.doesNotMatch(line, /^你─好/);
});

test("terminal screen preserves split ANSI control sequences across chunks", () => {
  const screen = createTerminalScreen({ cols: 12, rows: 2 });

  screen.write("old");
  screen.write("\x1b[2");
  screen.write("J\x1b[1");
  screen.write(";1Hnew");

  const rendered = screen.toString();
  assert.match(rendered, /^new/);
  assert.doesNotMatch(rendered, /old|;1H/);
});

test("terminal transcript extracts assistant text from raw TUI chrome", () => {
  const raw = [
    "请加载课程 Skill：context-compression",
    "当前课件：2. Windows配置Python环境",
    "┌输入区──────────────────────────✓ turn completed┐",
    "│编写任务或使用 /。                              │",
    "└────────────────────────────────────────────────┘",
    "Agent context-engineering · deepseek-v4-flash 🐳 ◆ max 2% ▰▱▱▱",
    "● 你好！我是 FuFan Agent，准备好为你工作了。",
    "agent · deepseek-v4-flash · idle",
    "✓ turn completed",
  ].join("\n");

  assert.equal(terminalTurnCompleted(raw), true);
  assert.equal(cleanTerminalTranscript(raw, { submitted: "你好" }), "你好！我是 FuFan Agent，准备好为你工作了。");
});

test("terminal transcript drops inline footer chrome after assistant output", () => {
  const raw = [
    "你",
    "帮我解释这节课程的关键步骤",
    "赋范智能体",
    "● 你好！我是赋范智能体，赋范空间课程平台中的课程学习助手。",
    "当前课件是「2. Windows配置Python环境」，当前能力包是 context-compression",
    "如果你有相关问题或想继续学习，可以随时问我提问 🙂 你好",
    "帮 cancel Repo: context-engineering @ main tok live · out ~4.2/s liv",
    "✓ turn completed",
  ].join("\n");

  assert.equal(
    cleanTerminalTranscript(raw, { submitted: "帮我解释这节课程的关键步骤" }),
    [
      "你好！我是赋范智能体，赋范空间课程平台中的课程学习助手。",
      "当前课件是「2. Windows配置Python环境」，当前能力包是 context-compression",
      "如果你有相关问题或想继续学习，可以随时问我提问 🙂 你好",
    ].join("\n"),
  );
});

test("terminal user messages align to the same left column as assistant messages", async () => {
  const css = await fs.readFile(path.join(projectRoot, "frontend", "styles.css"), "utf8");

  assert.doesNotMatch(css, /\.terminal-message\.user\s*\{[^}]*margin-left\s*:\s*auto\b[^}]*\}/s);
});

test("terminal frontend exposes a real xterm surface instead of a textarea wrapper", async () => {
  const html = await fs.readFile(path.join(projectRoot, "frontend", "index.html"), "utf8");
  const app = await fs.readFile(path.join(projectRoot, "frontend", "app.js"), "utf8");
  const css = await fs.readFile(path.join(projectRoot, "frontend", "styles.css"), "utf8");

  assert.match(html, /id="terminal-emulator"/);
  assert.doesNotMatch(html, /id="terminal-input"/);
  assert.doesNotMatch(html, /id="terminal-command-menu"/);

  assert.match(app, /new Terminal\(/);
  assert.match(app, /\.onData\(/);
  assert.match(app, /fitTerminalToPanel/);
  assert.doesNotMatch(app, /cleanTerminalTranscript/);
  assert.doesNotMatch(app, /beginTerminalTurn/);

  assert.match(css, /\.terminal-emulator/);
  assert.match(css, /\.xterm/);
});

test("terminal close detaches the panel instead of stopping the TUI session", async () => {
  const app = await fs.readFile(path.join(projectRoot, "frontend", "app.js"), "utf8");
  const closeBody = functionBody(app, "closeTerminalPanel");
  const openBody = functionBody(app, "openTerminalPanel");

  assert.match(closeBody, /detachTerminalSession\(\)/);
  assert.doesNotMatch(closeBody, /stopTerminalSession\(\)/);
  assert.doesNotMatch(closeBody, /DELETE/);
  assert.doesNotMatch(openBody, /stopTerminalSession\(\)/);
});

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`unterminated function ${name}`);
}
