# 教学型 Agent TUI 开发规格

日期：2026-06-17

## 1. 项目定位

本项目面向教育公司自研教学工具，基于 CodeWhale fork 做二次开发，形成一套“教学型 Agent TUI”。它不是通用 AI 编程工具，而是用于课堂演示、学员练习和课后复盘的 Agent 可观察性产品。

核心目标是让老师和学员看见 AI 编程背后的过程：模型调用、工具调用、skills 加载、上下文引用、文件读写、shell 命令、安全审批、错误与修复路径。

一句话定位：

> 让学生看见 AI 编程背后的上下文、工具、权限和决策过程。

## 2. 一期目标

一期做本地版 MVP，优先服务老师课堂演示，同时预留学员练习所需的数据结构和接口。

一期必须支持老师完成一节完整 AI 编程课：

1. 老师启动本地 TUI。
2. 载入示例课程 workspace。
3. 老师输入编程任务。
4. Agent 读取代码、调用工具、执行命令、修改文件、运行测试。
5. 右侧教学面板实时展示后台过程。
6. 系统记录 JSONL 原始事件日志。
7. 课堂结束后导出 Markdown 复盘报告。

## 3. 非目标

一期不做以下能力：

- 云端账号体系
- 班级管理
- 多租户 SaaS
- 容器级强隔离
- 完整回放播放器
- 插件市场
- 自动批改系统
- 从零自研 Agent Runtime
- 云端模型网关
- Web 管理后台

这些能力放入二期或三期。

## 4. 用户角色

### 4.1 老师

老师是一期的第一优先级用户。老师需要在课堂上演示 AI 编程过程，并能讲清楚 Agent 做了什么、为什么做、结果如何。

老师需要看到：

- 工具调用过程
- shell 命令与结果
- 文件读取和修改摘要
- skills 加载情况
- 上下文引用信息
- 审批与安全提示
- 课程任务步骤
- 课后复盘报告

### 4.2 学员

学员是一期的第二优先级用户。一期主要让学员看懂老师演示过程，并为二期的独立练习模式预留数据结构。

学员需要看到：

- Agent 正在做什么
- 修改了哪些文件
- 执行了哪些命令
- 哪些步骤成功或失败
- 当前课程任务进度

学员不应看到：

- API key
- 原始 token
- 老师本机敏感路径
- 敏感环境变量
- 不适合课堂展示的系统信息

### 4.3 教研/课程研发

教研人员需要把一次演示沉淀成课程资料，并复用课程模板。

教研人员需要：

- Markdown 复盘报告
- JSONL 原始日志
- 文件 diff 摘要
- 错误与修复路径
- 可复用的 `course.yaml`

## 5. 技术路线

采用方案 A：Fork CodeWhale 做教育版 MVP。

选择理由：

- 最快形成可演示的 TUI 产品。
- CodeWhale 已具备 Agent/TUI 基础能力。
- 可复用工具调用、审批、skills/MCP、模型 provider 等机制。
- 更适合 3-5 周形成内测版本。

维护策略：

- 尽量不重写 CodeWhale 核心运行时。
- 在关键调用点增加教育观测事件。
- 新增教育模块与原核心保持清晰边界。
- 后续定期同步上游，避免大规模魔改。

## 6. 分期计划

### 6.1 一期：教学演示 MVP

周期建议：3-5 周。

目标：老师可以在本地 TUI 中完成课堂演示，学员能通过右侧面板理解 AI 编程后台过程，课后能导出 JSONL 和 Markdown。

P0 功能：

- 品牌与产品壳
- 右侧教学面板
- 事件采集层
- JSONL 原始日志
- Markdown 复盘报告
- 课堂安全模式
- 本地安装说明
- 示例课程 workspace

P1 功能：

- 老师/学员显示模式
- `course.yaml` 课程配置
- 报告模板
- 事件筛选

P2 延后：

