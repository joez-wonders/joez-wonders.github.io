import { getCollection } from "astro:content";
import { sortPosts } from "../lib/posts";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[char] ?? char));

export async function GET({ site }: { site: URL }) {
  const posts = sortPosts((await getCollection("posts")).filter((post) => !post.data.draft));
  const base = import.meta.env.BASE_URL;
  const items = posts.map((post) => {
    const url = new URL(`${base}posts/${post.id}/`, site).href;
    return `<item><title>${escape(post.data.title)}</title><link>${url}</link><guid>${url}</guid><description>${escape(post.data.description ?? "")}</description><pubDate>${post.data.publishedAt.toUTCString()}</pubDate></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>JOEZ/WONDERS</title><description>JOEZ/WONDERS 的文章。</description><link>${new URL(base, site).href}</link>${items}</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
