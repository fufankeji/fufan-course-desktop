---
id: agentic-graphrag
title: Agentic GraphRAG 项目
type: project
module: agentic-projects
tags: [GraphRAG, Agentic RAG, 知识图谱, 多跳推理]
difficulty: 进阶
duration: 100 min
summary: 在普通 RAG 上加入实体、关系和多跳检索，让 Agent 能沿知识图谱推理。
---

# Agentic GraphRAG 项目

GraphRAG 适合处理多实体、多关系、多文档交叉的问题。Agentic GraphRAG 则让 Agent 决定什么时候检索文本，什么时候沿图谱查关系。

## 项目结构

- 实体抽取：从课程页、项目文档、FAQ 中抽取概念和工具。
- 关系构建：记录“属于模块”“依赖技能”“解决问题”等关系。
- 多跳检索：先找入口概念，再扩展邻居节点。
- 答案合成：把图谱路径和原始知识页一起引用。

## 适合问题

- “RAG 评估和部署上线有什么关系？”
- “Agent Skills 如何服务企业项目？”
- “从 Claude Code 到 OpenClaw 的能力链路是什么？”

## 风险

图谱关系不能全靠模型猜。课程第一版只把明确关系写入 Wiki 链接，把推断关系标为候选。
