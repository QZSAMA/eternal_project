# Eternal 项目协作协议

本项目是离线优先的求婚 Galgame。开始工作前阅读：

- `docs/project-memory.md`：当前事实、模块地图、已知风险。
- `docs/review-rules.md`：架构、内容、UI、TDD 和发布门禁。
- 最新的 `docs/reviews/*.md` 与 `docs/plans/*.md`：未关闭问题和推进顺序。

协作约束：

1. 不把网络 CDN、远程字体或在线 API 引入运行时；若确有必要，必须同时提交离线降级方案和 smoke 证据。
2. 行为变更遵循 TDD：先失败测试，再最小实现，再完整验证。
3. 文案、姓名、日期和媒体路径从 `js/storyData.js` 注入，不在渲染器中硬编码个人信息。
4. 每次架构或资产变更都更新 `docs/project-memory.md`，并补充审查记录或决策记录。
5. 交付前执行 `docs/review-rules.md` 的发布门禁，并在 PR/提交说明中附实际结果。

