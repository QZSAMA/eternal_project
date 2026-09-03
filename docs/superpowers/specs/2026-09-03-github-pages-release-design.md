# GitHub Pages 正式发布设计

## 目标

将当前已验证的 `feat/cover-character-layering` 完整版本快进合并到 `main`，并以 `main` 作为唯一正式发布源部署到 GitHub Pages。

## 方案选择

采用 GitHub 官方 Pages Actions 流程，而不是维护 `gh-pages` 分支或引入第三方托管平台。这样发布提交与正式代码保持同一条历史，仓库仍是无构建、离线优先的纯静态应用。

## 架构

- `.github/workflows/deploy-pages.yml` 仅响应 `main` 推送和人工触发。
- `verify` 作业先运行 `npm test` 与 `npm run check`。
- `deploy` 作业只有在 `verify` 成功后才上传仓库静态文件并调用 GitHub Pages 部署。
- 工作流只使用 GitHub 官方 Actions，不为网页运行时增加 CDN、在线字体、API 或 npm 依赖。
- Pages 使用仓库项目路径 `/eternal_project/`；现有相对资源路径无需重写。

## 权限与并发

工作流只授予 `contents: read`、`pages: write` 与 `id-token: write`。发布环境命名为 `github-pages`。同一时间只保留一个 Pages 发布队列，但不强制取消正在运行的部署，避免留下不明确的线上状态。

## 故障处理

- 测试或语法检查失败时不上传、不部署，线上继续保留上一成功版本。
- Pages 尚未启用时，通过 GitHub API 将构建类型设为 `workflow`，然后人工重跑工作流。
- 部署完成后以无头 Chromium 访问正式 URL，检查 HTTP 成功、首页可交互、资源无 404、无外链运行时请求。

## 验收标准

1. 发布契约自动测试能确认 `main` 触发器、验证门禁、最小权限、官方上传与部署动作。
2. `npm test`、`npm run check`、`git diff --check` 全部通过。
3. 功能分支与 `main` 都指向同一个已验证发布提交。
4. GitHub Pages workflow 成功，API 返回线上 URL。
5. 线上首页静默 smoke 通过，并保留 Three.js → Canvas 2D → skip 降级链路。

