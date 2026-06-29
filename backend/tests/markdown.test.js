import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownPage, renderMarkdownToHtml } from "../server/markdown.js";

test("parseMarkdownPage extracts frontmatter, headings, and body", () => {
  const page = parseMarkdownPage(
    "sample.md",
    [
      "---",
      "id: sample-agent-rag",
      "title: Agentic RAG 入门",
      "type: concept",
      "module: flagship-rag",
      "tags: [RAG, Agent, 检索增强]",
      "difficulty: 中级",
      "---",
      "",
      "# Agentic RAG 入门",
      "",
      "Agentic RAG 会把检索、规划、工具调用放到一个可控流程中。",
      "",
      "## 适合场景",
      "",
      "- 企业知识库问答",
      "- 文档审查",
    ].join("\n"),
  );

  assert.equal(page.id, "sample-agent-rag");
  assert.equal(page.title, "Agentic RAG 入门");
  assert.equal(page.type, "concept");
  assert.equal(page.module, "flagship-rag");
  assert.deepEqual(page.tags, ["RAG", "Agent", "检索增强"]);
  assert.equal(page.headings.length, 2);
  assert.match(page.plainText, /企业知识库问答/);
});

test("renderMarkdownToHtml renders safe basic markdown", () => {
  const html = renderMarkdownToHtml("# 标题\n\n<script>x</script>\n\n- A\n- B");

  assert.match(html, /<h1>标题<\/h1>/);
  assert.doesNotMatch(html, /<script|&lt;script|x<\/script>/);
  assert.match(html, /<ul>/);
});

test("renderMarkdownToHtml renders notebook-style course markdown", () => {
  const html = renderMarkdownToHtml(
    [
      "# <center>本地部署开源大模型</center>",
      "",
      "&emsp;&emsp;为了在本地有效部署和使用开源大模型。",
      "",
      "> 来源：`1. 开源大模型本地部署硬件指南.ipynb`",
      "",
      "1. 配置个人计算机或服务器",
      "2. 租用在线 GPU 服务",
      "",
      "![架构图](https://example.com/course.png)",
      "[课程资料](https://example.com)",
    ].join("\n"),
  );

  assert.match(html, /<h1>本地部署开源大模型<\/h1>/);
  assert.doesNotMatch(html, /&lt;center&gt;|<center>|&emsp;/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<img src="https:\/\/example.com\/course.png"/);
  assert.match(html, /<a href="https:\/\/example.com"/);
});

test("renderMarkdownToHtml renders course raw html images and markdown tables", () => {
  const html = renderMarkdownToHtml(
    [
      "- Step 1. 进入阿里云官网：https://cn.aliyun.com/",
      "",
      '<div align=center><img src="https://snowball101.oss-cn-beijing.aliyuncs.com/img/202312221145635.png" width=70%></div>',
      "",
      "| 平台 | 免费额度 | 适合场景 |",
      "| --- | --- | --- |",
      "| PAI-DSW | 有 | 交互式建模 |",
      "",
      '<script>alert("xss")</script>',
    ].join("\n"),
  );

  assert.match(html, /<img src="https:\/\/snowball101\.oss-cn-beijing\.aliyuncs\.com\/img\/202312221145635\.png"/);
  assert.match(html, /width="70%"/);
  assert.match(html, /class="markdown-media"/);
  assert.doesNotMatch(html, /&lt;div align=center&gt;/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>平台<\/th>/);
  assert.match(html, /<td>PAI-DSW<\/td>/);
  assert.doesNotMatch(html, /<script|alert\("xss"\)/);
});

test("renderMarkdownToHtml keeps html-indented Chinese paragraphs out of code blocks", () => {
  const html = renderMarkdownToHtml(
    [
      "&emsp;&emsp;如果需要实践大模型的相关测试，闭眼选交互式建模PAD-DSW。",
      "",
      "&emsp;&emsp;领取试用产品的方式也比较方便。",
    ].join("\n"),
  );

  assert.match(html, /<p>如果需要实践大模型的相关测试，闭眼选交互式建模PAD-DSW。<\/p>/);
  assert.match(html, /<p>领取试用产品的方式也比较方便。<\/p>/);
  assert.doesNotMatch(html, /<pre>|<code>如果需要实践大模型/);
});

test("parseMarkdownPage sanitizes legacy imported summaries", () => {
  const page = parseMarkdownPage(
    "legacy.md",
    [
      "---",
      'id: "legacy"',
      'title: "旧导入页面"',
      'summary: "<center 本地部署开源大模型 <center Ch.1 &emsp;&emsp;硬件配置"',
      "---",
      "",
      "# <center>本地部署开源大模型",
      "",
      "&emsp;&emsp;硬件配置说明。",
    ].join("\n"),
  );

  assert.equal(page.summary, "本地部署开源大模型 Ch.1 硬件配置");
  assert.doesNotMatch(page.plainText, /<center|&emsp;/);
});
