export function terminalTurnCompleted(text) {
  return /turn completed/i.test(String(text || ""));
}

export function cleanTerminalTranscript(text, options = {}) {
  const submitted = normalizeLine(options.submitted || "");
  const lines = stripAnsi(String(text || ""))
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => normalizeTerminalLine(line))
    .filter(Boolean)
    .filter((line) => !isTerminalChrome(line))
    .filter((line) => !isSubmittedPromptLine(line, submitted));

  const assistantStart = lines.findIndex((line) => /^●\s+/.test(line) || /^已读取课件/.test(line));
  const scoped = assistantStart >= 0 ? lines.slice(assistantStart) : lines;
  const cleaned = scoped.map((line) => line.replace(/^●\s+/, "").trim()).filter(Boolean);

  return dedupeAdjacent(cleaned).join("\n").trim();
}

function stripAnsi(value) {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "");
}

function normalizeTerminalLine(line) {
  return String(line || "")
    .replace(/[┌┐└┘├┤┬┴┼╭╮╰╯]/g, " ")
    .replace(/[─━═╼╾╴╶]+/g, " ")
    .replace(/[│┃║╎▏▎▌]/g, " ")
    .replace(/[▁▂▃▄▅▆▇█]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function isTerminalChrome(line) {
  return [
    /^Composer\b/i,
    /^Write a task or use \/\./i,
    /^Agent\s+\S+\s*[·•]/i,
    /^agent\s*[·•]/i,
    /deepseek-v4-flash.*(max|live|tok|idle|%)/i,
    /^Repo:/i,
    /^model:/i,
    /^directory:/i,
    /^>_ /i,
    /^v\d+\.\d+/i,
    /^CodeWhale TUI/i,
    /^FuFan Teaching Agent TUI/i,
    /turn completed/i,
    /reasoning done/i,
    /waiting for/i,
    /Press Esc/i,
    /Ctrl\+C/i,
    /^请加载课程 Skill/i,
    /^请加载课程能力包/i,
    /^Skill 文件：/i,
    /^能力文件：/i,
    /^当前课件：/i,
    /^当前课件上下文文件：/i,
    /^执行要求：/i,
    /^注意：/i,
    /^Skill 原始 quickPrompt/i,
    /^能力包原始验证提示词参考/i,
  ].some((pattern) => pattern.test(line));
}

function isSubmittedPromptLine(line, submitted) {
  if (!submitted) return false;
  const normalized = normalizeLine(line);
  return normalized.length >= 8 && submitted.includes(normalized.slice(0, Math.min(40, normalized.length)));
}

function dedupeAdjacent(lines) {
  const result = [];
  for (const line of lines) {
    if (result[result.length - 1] !== line) result.push(line);
  }
  return result;
}
