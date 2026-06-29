---
id: document-audit-agent
title: 文档审查 Agent
type: project
module: agentic-projects
tags: [文档审查, Agent, 合规, 多模态]
difficulty: 进阶
duration: 85 min
summary: 用 Agent 检查合同、报告、课程资料中的缺失项、冲突项和风险项。
---

# 文档审查 Agent

文档审查 Agent 是一个很适合职业教育展示的项目：结果直观、场景真实、可以快速从 Demo 走向产品。

## 核心能力

- 读取结构化 Markdown 或 PDF 转换文本。
- 根据审查清单检查缺失项。
- 对同一文件中的冲突表述做标记。
- 输出风险等级、证据位置和修改建议。

## 课程案例

可以让学员审查一份“AI 培训课程交付说明”。Agent 需要判断是否说明了视频、知识库、Skill、项目产品四类交付。

## 与知识库结合

审查规则本身可以放进 LLM Wiki。Agent 审查前先读取规则页，再对文档执行检查。