- 完整回放播放器
- 多学员管理
- 云端同步
- Web 管理后台
- 自动作业批改
- 容器沙箱
- 模型费用看板

### 6.2 二期：课程产品化

周期建议：4-8 周。

目标：从课堂演示工具升级为课程交付工具。

功能：

- 课程模板库
- 学员独立 workspace
- 课程回放查看
- 教学报告
- 命令白名单
- 模型费用控制
- 作业模式
- 老师复盘面板

### 6.3 三期：商业化平台

周期建议：2-4 个月。

目标：支持培训班、企业内训和学校私有部署。

功能：

- 云端 workspace
- 班级/学员管理
- 统一模型网关
- 审计日志
- 费用统计
- 私有部署
- 白标交付
- 强隔离沙箱

## 7. 一期功能模块

### 7.1 品牌与产品壳

内容：

- 替换产品名
- 替换命令名
- 替换 logo
- 替换启动页
- 替换默认主题
- 移除原项目显著品牌露出
- 保留 MIT License 与第三方开源声明

验收：

- 启动后看到的是自有品牌。
- 帮助信息、窗口标题、启动 banner 不再使用原项目品牌作为产品名。
- 开源声明保留 CodeWhale 的 MIT License。

### 7.2 右侧教学面板

右侧教学面板是一期核心功能。

建议 tab：

- `Timeline`：按时间展示关键事件
- `Tools`：工具调用、耗时、结果
- `Shell`：命令、退出码、耗时、摘要
- `Files`：文件读取、修改、diff 摘要
- `Skills`：已加载 skills 和用途
- `Context`：上下文摘要、引用文件、token 占用
- `Course`：课程标题、目标、步骤
- `Safety`：审批、脱敏、阻止事件

展示原则：

- 默认展示最近 20-50 条关键事件。
- 长输出默认折叠，只展示摘要。
- 失败事件高亮。
- 敏感信息在进入面板前脱敏。
- 面板读取事件聚合状态，不直接读取底层运行时内部状态。

### 7.3 事件采集层

新增统一事件层，把底层动作转成结构化事件。

事件用途：

- 实时驱动右侧面板
- 写入 JSONL 原始日志
- 生成 Markdown 报告
- 支持二期回放和学员练习分析

采集对象：

- 会话开始/结束
- 课程加载
- 模型选择
- skill 加载
- 上下文变化
- 工具调用
- shell 执行
- 文件读取
- 文件修改
- 审批请求与结果
- 安全脱敏
- 安全阻止
- 导出结果

### 7.4 课程日志导出

一期必须导出两类文件：

- `session.jsonl`：原始结构化事件
- `session-report.md`：面向老师和教研的可读报告

导出触发方式：

- 会话结束时自动生成
- TUI 命令手动生成，例如 `/export`

导出目录：

```text
exports/
  sessions/
    <session-id>/
      session.jsonl
      session-report.md
```

### 7.5 课堂安全模式

一期做课堂安全模式，不承诺强隔离沙箱。

能力：

- API key 脱敏
- token 脱敏
- 环境变量脱敏
- 用户主目录脱敏
- 敏感配置文件内容脱敏
- 危险命令提示或阻止
- 命令执行前突出审批信息
- 学员视角隐藏敏感路径和系统信息

危险命令策略：

- 默认阻止明显破坏性命令，例如 `rm -rf /`、磁盘格式化、系统权限修改。
- 对删除、批量移动、网络下载执行提示审批。
- 对测试、构建、只读查看命令允许执行并记录。

## 8. 技术架构

一期采用“CodeWhale Core + Education Observer”的结构。

逻辑模块：

```text
CodeWhale Core
  model providers
  agent loop
  tool runtime
  file operations
  shell execution
  approvals
  skills / MCP

Education Event Layer
  event definitions
  event emitter
  in-memory event buffer
  JSONL writer
  event sanitizer

Teaching Sidebar
  timeline view
  tool view
  shell view
  file view
  skills view
  context view
  course view
  safety view

Course Layer
  course.yaml loader
  course state
  task steps
  report metadata

Export Layer
  JSONL exporter
  Markdown report generator
  diff summarizer

Classroom Safety Layer
  redaction
  command policy
  approval display
  student display policy
```

