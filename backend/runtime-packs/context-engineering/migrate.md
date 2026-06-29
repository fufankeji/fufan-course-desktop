# 迁移到自己的 Agent

## 迁移到 Codex / OpenAI Agent Skills

复制目录：

```text
.agents/skills/context-compression/
```

到你的项目：

```text
<your-project>/.agents/skills/context-compression/
```

然后对 Codex 说：

```text
请使用 context-compression Skill 分析当前项目的上下文膨胀点。
```

## 迁移到 Claude Code

复制目录：

```text
.claude/skills/context-compression/
```

到你的项目：

```text
<your-project>/.claude/skills/context-compression/
```

然后在 Claude Code 中输入：

```text
/context-compression
```

或直接说：

```text
请使用 context-compression Skill 分析当前项目。
```

## 迁移到 Cursor

复制文件：

```text
.cursor/rules/context-compression.mdc
```

到你的项目：

```text
<your-project>/.cursor/rules/context-compression.mdc
```

然后在 Cursor Chat 中输入：

```text
请按 context-compression 规则分析当前 Agent 项目的上下文压缩方案。
```
