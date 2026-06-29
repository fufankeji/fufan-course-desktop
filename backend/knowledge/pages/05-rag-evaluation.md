---
id: rag-evaluation
title: RAG 智能评估与优化
type: lesson
module: flagship-rag
tags: [RAG, Evaluation, LLM-as-a-Judge, 回归测试]
difficulty: 中级
duration: 60 min
summary: 用问题集、参考答案、证据命中和 LLM-as-a-Judge 评估 RAG 系统质量。
---

# RAG 智能评估与优化

RAG 评估要回答四个问题：有没有召回正确资料、有没有引用证据、答案是否忠实、是否解决用户问题。

## 评估维度

- Context Precision：召回片段是否真的有用。
- Context Recall：标准答案需要的证据有没有被召回。
- Faithfulness：答案是否被证据支持。
- Answer Relevance：回答是否切中问题。

## 课程项目做法

第一版不追求复杂评估平台，而是内置 `eval-set.json`。每条样例包含：

- 用户问题。
- 期望命中的知识页。
- 参考答案要点。
- 不允许出现的幻觉点。

## Agent 可执行任务

让 Agent 根据失败样例自动定位是切分问题、检索问题、重排问题还是提示词问题。
