# 会话标题工坊：推广文案草稿

以下为可自行发布的文案，未代发到社区或社交账号。

## 社区短版

给 DSH 做了个「会话标题工坊」：对话聊着聊着换主题，标题也可以跟上，不必每条消息都刷新。

- 自定义中文 / emoji 标题、prompt、长度与前后缀
- 标题可以单独用一个模型，不改变会话主模型
- 空闲、每 N 条消息或定时触发；本地话题漂移判断不额外调用模型
- 侧栏「⋯ → 重新生成标题」，不用打开对话
- 历史标题先预览再批量重建，手改标题默认保护

开源仓库：https://github.com/idealclover/dsh-session-title-studio
安装与 Release：https://github.com/idealclover/dsh-session-title-studio/releases/latest

生成标题本身仍会消耗所选模型请求；支持最小间隔和自动刷新日预算。欢迎试用、反馈问题。

## 长版 / V2EX 或 GitHub Discussion 草稿

### 标题

给 DeepSeek Harness 做了个会话标题插件：自定义中文 / emoji、按话题刷新、重建旧标题

### 正文

长对话经常从一个问题聊到另一个问题，但侧栏标题还停留在开头。另一种做法是每条消息都请求一次标题模型，不过有时没必要，也不方便控制格式。

所以做了 Session Title Studio（会话标题工坊），把「生成什么样的标题」和「什么时候更新」分开配置。

**配方：** prompt、语言、长度、风格、固定前后缀、独立标题模型都有可视化设置。比如要求“一个贴合主题的 emoji + 中文短标题”，也可以保留原有风格。

**策略：** 空闲后、每 N 条新用户消息、定时扫描或手动触发。自动更新有最小间隔、每日预算和手改标题保护；本地 n-gram 话题漂移检测不会另发模型请求。

**旧标题：** 在侧栏点「⋯ → 重新生成标题」就能单条更新，无需打开对话。也可以先预览范围和请求数量，再串行重建历史标题；覆盖固定标题需要明确确认。

标题写回 DSH 自身的日志状态，不改聊天原文，也不进入主对话的模型上下文。失败会保留旧标题，已有标题如果只是侧栏缓存没更新，还可以不调用模型同步。

项目与安装说明：https://github.com/idealclover/dsh-session-title-studio
发布包：https://github.com/idealclover/dsh-session-title-studio/releases/latest

这是社区插件，不是官方功能或认证。当前在 DSH 0.2.2-rc.1 验证，未来宿主升级仍需跟进兼容性。欢迎提 issue，尤其是更合适的标题配方和触发策略。

## English short version

I built Session Title Studio for DeepSeek Harness: configurable prompts, language, formatting and a separate title model, plus idle/message-count/interval refresh policies. Local topic-drift detection makes no extra model calls. Regenerate a single sidebar title without opening the conversation, or preview and rebuild historical titles. Manually pinned titles are protected by default.

Title generation still uses your chosen model and its normal costs. Automatic refreshes support spacing and daily budgets.

Source: https://github.com/idealclover/dsh-session-title-studio
Install: https://github.com/idealclover/dsh-session-title-studio/releases/latest
