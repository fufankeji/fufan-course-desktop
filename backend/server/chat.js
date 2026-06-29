import { searchPages } from "./search.js";
import { answerWithDeepSeek, sanitizeModelError } from "./llm.js";

export async function answerFromCourseWiki({ message, pages, moduleId, env = process.env, fetchImpl = fetch }) {
  const sources = searchPages(pages, message, { moduleId, limit: 5 });
  const trimmed = message.trim();

  if (!sources.length) {
    return {
      answer: [
        "我在当前课程知识库里没有找到足够明确的对应内容。",
        "你可以换成课程里的关键词继续问，比如检索增强、能力包、部署上线、评估优化、智能体工具或自动化系统。",
      ].join("\n\n"),
      sources: [],
      mode: "local-simulated",
    };
  }

  const sourcePages = sources.map((source) => pages.find((page) => page.id === source.id)).filter(Boolean);
  try {
    const llmAnswer = await answerWithDeepSeek({ message: trimmed, sourcePages, env, fetchImpl });
    if (llmAnswer) {
      return {
        answer: llmAnswer.answer,
        sources,
        mode: llmAnswer.mode,
        model: llmAnswer.model,
      };
    }
  } catch (error) {
    const local = buildLocalAnswer(trimmed, sources);
    return {
      ...local,
      mode: "local-simulated",
      llmError: sanitizeLlmError(error instanceof Error ? error.message : "DeepSeek request failed"),
    };
  }

  return {
    ...buildLocalAnswer(trimmed, sources),
    mode: "local-simulated",
  };
}

function sanitizeLlmError(message) {
  const sanitized = sanitizeModelError(message);

  if (/401|authentication|invalid api key|api key:\s*\*\*\*/i.test(sanitized)) {
    return "模型鉴权失败：当前密钥无效或已过期，请在“模型配置”中更换有效密钥。";
  }

  return sanitized;
}

function buildLocalAnswer(trimmed, sources) {
  const pathLine = buildPathLine(trimmed, sources);
  const sourceLines = sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. 《${source.title}》：${source.summary}`)
    .join("\n");

  const answer = [
    `我在课程知识库里找到了 ${sources.length} 个相关知识页。`,
    pathLine,
    "你可以按下面的顺序学习和落地：",
    sourceLines,
    "建议边看视频边让 Agent 读取这些知识页：先让它复述目标，再让它生成项目任务清单，最后让它根据代码/报错反查对应知识页。",
  ].join("\n\n");

  return { answer, sources };
}

function buildPathLine(question, sources) {
  const normalized = question.toLowerCase();

  if (question.includes("本地部署") || question.includes("开源大模型") || question.includes("硬件") || normalized.includes("gpu")) {
    return "如果目标是本地部署开源大模型，先看硬件配置、GPU/显存选择和 Ubuntu/Python 环境，再进入具体模型部署流程。";
  }

  if (normalized.includes("rag")) {
    return "如果目标是企业级 RAG，先掌握文档摄入、混合检索、重排和答案评估，再进入 Agentic RAG 与项目封装。";
  }

  if (question.includes("部署") || question.includes("上线") || normalized.includes("docker")) {
    return "如果目标是上线交付，先把 Agent 封装为稳定 API，再处理容器化、日志、评估集和回归测试。";
  }

  if (question.includes("skill") || question.includes("技能")) {
    return "如果目标是教会智能体，先把操作流程沉淀成能力包，再把课程知识页作为能力包的可引用上下文。";
  }

  return `最相关的入口是《${sources[0].title}》，它可以作为这次学习问题的第一站。`;
}