物理目录需要在 fork CodeWhale 后按实际源码结构映射。本文中的 `education/` 是逻辑模块名；如果 CodeWhale 现有结构更适合放在 `src/education`、`crates/education` 或类似目录，应遵循原项目风格。

## 9. 数据流

典型流程：

1. 老师进入课程 workspace。
2. TUI 启动并读取 `course.yaml`。
3. 系统生成 `session.started` 事件。
4. 老师输入任务。
5. Agent 读取文件、调用工具、执行命令、修改代码。
6. 每个动作生成结构化事件。
7. 事件先经过安全脱敏。
8. 脱敏后的事件进入内存事件缓冲。
9. Teaching Sidebar 从缓冲状态刷新 UI。
10. 事件同步写入 `session.jsonl`。
11. 会话结束时生成 `session.ended`。
12. Export Layer 读取 JSONL 生成 `session-report.md`。

关键原则：

- 右侧面板不直接反推终端文本。
- 报告生成不依赖 TUI 展示文本。
- JSONL 是后续回放、分析、报告的事实来源。
- 脱敏在展示和导出两条路径都必须生效。

## 10. 事件协议

### 10.1 通用事件字段

每条事件包含以下字段：

```json
{
  "id": "evt_01",
  "session_id": "sess_20260617_001",
  "type": "tool.started",
  "timestamp": "2026-06-17T15:30:00+08:00",
  "actor": "agent",
  "visibility": "teacher",
  "severity": "info",
  "summary": "Reading project files",
  "data": {}
}
```

字段说明：

- `id`：事件唯一 ID。
- `session_id`：会话 ID。
- `type`：事件类型。
- `timestamp`：ISO 8601 时间。
- `actor`：`teacher`、`student`、`agent`、`system`。
- `visibility`：`teacher`、`student`、`internal`。
- `severity`：`debug`、`info`、`warning`、`error`。
- `summary`：短摘要，用于右侧面板。
- `data`：事件详细数据。

### 10.2 一期事件类型

必须支持：

- `session.started`
- `session.ended`
- `course.loaded`
- `model.selected`
- `skill.loaded`
- `context.updated`
- `tool.started`
- `tool.finished`
- `shell.started`
- `shell.finished`
- `file.read`
- `file.changed`
- `approval.requested`
- `approval.resolved`
- `safety.redacted`
- `safety.blocked`
- `export.created`

### 10.3 shell 事件示例

```json
{
  "id": "evt_12",
  "session_id": "sess_20260617_001",
  "type": "shell.finished",
  "timestamp": "2026-06-17T15:35:12+08:00",
  "actor": "agent",
  "visibility": "student",
  "severity": "info",
  "summary": "npm test exited with code 0",
  "data": {
    "command": "npm test",
    "exit_code": 0,
    "duration_ms": 18420,
    "stdout_summary": "12 tests passed",
    "stderr_summary": "",
    "redacted": false
  }
}
```

### 10.4 file changed 事件示例

```json
{
  "id": "evt_18",
  "session_id": "sess_20260617_001",
  "type": "file.changed",
  "timestamp": "2026-06-17T15:38:20+08:00",
  "actor": "agent",
  "visibility": "student",
  "severity": "info",
  "summary": "Updated src/app.ts",
  "data": {
    "path": "src/app.ts",
    "change_type": "modified",
    "lines_added": 14,
    "lines_removed": 6,
    "diff_summary": "Added input validation and error handling"
  }
}
```

## 11. 课程配置

一期使用本地 `course.yaml`。

示例：

