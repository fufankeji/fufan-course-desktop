---
id: deployment-ops
title: Agent 部署上线与运维
type: lesson
module: engineering
tags: [部署, FastAPI, Docker, LangSmith, AgentOps]
difficulty: 工程
duration: 90 min
summary: 把 Agent 项目从本地 Demo 封装成稳定服务，覆盖接口、容器、日志、追踪和回归测试。
---

# Agent 部署上线与运维

工程化阶段的目标是让项目离开 notebook 和本地脚本，变成可访问、可观测、可回滚的服务。

## 上线清单

- API 封装：明确 `/chat`、`/search`、`/health` 等接口。
- 容器化：用 Docker 固化运行环境。
- 配置管理：API key、模型名、向量库地址都走环境变量。
- 日志追踪：记录用户问题、检索来源、模型输出和错误。
- 回归测试：每次改提示词或检索策略都跑评估集。

## 课程实践

学员会把 RAG 问答系统升级成一个可部署服务。前端只依赖后端 API，不直接读取本地文件。

## 进阶工具

LangSmith、AgentOps、OpenTelemetry 都可以用于追踪 Agent 的工具调用和模型输出。
