# Context Compression Skill 快速验证

## 这个 Skill 是干什么的

`context-compression` 用来帮助 Agent 分析项目里的上下文膨胀点，并输出压缩策略、改造清单和验证任务。

适合用于：

- Agent 对话越来越长
- 工具调用结果太大
- RAG 检索内容反复塞进上下文
- LangChain / LangGraph Agent 需要加入 trim、summary、tool result clear 或 compaction

## 3 分钟快速运行

进入当前运行包目录：

```bash
cd runtime-packs/context-engineering
```

启动 TUI：

```bash
../../runtime/fufan-tui/npm/codewhale/bin/codewhale.js
```

在 TUI 中输入：

```text
/skills
```

确认能看到 `context-compression` 后，复制下面这句：

```text
请使用 context-compression Skill，分析当前 Agent 项目的上下文膨胀点，并输出压缩策略报告。
```

## 预期效果

Agent 应输出一份报告，包含：

1. Current Context Map
2. Main Bloat Points
3. Recommended Strategy
4. Implementation Checklist
5. Verification Task
6. Migration Notes

## 如果模型调用失败

先确认本机环境变量已配置：

```bash
export DEEPSEEK_API_KEY="你的 key"
```

或者使用 TUI 自带命令配置 provider：

```bash
codewhale auth set --provider deepseek
```
