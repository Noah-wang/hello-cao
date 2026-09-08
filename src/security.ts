const SYSTEM_PROMPT_PROBE = /(?:system\s*prompt|系统(?:提示词|指令|规则)|开发者(?:消息|指令)|隐藏(?:提示词|规则)|内部(?:提示词|规则)|提示词.*(?:输出|显示|告诉|发给)|ignore\s+(?:all\s+)?previous|忽略(?:之前|以上|前面).*(?:指令|规则)|越狱|jailbreak|prompt\s*injection|泄露.*(?:密钥|token|api)|(?:密钥|token|api\s*key).*(?:输出|显示|告诉))/iu;

const DESTRUCTIVE_REQUEST = /(?:搞破坏|攻击|入侵|摧毁|搞垮|破坏|关停).*(?:服务器|系统|数据库|配置|机器人)|(?:rm\s+-rf\s+\/|drop\s+database|shutdown\s+-h|format\s+[a-z]:)/iu;

export function isSuspiciousRequest(question: string): boolean {
  return SYSTEM_PROMPT_PROBE.test(question) || DESTRUCTIVE_REQUEST.test(question);
}

export function ensureTitleForSuspiciousReply(
  answer: string,
  title: string | undefined,
  suspicious: boolean,
): string {
  if (!suspicious || !title || answer.includes(title)) return answer;
  return `${title}，${answer}`;
}
