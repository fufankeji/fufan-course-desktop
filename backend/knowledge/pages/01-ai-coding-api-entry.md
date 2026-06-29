---
id: ai-coding-api-entry
title: AI 编程工具与 API 入门
type: lesson
module: foundation
tags: [Claude Code, Codex, API, Vibe Coding]
difficulty: 入门
duration: 45 min
summary: 建立 AI 编程工具、模型 API、项目任务拆解的共同基础，让学员第一天就能看到可运行产物。
---

# AI 编程工具与 API 入门

这一讲解决两个问题：学员如何和 AI 编程工具协作，Agent 如何稳定调用模型 API。

## 学习目标

- 配置 Claude Code、Codex、OpenCode 这类工具的基本工作流。
- 理解系统提示词、用户消息、工具调用、上下文窗口的边界。
- 用一个最小 API 调用完成问答、JSON 输出和错误重试。

## 课堂产物

学员会得到一个最小可运行的 `chat-api-demo`。它包含：

- 一个模型调用函数。
- 一个结构化输出校验函数。
- 一个错误重试策略。
- 一个可以交给 Agent 继续扩展的 README。

## Agent 学习提示

当学员把这一页交给 Agent 时，可以要求 Agent 输出三件事：

1. 当前项目需要哪些环境变量。
2. 哪些代码应该写测试。
3. 如何把一次模型调用改造成可复用模块。
