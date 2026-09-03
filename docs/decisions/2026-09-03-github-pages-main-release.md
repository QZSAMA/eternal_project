# 决策记录：main 分支 GitHub Pages 正式发布

日期：2026-09-03

## 背景

项目已在功能分支完成封面、角色分层、触屏小游戏、Three.js 本地 vendoring、2D/skip fallback、静音和蒙太奇控制等优化。用户希望把可验证版本合并到正式分支并提供远程预览。

## 决策

1. `main` 是唯一生产部署源；功能分支先通过本地发布门禁，再以同一提交快进合并到 `main`。
2. 使用 GitHub 官方 Pages Actions（`configure-pages`、`upload-pages-artifact`、`deploy-pages`）托管仓库根目录静态文件。
3. 工作流由 `main` 推送或人工 `workflow_dispatch` 触发；部署作业依赖验证作业，验证作业必须通过 `npm test` 和 `npm run check`。
4. 工作流权限限制为 `contents: read`、`pages: write`、`id-token: write`，发布环境为 `github-pages`。
5. Pages 只托管文件，不改变网页运行时约束：Three.js、图片和脚本全部保持本地同源，Canvas 2D 与 skip fallback 继续有效。

## 影响与回滚

- 正式预览地址为 <https://qzsama.github.io/eternal_project/>。
- 测试或语法检查失败时不会产生新部署，线上继续使用上一成功版本。
- 如需回滚，向 `main` 推送一个已知良好提交；不维护额外 `gh-pages` 分支。

## 发布前置条件

- 公开部署前确认真实姓名、照片、角色素材和文案的授权范围。
- 每次发布执行无网络浏览器 smoke，并检查无 404、外链运行时请求、ReferenceError 或未处理 Promise 拒绝。