```yaml
id: python-debugging-001
title: Python 调试入门
audience: beginner
mode: teacher-demo
recommended_model: gpt-5-codex

objectives:
  - 理解 Agent 如何阅读代码
  - 观察测试失败到修复的过程
  - 学习如何复盘 AI 编程轨迹

steps:
  - id: step-1
    title: 读取项目结构
    expected_events:
      - file.read
      - context.updated
  - id: step-2
    title: 运行测试并定位错误
    expected_events:
      - shell.started
      - shell.finished
  - id: step-3
    title: 修改代码并复测
    expected_events:
      - file.changed
      - shell.finished

safety:
  mode: classroom
  redact_home_dir: true
  redact_env: true
  block_destructive_commands: true

export:
  markdown_report: true
  jsonl_events: true
```

课程配置原则：

- 一期只支持本地文件。
- 文件缺失时使用默认课程状态。
- 配置错误时在 TUI 中显示可读错误，不阻断普通 Agent 使用。

## 12. Markdown 报告结构

`session-report.md` 包含：

1. 课程信息
2. 会话摘要
3. 关键时间线
4. 使用的模型与 skills
5. 工具调用摘要
6. shell 命令摘要
7. 文件变化摘要
8. 错误与修复路径
9. 安全审批记录
10. 教学复盘建议

报告示例结构：

```markdown
# Python 调试入门 - 课堂复盘

## 会话摘要

- 时间：2026-06-17 15:30
- 模式：老师演示
- 模型：gpt-5-codex
- 结果：测试通过

## 关键时间线

1. Agent 读取项目结构
2. Agent 运行测试并发现失败
3. Agent 修改输入校验逻辑
4. Agent 重新运行测试并通过

## 文件变化

- src/app.ts：新增输入校验
- tests/app.test.ts：无修改

## 命令执行

- npm test：通过，耗时 18.4s

## 复盘建议

- 重点讲解测试失败信息如何驱动修复。
- 重点讲解文件 diff 与最终测试结果的关系。
```

## 13. 安全与脱敏

### 13.1 脱敏对象

必须脱敏：

- OpenAI、Anthropic、DeepSeek、OpenRouter 等 API key
- 常见 token、secret、password 字段
- `.env` 文件内容
- 用户主目录路径
- SSH key 路径
- GitHub token
- 云服务访问密钥

### 13.2 展示策略

老师模式：

- 可看到完整教学事件。
- 敏感值仍然脱敏。
- 可看到更多调试细节。

学员模式：

- 隐藏内部路径和敏感系统信息。
- 展示命令意图和结果摘要。
- 展示 diff 摘要，不展示敏感文件内容。

### 13.3 命令策略

命令分为三类：

- `allow`：测试、构建、查看文件、列目录等低风险命令。
- `approve`：安装依赖、删除项目内文件、网络访问、批量移动。
- `block`：系统级删除、格式化磁盘、修改系统权限、泄露密钥、破坏用户主目录。

一期默认策略：

- `allow` 直接执行并记录。
- `approve` 走审批并在右侧 Safety tab 展示。
- `block` 阻止执行并记录 `safety.blocked`。

## 14. 开源合规

CodeWhale 使用 MIT License。二次开发和商用允许，但必须满足：

- 保留原项目 MIT License。
- 保留原版权声明。
- 增加第三方依赖 license 声明。
- 替换产品名和 logo，避免用户误以为是原项目官方版本。
- 模型 provider 的 API 服务条款单独审查。

一期交付物中必须包含：

- `LICENSE`
- `NOTICE` 或 `THIRD_PARTY_NOTICES.md`
- 依赖 license 审计结果

## 15. 一期排期

建议 5 周排期。

### 第 1 周：fork 与架构梳理

- Fork CodeWhale。
- 本地构建成功。
- 梳理 TUI、agent loop、tool runtime、approval、skills 相关模块。
- 确定教育模块落位。
- 完成品牌替换方案。

交付：

- 可运行的自有品牌 TUI 初版。
- 架构映射文档。

### 第 2 周：事件采集与 JSONL

