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
