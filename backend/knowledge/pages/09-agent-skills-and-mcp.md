---
id: agent-skills-and-mcp
title: Agent Skills 与 MCP 交付
type: concept
module: agent-skills
tags: [Agent Skills, MCP, OpenAI, Anthropic]
difficulty: 进阶
duration: 80 min
summary: 把课程中的工具用法和场景 SOP 提取成 Agent 可执行的 Skill，并规划 OpenAI 与 Anthropic 两套交付形态。
---

# Agent Skills 与 MCP 交付

Skill 是“教会 Agent 做事”的关键载体。课程知识库回答“知道什么”，Skill 回答“怎么执行”。

## Skill 应该包含什么

- 触发条件：什么时候应该使用这个 Skill。
- 操作步骤：按顺序执行的任务流程。
- 输入输出：需要哪些文件、参数和产物。
- 验证方式：如何判断任务完成。
- 常见错误：失败时如何排查。

## 两大流派

- Anthropic 流派：以 Claude Code Skill、slash command、项目指令为主。
- OpenAI 流派：以 Codex Skill、AGENTS.md、工具协议和可调用脚本为主。

## 与知识库的关系

Skill 不应该塞满课程全文，而应该引用知识库页面。例如“RAG 项目构建 Skill”引用 RAG 概念、项目手册、评估优化三页。
