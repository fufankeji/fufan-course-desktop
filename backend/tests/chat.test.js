import assert from "node:assert/strict";
import test from "node:test";

import { answerFromCourseWiki } from "../server/chat.js";
import { parseMarkdownPage } from "../server/markdown.js";

test("chat keeps course wiki sources when DeepSeek authentication fails", async () => {
  const pages = [
    parseMarkdownPage(
      "rag.md",
      [
        "---",
        'id: "rag"',
        'title: "RAG 项目实战"',
        'summary: "企业级 RAG 需要文档摄入、检索、重排和评估。"',
        "---",
        "",
        "# RAG 项目实战",
        "",
        "企业级 RAG 需要文档摄入、检索、重排和评估。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "企业级 RAG 应该怎么学？",
    pages,
    env: { DEEPSEEK_API_KEY: "invalid" },
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "Authentication Fails, Your api key: invalid is invalid" } }), {
        status: 401,
      }),
  });

  assert.equal(result.mode, "local-simulated");
  assert.equal(result.sources.length, 1);
  assert.match(result.answer, /课程知识库/);
  assert.match(result.llmError, /模型鉴权失败/);
  assert.doesNotMatch(result.llmError, /invalid is invalid|Bearer|api key: invalid/i);
});

test("chat fallback gives a local deployment learning path", async () => {
  const pages = [
    parseMarkdownPage(
      "deploy.md",
      [
        "---",
        'id: "deploy"',
        'title: "开源大模型本地部署硬件指南"',
        'summary: "本地部署开源大模型需要关注 GPU、显存、Ubuntu 和 Python 环境。"',
        "---",
        "",
        "# 开源大模型本地部署硬件指南",
        "",
        "本地部署开源大模型需要关注 GPU、显存、Ubuntu 和 Python 环境。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "我想学习本地部署开源大模型，应该先看什么？",
    pages,
    env: { DEEPSEEK_API_KEY: "" },
  });

  assert.match(result.answer, /硬件配置、GPU\/显存选择/);
});

test("chat sends compact course context to DeepSeek instead of long page bodies", async () => {
  let capturedBody = null;
  const longBody = [
    "企业级 RAG 需要先理解检索、重排和评估。",
    "课程正文里的超长细节 ".repeat(120),
    "SHOULD_NOT_SEND_FULL_BODY",
  ].join("");
  const pages = [
    parseMarkdownPage(
      "rag-long.md",
      [
        "---",
        'id: "rag-long"',
        'title: "RAG 长正文课程"',
        'summary: "企业级 RAG 的轻量摘要。"',
        "---",
        "",
        "# RAG 长正文课程",
        "",
        longBody,
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "企业级 RAG 应该怎么入门？",
    pages,
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "轻量上下文回答" } }] }), {
        status: 200,
      });
    },
  });

  assert.equal(result.mode, "deepseek");
  assert.ok(capturedBody.max_tokens <= 700, "expected chat request to cap model output tokens");
  const userContent = capturedBody.messages.find((message) => message.role === "user").content;
  assert.match(userContent, /RAG 长正文课程/);
  assert.match(userContent, /企业级 RAG 的轻量摘要/);
  assert.doesNotMatch(userContent, /SHOULD_NOT_SEND_FULL_BODY/);
  assert.ok(userContent.length < 1200, `expected compact context, got ${userContent.length} chars`);
});

test("chat prioritizes the current lesson context when pageId is provided", async () => {
  let capturedBody = null;
  const pages = [
    parseMarkdownPage(
      "gpu.md",
      [
        "---",
        'id: "gpu"',
        'title: "智选GPU算力平台"',
        'summary: "讲解阿里云 PAI-DSW、GPU 机型选择和算力平台试用流程。"',
        "---",
        "",
        "# 智选GPU算力平台",
        "",
        "学员需要理解 GPU 算力平台、PAI-DSW 交互式建模和试用流程。",
      ].join("\n"),
    ),
    parseMarkdownPage(
      "rag.md",
      [
        "---",
        'id: "rag"',
        'title: "RAG 项目实战"',
        'summary: "企业级 RAG 需要文档摄入、检索、重排和评估。"',
        "---",
        "",
        "# RAG 项目实战",
        "",
        "企业级 RAG 需要文档摄入、检索、重排和评估。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "这句话怎么理解？",
    pageId: "gpu",
    pages,
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "结合当前课件的回答" } }] }), {
        status: 200,
      });
    },
  });

  assert.equal(result.mode, "deepseek");
  assert.equal(result.sources[0].id, "gpu");
  const userContent = capturedBody.messages.find((message) => message.role === "user").content;
  assert.match(userContent, /当前课件/);
  assert.match(userContent, /智选GPU算力平台/);
  assert.match(userContent, /PAI-DSW 交互式建模/);
});

