const DISCORD_MESSAGE_LIMIT = 2_000;

export function extractQuestion(content: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  return content.replace(mentionPattern, " ").replace(/\s+/g, " ").trim();
}

export function splitDiscordMessage(
  content: string,
  limit = DISCORD_MESSAGE_LIMIT,
): string[] {
  if (content.length <= limit) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const newlineBreak = window.lastIndexOf("\n");
    const spaceBreak = window.lastIndexOf(" ");
    const breakAt = Math.max(newlineBreak, spaceBreak);
    const end = breakAt > limit * 0.5 ? breakAt : limit;

    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
