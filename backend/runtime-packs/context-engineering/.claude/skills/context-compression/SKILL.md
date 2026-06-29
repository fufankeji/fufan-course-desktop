---
name: context-compression
description: Diagnose context bloat in an Agent project and produce a practical compression plan. Use when working on LangChain, LangGraph, tool-calling Agents, long conversations, memory, message trimming, summarization, tool result clearing, or compaction.
---

# Context Compression

Use this skill to help a learner or developer find where an Agent is wasting context and design a safe compression strategy.

## What To Do

1. Inspect the project structure and identify the Agent entrypoint, message flow, tools, memory, and middleware.
2. Find the main context growth points:
   - long conversation history
   - large tool results
   - repeated retrieved documents
   - verbose system prompts
   - duplicated task state
3. Classify each growth point as one of:
   - keep as-is
   - trim
   - summarize
   - clear tool result
   - mask observation
   - compact session
   - write to memory
4. Recommend an implementation order that preserves task correctness.
5. Produce a short verification plan with expected before/after signals.

## Default Compression Order

Prefer this order unless the project gives stronger evidence:

1. Measure current message count and approximate token pressure.
2. Keep system prompt and latest user intent stable.
3. Clear or summarize large tool results first.
4. Trim old messages only after preserving necessary state.
5. Add summarization for dialogue history.
6. Add compaction only when sessions are long or repeated.
7. Write durable facts to memory instead of keeping everything in chat history.

## Output Format

Return:

```text
Context Compression Report

1. Current Context Map
2. Main Bloat Points
3. Recommended Strategy
4. Implementation Checklist
5. Verification Task
6. Migration Notes
```

Keep the report concrete. Name files, functions, middleware, and commands when they are visible in the workspace.

## Avoid

- Do not delete history blindly.
- Do not summarize tool calls that must remain exact for correctness.
- Do not hide API keys, secrets, credentials, or private data in examples.
- Do not claim compression works without a verification step.