test("chat can answer selected text with only the current lesson context", async () => {
  let capturedBody = null;
  const pages = [
    parseMarkdownPage(
      "gpu.md",
      [
        "---",
        'id: "gpu"',
        'title: "智选GPU算力平台"',
        'summary: "讲解 GPU 机型选择。"',
        "---",
        "",
        "# 智选GPU算力平台",
        "",
        "当前课件强调 NVIDIA 和 AMD 是两大主流显卡生产商。",
      ].join("\n"),
    ),
    parseMarkdownPage(
      "rag.md",
      [
        "---",
        'id: "rag"',
        'title: "RAG 项目实战"',
        'summary: "企业级 RAG 需要文档摄入、检索、重排和评估。"',
        "---",
        "",
        "# RAG 项目实战",
        "",
        "企业级 RAG 需要文档摄入、检索、重排和评估。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "解释选中的 GPU 这句话",
    pageId: "gpu",
    contextMode: "current-page",
    pages,
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "只结合当前课件回答" } }] }), {
        status: 200,
      });
    },
  });

  assert.equal(result.mode, "deepseek");
  assert.deepEqual(result.sources, []);
  const userContent = capturedBody.messages.find((message) => message.role === "user").content;
  assert.match(userContent, /当前课件/);
  assert.match(userContent, /NVIDIA 和 AMD/);
  assert.doesNotMatch(userContent, /RAG 项目实战/);
});

test("chat sends recent conversation history to DeepSeek", async () => {
  let capturedBody = null;
  const pages = [
    parseMarkdownPage(
      "gpu.md",
      [
        "---",
        'id: "gpu"',
        'title: "智选GPU算力平台"',
        'summary: "讲解 GPU 云主机租赁与算力平台选择。"',
        "---",
        "",
        "# 智选GPU算力平台",
        "",
        "GPU 云主机租赁适合临时实验，但需要关注成本、稳定性和账号限制。",
      ].join("\n"),
    ),
  ];

  await answerFromCourseWiki({
    message: "继续展开一下这个判断。",
    pageId: "gpu",
    pages,
    conversationHistory: [
      {
        role: "user",
        content: "请结合当前课件解释 vast.ai 这种平台现在还可以用吗？",
      },
      {
        role: "assistant",
        content: "可以用，但要看稳定性、成本和跟课复现需求。",
      },
    ],
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "你刚才问的是 vast.ai 还能不能用。" } }] }), {
        status: 200,
      });
    },
  });

  const userContent = capturedBody.messages.find((message) => message.role === "user").content;
  assert.match(userContent, /最近对话/);
  assert.match(userContent, /vast\.ai 这种平台现在还可以用吗/);
});

test("local fallback can answer previous-question requests from conversation history", async () => {
  const pages = [
    parseMarkdownPage(
      "gpu.md",
      [
        "---",
        'id: "gpu"',
        'title: "智选GPU算力平台"',
        'summary: "讲解 GPU 云主机租赁与算力平台选择。"',
        "---",
        "",
        "# 智选GPU算力平台",
        "",
        "GPU 云主机租赁适合临时实验。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "我刚才的问题是什么？",
    pageId: "gpu",
    pages,
    conversationHistory: [{ role: "user", content: "vast.ai 这种平台现在还可以用吗？" }],
    env: { DEEPSEEK_API_KEY: "" },
  });

  assert.equal(result.mode, "local-simulated");
  assert.match(result.answer, /vast\.ai 这种平台现在还可以用吗/);
  assert.doesNotMatch(result.answer, /无法根据当前的课程资料索引/);
});

test("current lesson fallback answers directly without dumping lesson context", async () => {
  const pages = [
    parseMarkdownPage(
      "gpu.md",
      [
        "---",
        'id: "gpu"',
        'title: "智选GPU算力平台"',
        'summary: "讲解 GPU 云主机租赁与算力平台选择。"',
        "---",
        "",
        "# 智选GPU算力平台",
        "",
        "GPU云主机租赁是一种云计算服务模式，用户可以通过向云服务提供商支付租金，将GPU云主机上的计算资源用于自己的任务中。",
        "",
        "这段课件正文不应该被本地兜底回答原样输出。",
      ].join("\n"),
    ),
  ];

  const result = await answerFromCourseWiki({
    message: "这种平台现在还可以用吗？",
    pageId: "gpu",
    contextMode: "current-page",
    pages,
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
      }),
  });

  assert.equal(result.mode, "local-simulated");
  assert.match(result.llmError, /empty answer/);
  assert.match(result.answer, /判断框架|稳定可复现|成本是否可控/);
  assert.doesNotMatch(result.answer, /当前课件相关内容/);
  assert.doesNotMatch(result.answer, /GPU云主机租赁是一种云计算服务模式/);
  assert.doesNotMatch(result.answer, /这段课件正文不应该/);
});
