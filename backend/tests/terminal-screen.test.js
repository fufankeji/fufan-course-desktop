import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalScreen } from "../../frontend/terminal-screen.js";
import { terminalInputChunks, terminalSubmitDelayMs } from "../../frontend/terminal-input.js";
import { cleanTerminalTranscript, terminalTurnCompleted } from "../../frontend/terminal-transcript.js";

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
    "┌Composer────────────────────────✓ turn completed┐",
    "│Write a task or use /.                          │",
    "└────────────────────────────────────────────────┘",
    "Agent context-engineering · deepseek-v4-flash 🐳 ◆ max 2% ▰▱▱▱",
    "● 你好！我是 FuFan Agent，准备好为你工作了。",
    "agent · deepseek-v4-flash · idle",
    "✓ turn completed",
  ].join("\n");

  assert.equal(terminalTurnCompleted(raw), true);
  assert.equal(cleanTerminalTranscript(raw, { submitted: "你好" }), "你好！我是 FuFan Agent，准备好为你工作了。");
});
