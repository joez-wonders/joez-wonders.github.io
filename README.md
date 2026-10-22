# JOEZ/WONDERS

一个使用 Astro 构建、通过 GitHub Pages 发布的简洁个人博客。

## 视听室

主导航中的「视听室」（`/listen/`）收集 Cubox 和滴答清单中的视频、播客与访谈，按北京时间推荐适合夜晚、周末和打扫时听的内容。

支持小宇宙站内音频与续播、官方视频内嵌、搜索筛选、待播队列和看完记录。内容为更新时的收藏快照，记录保存在当前浏览器。更新方式与播放限制见 [视听室说明](docs/listening-room.md)。

## 写一篇文章

在 `src/content/posts/` 新建 Markdown 文件，例如 `my-new-post.md`：

```md
---
title: "文章标题"
publishedAt: 2026-08-01
tags: [使用体验, 思考]
draft: false
---

从这里开始写正文。
```

将 `draft` 设为 `true` 可以保留草稿而不发布。

`templates/` 中有「使用体验」和「思考」两个可直接复制的模板。

## 本地预览

```bash
npm install
npm run dev
```

## 发布到 GitHub Pages

1. 将代码推送到 `main` 分支。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中把 Source 设为 **GitHub Actions**。
4. 等待 `Deploy to GitHub Pages` 工作流完成。

站点地址：`https://joez-wonders.github.io/`

如果以后使用自定义域名，请同时更新 `astro.config.mjs` 中的 `site` 和 `base`。
