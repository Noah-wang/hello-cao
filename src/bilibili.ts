import { readFile } from "node:fs/promises";

export interface BilibiliCredential {
  sessdata: string;
  biliJct: string;
  buvid3: string;
}

export interface BilibiliInput {
  reference: string;
  question: string;
}

export interface BilibiliVideoInfo {
  bvid: string;
  title: string;
  owner: string;
  description: string;
  durationSeconds: number;
  partCount: number;
}

export interface BilibiliVideoContent {
  info: BilibiliVideoInfo;
  subtitleAvailable: boolean;
  subtitleNote: string;
  transcript: string;
}

interface ReadVideoConfig {
  credential: BilibiliCredential;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface SubtitleTrack {
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
}

const URL_PATTERN = /https?:\/\/(?:www\.)?(?:bilibili\.com|b23\.tv)\/[^\s<>"'）)\]，。、]+/iu;
const BV_PATTERN = /BV[0-9A-Za-z]{8,}/iu;
const MIN_LINES_PER_MINUTE = 10;
const MIN_TIMELINE_COVERAGE = 0.5;

export function extractBilibiliInput(text: string): BilibiliInput | undefined {
  const url = text.match(URL_PATTERN)?.[0];
  const reference = url ?? text.match(BV_PATTERN)?.[0];
  if (!reference) return undefined;
  const question = text.replace(reference, " ").replace(/\s+/gu, " ").trim();
  return { reference, question };
}

function tomlString(source: string, key: string): string {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "mu"));
  if (!match) return "";
  const raw = match[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  return raw.replace(/\s+#.*$/u, "").trim();
}

export function parseBilibiliCredentialToml(source: string): BilibiliCredential {
  const credential = {
    sessdata: tomlString(source, "sessdata"),
    biliJct: tomlString(source, "bili_jct"),
    buvid3: tomlString(source, "buvid3") || tomlString(source, "buvid"),
  };
  if (!credential.sessdata) throw new Error("B站凭据文件里没有 sessdata");
  return credential;
}

export async function loadBilibiliCredential(path: string): Promise<BilibiliCredential> {
  try {
    return parseBilibiliCredentialToml(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && /sessdata/u.test(error.message)) throw error;
    throw new Error(`无法读取B站凭据文件：${path}`);
  }
}

export function sampleTranscript(text: string, maxCharacters = 18_000): string {
  if (text.length <= maxCharacters) return text;
  const markerA = "\n\n……字幕中间采样……\n\n";
  const markerB = "\n\n……字幕后段……\n\n";
  const budget = Math.max(0, maxCharacters - markerA.length - markerB.length);
  const firstLength = Math.floor(budget * 0.3);
  const middleLength = Math.floor(budget * 0.4);
  const lastLength = budget - firstLength - middleLength;
  const middleStart = Math.max(firstLength, Math.floor((text.length - middleLength) / 2));
  return text.slice(0, firstLength) + markerA +
    text.slice(middleStart, middleStart + middleLength) + markerB +
    text.slice(-lastLength);
}

async function resolveBvid(reference: string, request: typeof fetch, timeoutMs: number): Promise<string> {
  const direct = reference.match(BV_PATTERN)?.[0];
  if (direct) return direct;
  if (/^https?:\/\/(?:www\.)?b23\.tv\//iu.test(reference)) {
    const response = await request(reference, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`B站短链接解析失败（HTTP ${response.status}）`);
    const redirected = response.url.match(BV_PATTERN)?.[0];
    if (redirected) return redirected;
  }
  throw new Error("没有从链接中找到有效的 BV 号");
}

function headers(credential: BilibiliCredential): Record<string, string> {
  return {
    Referer: "https://www.bilibili.com/",
    Cookie: `SESSDATA=${credential.sessdata}; bili_jct=${credential.biliJct}; buvid3=${credential.buvid3}`,
  };
}

async function getJson(
  request: typeof fetch,
  url: string,
  requestHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<Record<string, any>> {
  const response = await request(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`B站接口返回 HTTP ${response.status}`);
  return await response.json() as Record<string, any>;
}

function chineseTracks(body: Record<string, any> | undefined): SubtitleTrack[] {
  const tracks = body?.data?.subtitle?.subtitles;
  if (!Array.isArray(tracks)) return [];
  return tracks.filter((track: SubtitleTrack) =>
    String(track.lan_doc ?? "").includes("中文") || String(track.lan ?? "").startsWith("ai-zh")
  );
}

export async function readBilibiliVideo(
  reference: string,
  config: ReadVideoConfig,
): Promise<BilibiliVideoContent> {
  const request = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 20_000;
  const bvid = await resolveBvid(reference, request, timeoutMs);
  const requestHeaders = headers(config.credential);
  const infoBody = await getJson(
    request,
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    requestHeaders,
    timeoutMs,
  );
  if (infoBody.code !== 0 || !infoBody.data) {
    throw new Error(`读取B站视频信息失败：${String(infoBody.message ?? infoBody.code)}`);
  }
  const raw = infoBody.data as Record<string, any>;
  const pages: Array<Record<string, any>> = Array.isArray(raw.pages) ? raw.pages : [];
  const part = pages.find((page) => page.cid === raw.cid) ?? pages[0];
  const partSeconds = Number(part?.duration ?? raw.duration) || 0;
  const info: BilibiliVideoInfo = {
    bvid: String(raw.bvid ?? bvid),
    title: String(raw.title ?? ""),
    owner: String(raw.owner?.name ?? ""),
    description: String(raw.desc ?? ""),
    durationSeconds: Number(raw.duration) || 0,
    partCount: pages.length || 1,
  };

  const primary = await getJson(
    request,
    `https://api.bilibili.com/x/player/wbi/v2?aid=${raw.aid}&cid=${raw.cid}&bvid=${raw.bvid}`,
    requestHeaders,
    timeoutMs,
  ).catch(() => undefined);
  let tracks = chineseTracks(primary);
  if (!tracks.length) {
    const fallback = await getJson(
      request,
      `https://api.bilibili.com/x/player/v2?bvid=${raw.bvid}&cid=${raw.cid}`,
      requestHeaders,
      timeoutMs,
    ).catch(() => undefined);
    tracks = chineseTracks(fallback);
  }
  if (!tracks.length) {
    return { info, subtitleAvailable: false, subtitleNote: "这条视频没有中文字幕（含 AI 字幕）。", transcript: "" };
  }

  const rejected: string[] = [];
  for (const track of tracks) {
    let subtitleUrl = String(track.subtitle_url ?? "");
    if (!subtitleUrl) continue;
    if (subtitleUrl.startsWith("//")) subtitleUrl = `https:${subtitleUrl}`;
    const subtitle = await getJson(request, subtitleUrl, requestHeaders, timeoutMs).catch(() => undefined);
    const entries: Array<Record<string, any>> = Array.isArray(subtitle?.body) ? subtitle.body : [];
    const lines = entries.map((entry) => String(entry.content ?? "").trim()).filter(Boolean);
    const endSeconds = entries.reduce((latest, entry) => Math.max(latest, Number(entry.to) || 0), 0);
    const minutes = partSeconds / 60;
    if (!lines.length || (minutes > 0 && lines.length / minutes < MIN_LINES_PER_MINUTE)) {
      rejected.push("字幕密度异常");
      continue;
    }
    if (partSeconds > 0 && endSeconds / partSeconds < MIN_TIMELINE_COVERAGE) {
      rejected.push("字幕时间轴覆盖不足");
      continue;
    }
    return {
      info,
      subtitleAvailable: true,
      subtitleNote: `已读取${String(track.lan_doc || track.lan || "中文")}，共 ${lines.length} 行。`,
      transcript: sampleTranscript(lines.join("\n")),
    };
  }
  return {
    info,
    subtitleAvailable: false,
    subtitleNote: `字幕轨存在但不可用：${rejected.join("；") || "内容为空"}。`,
    transcript: "",
  };
}

export function formatBilibiliContext(video: BilibiliVideoContent): string {
  return [
    `视频：${video.info.title}`,
    `BV号：${video.info.bvid}`,
    `UP主：${video.info.owner || "未知"}`,
    `时长：${video.info.durationSeconds} 秒；分P数：${video.info.partCount}`,
    `简介：${video.info.description || "（无）"}`,
    `字幕状态：${video.subtitleNote}`,
    video.transcript ? `\n字幕：\n${video.transcript}` : "",
  ].filter(Boolean).join("\n");
}
