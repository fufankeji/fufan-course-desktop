import assert from "node:assert/strict";
import test from "node:test";

import { searchPages } from "../server/search.js";

const pages = [
  {
    id: "rag-project",
    title: "企业级 RAG 问答系统",
    module: "flagship-rag",
    type: "project",
    tags: ["RAG", "问答", "评估"],
    summary: "从文档切分、召回、重排到答案评估的项目闭环。",
    plainText: "RAG 系统包含 ingestion pipeline、hybrid retrieval、LLM-as-a-Judge。",
  },
  {
    id: "coding-tools",
    title: "AI 编程工具入门",
    module: "foundation",
    type: "lesson",
    tags: ["Claude Code", "Codex", "Vibe Coding"],
    summary: "配置 Claude Code、Codex 与 OpenCode，建立工程化协作习惯。",
    plainText: "学习如何使用 AI 编程工具完成需求拆解、代码生成和测试。",
  },
  {
    id: "deployment",
    title: "Agent 部署上线",
    module: "engineering",
    type: "lesson",
    tags: ["FastAPI", "Docker", "运维", "评估"],
    summary: "把 Agent 服务封装成接口并部署上线，包含上线前评估。",
    plainText: "包含容器化、日志追踪、健康检查、上线前评估和回归测试。",
  },
];

test("searchPages ranks mixed Chinese and English queries", () => {
  const results = searchPages(pages, "RAG 评估怎么做");

  assert.equal(results[0].id, "rag-project");
  assert.ok(results[0].score > results[1].score);
  assert.match(results[0].snippet, /评估|RAG/);
});

test("searchPages respects module filters", () => {
  const results = searchPages(pages, "工具", { moduleId: "foundation" });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "coding-tools");
});
