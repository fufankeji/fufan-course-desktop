---
id: model-api-playbook
title: 模型 API 调用作战手册
type: tool
module: foundation
tags: [OpenAI, Anthropic, JSON, Prompt]
difficulty: 入门
duration: 35 min
summary: 用统一方式组织模型请求、结构化输出、错误处理和成本控制。
---

# 模型 API 调用作战手册

模型 API 是后续 RAG、Agent、评估系统的底座。课程采用“先统一接口，再扩展 provider”的方式。

## 统一调用结构

- `provider`: OpenAI、Anthropic、DeepSeek、Qwen 或本地兼容接口。
- `model`: 当前任务使用的模型名称。
- `messages`: 系统指令、用户问题、工具结果。
- `response_format`: 是否要求 JSON、Markdown 或严格 Schema。
- `usage`: 记录 token 和成本，后续用于评估。

## 常见错误

- 429：限流，应该指数退避并减少并发。
- 400：请求格式错误，应该记录原始 payload。
- JSON 解析失败：应该让模型重试，不要让业务代码吞掉错误。

## 课程交付建议

课程知识库里所有 API 示例都应该配一个 Agent 可读的 checklist。Agent 在改代码前先读 checklist，再执行任务。
