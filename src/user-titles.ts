import { readFileSync } from "node:fs";

export type UserTitles = Record<string, string>;

export function loadUserTitles(path: string): UserTitles {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([userId, title]) =>
            /^\d{15,22}$/.test(userId) &&
            typeof title === "string" &&
            title.trim().length > 0 &&
            title.trim().length <= 30,
        )
        .map(([userId, title]) => [userId, (title as string).trim()]),
    );
  } catch {
    return {};
  }
}

export function getUserTitle(userId: string, titles: UserTitles): string | undefined {
  return titles[userId];
}
