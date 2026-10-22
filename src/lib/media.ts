export type Mode = "auto" | "evening" | "weekend" | "chores" | "focus";
export type Scene = Exclude<Mode, "auto">;
export interface MediaItem {
  id: string;
  title: string;
  description: string;
  url: string;
  kind: "podcast" | "video";
  platform: string;
  topics: string[];
  scenes: Scene[];
  listenOnly: boolean;
  interview: boolean;
  savedAt: string;
  durationMinutes?: number;
  audioUrl?: string;
  sources: { name: string; url: string }[];
}

export const scenes: Record<Scene, { label: string; title: string; description: string; reason: string }> = {
  evening: { label: "今晚放松", title: "把夜晚，留给一点好奇。", description: "慢下来，听一个故事，或去看看远方。今晚不必急着学会什么。", reason: "生活、写作和人物故事，适合晚上慢慢听。" },
  weekend: { label: "周末探索", title: "周末，往日常之外走走。", description: "给一场长谈留出时间。旅行、人文，或一个一直想了解的新世界。", reason: "周末白天，留给长对话、旅行和新发现。" },
  chores: { label: "打扫时听", title: "房间在变整洁，耳朵去散步。", description: "选一段不用盯着屏幕的对话。擦桌子、叠衣服，让好内容陪你做完家务。", reason: "优先播客和可只听的访谈，解放眼睛和双手。" },
  focus: { label: "认真看一会", title: "给一个好问题，一点时间。", description: "从收藏里挑一段值得专注的内容。产品、技术与商业，沿着好奇心往下走。", reason: "白天精力充足，适合信息更密集的技术与产品内容。" },
};

export function resolveScene(mode: Mode, date = new Date()): Scene {
  if (mode !== "auto") return mode;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  const weekend = ["Sat", "Sun"].includes(parts.find(p => p.type === "weekday")?.value || "");
  if (hour >= 19 || hour < 6) return "evening";
  if (weekend && hour >= 8 && hour < 12) return "chores";
  return weekend ? "weekend" : "focus";
}

export function safeURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return;
    return url.href;
  } catch { return; }
}

export function embedURL(value: string): string | undefined {
  if (!safeURL(value)) return;
  const url = new URL(value);
  if (["www.bilibili.com", "bilibili.com", "m.bilibili.com"].includes(url.hostname)) {
    const bvid = url.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/)?.[1];
    if (bvid) return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0&high_quality=1`;
  }
  if (["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`;
  }
}

export function rankMedia(items: MediaItem[], scene: Scene, completed: string[], day: string): MediaItem[] {
  const done = new Set(completed);
  const hash = (s: string) => [...s].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 0);
  return items.filter(item => !done.has(item.id) && (scene !== "chores" || item.listenOnly)).map(item => ({
    item,
    score: (item.scenes.includes(scene) ? 100 : 0)
      + (scene === "chores" && item.audioUrl ? 35 : 0)
      + (scene === "weekend" && item.topics.includes("人文与远方") ? 30 : 0)
      + (scene === "weekend" && (item.durationMinutes || 0) >= 60 ? 15 : 0)
      + (scene === "evening" && item.durationMinutes && item.durationMinutes <= 45 ? 12 : 0)
      + (item.audioUrl || embedURL(item.url) ? 15 : 0) + hash(day + item.id) % 19,
  })).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)).map(({ item }) => item);
}

export function formatDuration(minutes?: number): string {
  if (!minutes || !Number.isFinite(minutes)) return "时长未标注";
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ""}` : `${minutes} 分钟`;
}
