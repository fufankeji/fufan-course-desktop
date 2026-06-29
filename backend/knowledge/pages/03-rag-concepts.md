---
id: rag-concepts
title: RAG 核心概念地图
type: concept
module: flagship-rag
tags: [RAG, Chunking, Embedding, Retrieval, Rerank]
difficulty: 中级
duration: 55 min
summary: 解释 RAG 从文档摄入到答案生成的核心链路，帮助学员理解为什么不能只堆向量库。
---

# RAG 核心概念地图

RAG 不是“把 PDF 丢进向量库”这么简单。企业级 RAG 至少包含文档解析、切分、索引、召回、重排、答案生成和评估。

## 关键链路

- 文档摄入：把 PDF、HTML、Markdown、Notebook 转成干净文本。
- Chunking：按标题、语义段、代码块切分，而不是固定字符数粗切。
- Hybrid Retrieval：关键词检索和向量检索组合，提高召回。
- Rerank：用重排模型或 LLM 重新判断证据相关性。
- Answering：要求答案引用证据，不允许凭空扩写。

## 为什么需要评估

没有评估的 RAG 很容易停留在 Demo。课程要求每个 RAG 项目都准备一组测试问题，覆盖事实问答、流程问答、边界问题和反例问题。

## 与 LLM Wiki 的关系

课程知识库第一版不直接走重 RAG，而是先把课程资料编译成结构化 Wiki。Wiki 页本身就是更高质量的检索单元。
