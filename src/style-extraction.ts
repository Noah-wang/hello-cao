export interface HistoricalMessage {
  id: string;
  content: string;
  createdTimestamp: number;
}

export interface CleanStyleMessage {
  id: string;
  text: string;
  createdTimestamp: number;
}

const LOW_VALUE_PATTERN = /^(?:哈+|呵+|嘿+|嗯+|哦+|噢+|好+|行+|草+|笑死+|牛+|6+|w+|[.。!！?？~～…]+)$/iu;

export function sanitizeMessage(content: string): string | null {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^>.*$/gm, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[链接]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[邮箱]")
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, "[号码]")
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, "[提及]")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 6 || text.length > 500 || LOW_VALUE_PATTERN.test(text)) return null;
  return text;
}

export function cleanAndDedupe(messages: HistoricalMessage[]): CleanStyleMessage[] {
  const seen = new Set<string>();
  const cleaned: CleanStyleMessage[] = [];

  for (const message of messages) {
    const text = sanitizeMessage(message.content);
    if (!text) continue;
    const fingerprint = text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    cleaned.push({ id: message.id, text, createdTimestamp: message.createdTimestamp });
  }

  return cleaned.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export function sampleAcrossTime(
  messages: CleanStyleMessage[],
  maximum: number,
): CleanStyleMessage[] {
  if (maximum <= 0) return [];
  if (messages.length <= maximum) return [...messages];
  if (maximum === 1) return [messages[Math.floor(messages.length / 2)]];

  const sampled: CleanStyleMessage[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index * (messages.length - 1)) / (maximum - 1));
    sampled.push(messages[sourceIndex]);
  }
  return sampled;
}

export function makeBatches(
  messages: CleanStyleMessage[],
  maximumMessages = 180,
  maximumCharacters = 20_000,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let characters = 0;

  for (const message of messages) {
    if (
      current.length > 0 &&
      (current.length >= maximumMessages || characters + message.text.length > maximumCharacters)
    ) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(message.text);
    characters += message.text.length;
  }

  if (current.length) batches.push(current);
  return batches;
}
