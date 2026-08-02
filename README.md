# JOEZ/WONDERS

一个使用 Astro 构建、通过 GitHub Pages 发布的简洁个人博客。

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