- 定义事件类型。
- 接入工具调用事件。
- 接入 shell 事件。
- 接入文件读写事件。
- 接入 skills 和上下文事件。
- 写入 `session.jsonl`。

交付：

- 一次演示能生成完整 JSONL。

### 第 3 周：右侧教学面板

- 实现 Timeline tab。
- 实现 Tools、Shell、Files tab。
- 实现 Skills、Context、Course tab。
- 实现基础筛选和折叠。

交付：

- 课堂演示时右侧面板可实时展示后台过程。

### 第 4 周：安全模式与导出报告

- 实现脱敏规则。
- 实现命令策略。
- 接入 approval 展示。
- 实现 Markdown 报告导出。
- 实现 `course.yaml` 读取。

交付：

- 可导出 `session.jsonl` 和 `session-report.md`。
- 学员视角不暴露敏感信息。

### 第 5 周：示例课程与内测打磨

- 准备 2 个示例课程 workspace。
- 编写老师使用说明。
- 编写安装说明。
- 完成一次 45 分钟课堂演示彩排。
- 修复关键体验问题。

交付：

- 可用于内部试点班的一期 MVP。

## 16. 验收标准

一期验收必须满足：

1. 老师可以本地启动 TUI。
2. TUI 使用自有品牌。
3. 可以载入示例课程。
4. Agent 能完成一次真实代码修改任务。
5. 右侧面板能展示工具、shell、文件、skills、上下文、课程、安全信息。
6. 敏感信息不会出现在学员视角和导出报告中。
7. 课堂结束后生成 `session.jsonl`。
8. 课堂结束后生成 `session-report.md`。
9. 报告能帮助老师复盘本节课的关键过程。
10. 保留 MIT License 和第三方开源声明。

## 17. 风险与应对

### 17.1 CodeWhale 架构理解成本

风险：fork 后发现工具调用和 TUI 状态耦合较深。

应对：第一周先做架构映射，事件层优先接入最关键的 tool、shell、file 三类事件。

### 17.2 一期范围膨胀

风险：课程、回放、学员管理、云端能力同时进入一期。

应对：一期只做本地教学演示、JSONL、Markdown 报告和课堂安全模式。

### 17.3 敏感信息泄露

风险：命令输出或文件内容中包含 key、token、路径。

应对：展示和导出统一经过脱敏层；`.env` 等敏感文件默认只展示文件名和动作，不展示内容。

### 17.4 上游同步困难

风险：过度修改核心 runtime 导致后续无法同步 CodeWhale。

应对：新增教育模块，核心只加事件 hook，避免重写 agent loop。

### 17.5 课堂信息过载

风险：右侧面板展示太多细节，学员看不懂。

应对：默认展示摘要和关键事件，详细内容折叠，老师模式可展开。

## 18. 二期预留接口

一期需要为二期预留：

- `session_id`
- `course_id`
- `actor`
- `visibility`
- `workspace_id`
- `student_id` 字段位置
- JSONL 事件可回放
- Markdown 报告可模板化
- 课程配置可扩展
- 命令策略可配置

一期不需要实现真实账号、班级和云端 workspace，但事件协议不能阻断这些能力。

## 19. 当前决策记录

- 一期目标选择：老师演示优先，预留学员练习。
- 技术路线选择：Fork CodeWhale 定制。
- 右侧面板范围：后台调用过程、skills/上下文、课程信息都要，一期优先后台调用。
- 使用形态：先本地，二期再云端。
- 日志导出：一期必做。
- 导出格式：JSONL 原始事件 + Markdown 可读报告。
- 安全边界：课堂安全模式，不做强隔离沙箱。

## 20. 下一步

用户确认本规格后，进入实施计划阶段。实施计划应拆成可执行任务，包括：

- CodeWhale fork 与构建
- 品牌替换
- 事件协议落地
- 事件 hook 接入
- 右侧教学面板
- 课程配置
- 安全脱敏
- Markdown 导出
- 示例课程
- 内测验收

