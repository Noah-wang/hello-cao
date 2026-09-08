import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface MemoryItem {
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryFile {
  users: Record<string, MemoryItem[]>;
}

const MAX_MEMORIES_PER_USER = 30;
const MAX_MEMORY_LENGTH = 160;

function cleanMemory(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, MAX_MEMORY_LENGTH);
}

function comparable(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s，。！？、,.!?：:；;"“”'‘’]/gu, "");
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MemoryItem>;
  return typeof item.text === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string";
}

export function parseMemoryCommand(question: string):
  | { type: "list" }
  | { type: "clear" }
  | { type: "forget"; query: string }
  | { type: "remember"; text: string }
  | undefined {
  const normalized = question.trim();
  if (/^(?:你)?记得我什么[？?]?$/u.test(normalized) || /^我的记忆$/u.test(normalized)) {
    return { type: "list" };
  }
  if (/^忘记我(?:吧)?[。！!]?$/.test(normalized) || /^清空我的记忆[。！!]?$/.test(normalized)) {
    return { type: "clear" };
  }
  const forget = normalized.match(/^忘记(?:掉)?[：:\s]*(.+)$/u);
  if (forget?.[1]) return { type: "forget", query: forget[1].trim() };
  const remember = normalized.match(/^(?:请)?记住[：:\s]*(.+)$/u);
  if (remember?.[1]) return { type: "remember", text: remember[1].trim() };
  return undefined;
}

export function mayContainDurableMemory(question: string): boolean {
  return /(?:我(?:一直|平时|通常|经常|喜欢|讨厌|不喜欢|不吃|爱吃|偏好|习惯|是|叫|住在|来自|正在长期|以后)|以后(?:叫我|提醒我)|我的(?:名字|生日|工作|职业|专业|爱好|目标|计划))/u.test(question);
}

export function isSafeMemoryText(text: string): boolean {
  return !/(?:密码|口令|密钥|secret|token|api\s*key|验证码|身份证|银行卡|私钥|discord[_\s-]*(?:bot[_\s-]*)?token|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/iu.test(text);
}

export class MemoryStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  private async load(): Promise<MemoryFile> {
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8")) as Partial<MemoryFile>;
      const users: Record<string, MemoryItem[]> = {};
      if (raw.users && typeof raw.users === "object") {
        for (const [userId, items] of Object.entries(raw.users)) {
          if (Array.isArray(items)) users[userId] = items.filter(isMemoryItem);
        }
      }
      return { users };
    } catch {
      return { users: {} };
    }
  }

  private mutate(operation: (data: MemoryFile) => void): Promise<void> {
    const task = this.queue.then(async () => {
      const data = await this.load();
      operation(data);
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.path);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  async list(userId: string): Promise<MemoryItem[]> {
    await this.queue;
    return (await this.load()).users[userId] ?? [];
  }

  remember(userId: string, text: string): Promise<void> {
    const cleaned = cleanMemory(text);
    if (!cleaned || !isSafeMemoryText(cleaned)) return Promise.resolve();
    return this.mutate((data) => {
      const now = new Date().toISOString();
      const items = data.users[userId] ?? [];
      const key = comparable(cleaned);
      const existing = items.find((item) => comparable(item.text) === key);
      if (existing) {
        existing.text = cleaned;
        existing.updatedAt = now;
      } else {
        items.push({ text: cleaned, createdAt: now, updatedAt: now });
      }
      data.users[userId] = items.slice(-MAX_MEMORIES_PER_USER);
    });
  }

  forget(userId: string, query: string): Promise<number> {
    let removed = 0;
    const key = comparable(cleanMemory(query));
    if (!key) return Promise.resolve(0);
    return this.mutate((data) => {
      const items = data.users[userId] ?? [];
      const kept = items.filter((item) => {
        const matches = comparable(item.text).includes(key);
        if (matches) removed += 1;
        return !matches;
      });
      if (kept.length) data.users[userId] = kept;
      else delete data.users[userId];
    }).then(() => removed);
  }

  clear(userId: string): Promise<number> {
    let removed = 0;
    return this.mutate((data) => {
      removed = data.users[userId]?.length ?? 0;
      delete data.users[userId];
    }).then(() => removed);
  }
}

export function formatMemories(items: MemoryItem[]): string {
  if (!items.length) return "还没记住你的什么东西。脑子目前挺干净。";
  return ["我记得这些：", ...items.map((item, index) => `${index + 1}. ${item.text}`)].join("\n");
}
