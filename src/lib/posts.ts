import type { CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

export function sortPosts(posts: Post[]) {
  return posts.sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf(),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function readingTime(body = "") {
  const chinese = body.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = body
    .replace(/[\u3400-\u9fff]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil((chinese + words) / 400));
}
