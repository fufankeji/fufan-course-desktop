export function shouldSubmitTerminalKey(event = {}) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

export function terminalInputChunks(value) {
  const text = String(value || "");
  if (!text.trim()) return ["\r"];
  return [text, "\r"];
}

export function terminalSubmitDelayMs(value) {
  const text = String(value || "");
  if (!text.trim()) return 0;
  return Math.min(700, Math.max(320, Array.from(text).length * 12));
}
