import { spawn } from "node:child_process";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_LLM_TIMEOUT_MS = 20_000;
const DEFAULT_CHAT_MAX_TOKENS = 640;

export function getLlmStatus(env = process.env) {
  return {
    provider: env.DEEPSEEK_PROVIDER || "deepseek",
    baseUrl: (env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, ""),
    model: env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    configured: Boolean(env.DEEPSEEK_API_KEY),
  };
}

export async function testDeepSeekConnection({ env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message: "尚未配置模型密钥。",
    };
  }

  const baseUrl = (env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const model = env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
  const startedAt = Date.now();
  try {
    const response = await postChatCompletion({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      env,
      fetchImpl,
      body: {
        model,
        messages: [
          { role: "system", content: "你是服务连通性检测助手，只回复“连接正常”。" },
          { role: "user", content: "请回复：连接正常" },
        ],
        temperature: 0,
        stream: false,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        provider: "deepseek",
        model,
        baseUrl,
        latencyMs: Date.now() - startedAt,
        message: sanitizeModelError(`模型接口 ${response.status}: ${errorText.slice(0, 240)}`),
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      provider: "deepseek",
      model,
      baseUrl,
      latencyMs: Date.now() - startedAt,
      message: payload.choices?.[0]?.message?.content?.trim() || "连接正常",
    };
  } catch (error) {
    return {
      ok: false,
      provider: "deepseek",
      model,
      baseUrl,
      latencyMs: Date.now() - startedAt,
      message: sanitizeModelError(error instanceof Error ? error.message : "模型连接失败"),
    };
  }
}

export async function answerWithDeepSeek({ message, sourcePages, env = process.env, fetchImpl = fetch }) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const model = env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
  const context = buildCourseContext(sourcePages);
  const response = await postChatCompletion({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    env,
    fetchImpl,
    body: {
      model,
      messages: [
        {
          role: "system",
          content: [
            "你是课程知识库学习助教。",
            "必须优先基于提供的课程资料索引回答，不要编造不存在的课程内容。",
            "回答要面向正在学习 AI Agent 工程课的学员，给出清晰路径、关键步骤和可执行建议。",
            "如果课程资料索引不足以回答，明确说明不足，并建议学员补充哪类资料。",
            "引用资料时使用《知识页标题》的形式。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [`用户问题：${message}`, "", "课程资料索引：", context].join("\n"),
        },
      ],
      temperature: 0.2,
      max_tokens: DEFAULT_CHAT_MAX_TOKENS,
      stream: false,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("DeepSeek API returned an empty answer.");
  }

  return {
    answer,
    mode: "deepseek",
    model,
  };
}

export function sanitizeModelError(message) {
  const sanitized = String(message)
    .replace(/api key:\s*[^"'，,\s]+/gi, "api key: ***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");

  if (/fetch failed|network|enotfound|econn|etimedout|timeout|aborted|aborterror|tls|certificate/i.test(sanitized)) {
    return "模型接口连接失败：请检查网络、接口地址或本机代理设置；模型配置已保存，知识库检索仍可正常使用。";
  }

  if (/401|authentication|invalid api key|api key:\s*\*\*\*/i.test(sanitized)) {
    return "模型鉴权失败：当前密钥无效或已过期，请在“模型配置”中更换有效密钥。";
  }

  return sanitized;
}

function createTimeoutSignal(timeoutMs) {
  const ms = Number(timeoutMs) || DEFAULT_LLM_TIMEOUT_MS;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function postChatCompletion({ url, apiKey, body, env, fetchImpl }) {
  const timeoutMs = Number(env.DEEPSEEK_TIMEOUT_MS) || DEFAULT_LLM_TIMEOUT_MS;
  const canUseCurl = fetchImpl === globalThis.fetch && env.DEEPSEEK_TRANSPORT !== "fetch";

  if (canUseCurl) {
    try {
      return await curlPostJson({ url, apiKey, body, timeoutMs });
    } catch (error) {
      if (env.DEEPSEEK_TRANSPORT === "curl") throw error;
      // Fall back to fetch below; this keeps the app usable on systems without curl.
    }
  }

  return fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    signal: createTimeoutSignal(timeoutMs),
    body: JSON.stringify(body),
  });
}

function curlPostJson({ url, apiKey, body, timeoutMs }) {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const config = [
    `url = "${escapeCurlConfig(url)}"`,
    'request = "POST"',
    `header = "authorization: Bearer ${escapeCurlConfig(apiKey)}"`,
    'header = "content-type: application/json"',
    `data = "${escapeCurlConfig(JSON.stringify(body))}"`,
    `max-time = ${timeoutSeconds}`,
    "silent",
    "show-error",
    'write-out = "\\n__HTTP_STATUS__:%{http_code}"',
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["-K", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl exited with code ${code}`));
        return;
      }

      const marker = "\n__HTTP_STATUS__:";
      const markerIndex = stdout.lastIndexOf(marker);
      if (markerIndex < 0) {
        reject(new Error("curl response missing HTTP status"));
        return;
      }

      const text = stdout.slice(0, markerIndex);
      const status = Number(stdout.slice(markerIndex + marker.length).trim());
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
        json: async () => JSON.parse(text),
      });
    });

    child.stdin.end(config);
  });
}

function escapeCurlConfig(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function buildCourseContext(sourcePages) {
  return sourcePages
    .slice(0, 5)
    .map((page, index) => {
      const lines = [
        `【资料 ${index + 1}】《${page.title}》`,
        `来源：${page.metadata?.relativePath || page.path || page.id}`,
      ];
      const tags = Array.isArray(page.tags) ? page.tags.filter(Boolean).slice(0, 6) : [];
      if (tags.length) lines.push(`标签：${tags.join("、")}`);
      lines.push(`摘要：${capText(page.summary || "无", 360)}`);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

function capText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}
