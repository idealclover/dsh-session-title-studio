# 会话标题工坊 · Session Title Studio

[English](./README.md) | 简体中文

给 DeepSeek Harness 的会话标题加上**可配置的生成配方**和**可编排的刷新策略**。

它不做“又一个自动标题”，而是把标题从“一次性生成的字符串”变成可配置、可触发、可追溯的元数据：

- **Recipe（配方）**：自定义 prompt、语言、长度、命名风格、确定性前后缀、模型路由；
- **Policy（策略）**：空闲后刷新、每 N 轮刷新、定时扫描、手动刷新，并带一整套护栏；
- **Drift（漂移）**：本地 n-gram 比较最近消息和标题依据，话题没变就不刷，**不额外调用模型**；
- **Settings（设置页）**：Settings → 会话标题工坊，或插件详情页内直接改，字段即时生效；
- **安全默认**：绝不覆盖你手动改过的标题；刷新失败保留旧标题；没有新消息不调用模型。

底层复用 DSH 自己的 `session/title` 日志与 `ctx.sessionTitle` 服务，所以标题在回放、恢复、分页后都还在，并且**永远不会进入模型上下文**。

---

## 安装

1. 打开 DSH Web/Desktop 的 **插件 → 添加插件 → 安装第三方插件**，填入 Git 仓库来源：

   ```text
   git+https://github.com/idealclover/dsh-session-title-studio.git
   ```

   如需本地开发，也可以先克隆仓库，再安装目录的**绝对路径**：

   ```bash
   git clone https://github.com/idealclover/dsh-session-title-studio.git
   cd dsh-session-title-studio
   pwd
   ```

   把 `pwd` 输出的完整目录填入插件安装器即可。本项目提供纯 JavaScript，不需要额外构建。

2. 启用 **会话标题工坊**（Session Title Studio）。如果 DSH 提示需要重启，请按提示重启。

3. 如果此前启用了官方的 **「随对话更新的标题」**（`dsh-experimental-session-titles-bundle`），请先关闭它。全局只有一个标题提供方槽位，两个同时开会有一个注册失败。

安装后，在输入框里输入 `/title` 即可使用。

---

## 设置页

两个入口，内容相同：

- **Settings → 会话标题工坊**（独立设置页）；
- **插件 → 会话标题工坊 → 设置**（组合包详情页内）。

所有字段都是 volatile 配置，修改会立即写入当前 profile 并生效，不需要重启。每个字段右侧的「恢复默认」会清掉用户覆盖层，回落到组合包默认值。

设置页本身是 Client 工件，在宿主启动时加载。从没有设置页的旧版本升级时，需要**重启一次 DSH** 才会出现设置页；之后改配置不需要重启。

---

## 它解决什么问题

DSH 默认的标题策略是 **first-prompt**：只用第一句话生成一次标题，之后再也不会变。官方的实验性 bundle 换成了 **all-prompts**：每来一条消息都尝试刷新，但 prompt、语言、长度全部写死，也没有“多久刷一次”的概念。

本插件的组合是：

| | 默认 first-prompt | 官方 all-prompts | 本插件 |
|---|---|---|---|
| 生成时机 | 仅首条消息 | 每条消息 | 首次自动 + 策略决定 |
| 刷新时机可配 | 否 | 否 | 是 |
| prompt 可配 | 否 | 否 | 是 |
| 格式/前后缀 | 否 | 否 | 是 |
| 语言/长度 | 硬编码 | 硬编码 | 可配 |
| 手动刷新 | 无入口 | 无入口 | `/title refresh` |
| 手改标题保护 | 是 | 是 | 是（可强制） |
| 成本控制 | — | 每条消息一次 | 新消息 + 间隔 + 日预算 |

---

## 一个组件

安装的是**一个 bundle、一个组件**：`session-title-studio`。

recipe（生成）和 policy（刷新）仍然是两个独立模块，但由同一个入口组合，配置也嵌套在同一个 row 里：

```yaml
- id: session-title-studio
  name: '@idealclover/dsh-session-title-studio'
  config:
    recipe:
      preset: concise
      language: zh
    policy:
      enableIdle: true
      everyNTurns: 4
```

好处是插件页只有一个开关、一个标签、一个配置命名空间，不会再出现第二行原始子路径。

从 0.4.x 的两个 row 升级时，bundle patch 会把旧的 `session-title-studio-recipe` / `session-title-studio-policy` disable 掉；旧的 profile 覆盖值不再生效，需要在设置页重新设置一次。升级前请备份已有的自定义配置。

---

## 配方配置（recipe）

| 字段 | 默认 | 说明 |
|---|---|---|
| `preset` | `concise` | `concise` / `action` / `topic-tags` / `conventional` / `custom` |
| `systemPrompt` | `""` | 追加到预设 prompt 的额外指令；`custom` 时作为完整 prompt |
| `userTemplate` | `""` | 自定义 user message；空则使用 JSON 封装 |
| `language` | `auto` | `auto` / `zh` / `en` / `bilingual` |
| `targetWords` | `5` | 非 CJK 目标词数 |
| `targetCjkCharacters` | `10` | CJK 目标字数 |
| `prefix` | `""` | 确定性前缀，如 `[dsh] ` |
| `suffix` | `""` | 确定性后缀，如 ` · 2026-10-18` |
| `stability` | `balanced` | `strict` 尽量不改 / `balanced` 主题变了才改 / `follow` 跟随最新 |
| `maxTitleBytes` | `80` | 最终标题的 UTF-8 字节预算（服务端可能更小，以服务为准） |
| `maxInputBytes` | `4096` | 渲染后 user input 的字节上限 |
| `maxOutputTokens` | `1024` | 辅助请求输出上限 |
| `timeoutMs` | `60000` | 辅助请求超时 |
| `provider` / `model` | `""` | 可选独立模型路由；必须成对配置，留空则跟随会话当前路由 |

### 标题模型

设置页的「标题模型」是一个真正的模型选择器：它从当前 DSH 的全局模型目录里按 provider 分组列出模型。选中的路由**只用于标题辅助请求**，不会切换会话本身的模型；留空就是「跟随当前会话模型」。

模型选择会原子地同时写入 `provider` 和 `model`，所以不会出现只配了一半的中间状态。底层配置字段仍然保留，YAML 里可以直接写：

```yaml
provider: deepseek-account
model: deepseek-v4-pro
```

标题请求固定使用该路由**最低的 reasoning effort**，以控制成本；失败时保留旧标题。

### 变量

`systemPrompt` 和 `userTemplate` 支持：

| 变量 | 内容 |
|---|---|
| `{{messages}}` | 预算内选取的用户消息，JSON 数组 `[{seq,text}]`；长对话保留首条与最近内容 |
| `{{transcript}}` | 纯文本转录，每条消息一段 |
| `{{currentTitle}}` | 当前标题（仅当它来自 provider 时作为锚点传入） |
| `{{firstMessage}}` | 第一条用户消息 |
| `{{workspace}}` | 会话工作目录的 basename |
| `{{date}}` | 本地日期 `YYYY-MM-DD` |
| `{{messageCount}}` | 符合条件的消息数 |

未知变量会在加载时直接报错，而不是静默消失。

### 预设

- **concise**：短标题，最接近官方行为；
- **action**：动词开头，如 `修复登录超时`；
- **topic-tags**：2–3 个标签，用 ` · ` 分隔；
- **conventional**：Conventional Commits 风格，如 `fix(auth): handle OAuth timeout`；
- **custom**：完全使用你的 `systemPrompt`，不再追加语言/长度/稳定性指令。

### 示例

项目前缀 + 中文 + 只在主题变化时改：

```yaml
- id: session-title-studio
  config:
    recipe:
      preset: action
      language: zh
      targetCjkCharacters: 12
      prefix: '[demo] '
      stability: balanced
      maxTitleBytes: 80
```

自定义完整 prompt：

```yaml
- id: session-title-studio
  config:
    recipe:
      preset: custom
      systemPrompt: |
        你在为一个中文开发会话起标题。
        只输出一行，6–12 个汉字，动词开头，不要引号、不要标点结尾。
        如果 currentTitle 仍然准确，原样返回。
      language: zh
```

---

## 刷新策略（policy）

| 字段 | 默认 | 说明 |
|---|---|---|
| `enableIdle` | `true` | 一轮结束后、安静一段时间再刷 |
| `idleDebounceMs` | `180000` | 空闲判定时长（3 分钟） |
| `everyNTurns` | `4` | 每 N 条新用户消息刷一次；`0` 关闭 |
| `intervalMs` | `0` | 定时扫描活跃会话；`0` 关闭，开启时最小 30 秒 |
| `activeWindowMs` | `1800000` | 只扫描最近 30 分钟有活动的会话 |
| `minIntervalMs` | `120000` | 同一会话两次自动刷新最小间隔 |
| `maxRefreshesPerSessionPerDay` | `12` | 每会话每日自动刷新预算 |
| `maxSessionsPerSweep` | `5` | 一次扫描最多刷几个会话 |
| `maxSessionsPerBatch` | `10` | 一次 `/title rebuild all` 最多重建几个活跃会话 |
| `includeSubagents` | `false` | 是否也给子会话刷标题 |
| `respectPinned` | `true` | 不覆盖用户手动改过的标题 |
| `refreshTimeoutMs` | `90000` | 单次刷新的调用方超时 |
| `enableDrift` | `true` | 启用本地话题漂移判断 |
| `driftThreshold` | `0.6` | 漂移分数达到该值才自动刷新（0–1，越高越保守） |
| `driftMinNewMessages` | `1` | 少于该数量的新消息不做漂移判断 |
| `driftForceAfterMessages` | `6` | 新消息达到该数量时跳过漂移判断，直接刷新 |
| `driftWindowMessages` | `12` | 参与比较的最近消息条数 |
| `driftMinChars` | `24` | 最近文本短于该长度时不做漂移判断 |

### 触发时机

```
用户消息 ──► 清除空闲计时
turn/end ──► ① 每 N 轮判断
             ② 安排空闲计时 ──► idle 刷新
定时器   ──► 扫描活跃会话 ──► interval 刷新
/title refresh ──► 手动刷新
```

### 触发前必须通过的护栏

1. **子会话**：默认跳过；
2. **固定标题**：`source.kind === 'user'` 时跳过，`force` 才覆盖；
3. **有没有新内容**：标题覆盖的消息数 ≥ 当前消息数时跳过；
4. **每 N 轮阈值**：新消息数不足 N 时跳过；
5. **话题漂移**：逐条给最近消息打漂移分，最高分低于 `driftThreshold` 时跳过；新消息达到 `driftForceAfterMessages` 时绕过；
6. **最小间隔**：距上次尝试太近时跳过；
7. **每日预算**：超过上限时跳过；
8. **并发**：同一会话同时只允许一个刷新在飞。

手动刷新会绕过 3/5/6/7，但默认仍然尊重固定标题。这是有意的：`/title refresh` 不应该意外抹掉你精心起的名字。

### 话题漂移怎么算

漂移检测完全在本地、纯 JS 完成，**不额外调用模型**：

1. 每次成功刷新标题时，把标题覆盖的用户消息保存为“标题依据”；
2. 下一次自动触发时，取出标题之后的新用户消息，逐条与“标题依据”比较；
3. 去掉代码块、URL 和中文/英文的对话填充词后，拉丁词按单词、中文按字符 bigram 建 token 集合；
4. 用 `0.7 × containment + 0.3 × Jaccard` 计算相似度，`漂移 = 1 - 相似度`；
5. 取最近消息里的**最高漂移分**（避免一条旧的同话题消息把后面的新话题稀释掉）；
6. 最高分 ≥ `driftThreshold` 才刷新；新消息达到 `driftForceAfterMessages` 时无条件刷新，防止标题永远不更新。

它是词面统计，不是语义模型：同义改写、跨语言的同一话题可能被判成“漂移”，带很多代码的长消息也可能被高估。阈值和强制条数都可以在设置页调。

---

## 命令

| 命令 | 作用 |
|---|---|
| `/title` | 查看当前标题、来源、更新时间、覆盖率 |
| `/title refresh` | 立即刷新（尊重固定标题） |
| `/title refresh force` | 强制刷新，即使标题已被手动固定 |
| `/title rebuild` | 重建当前会话标题 |
| `/title rebuild all` | **预览**会重建哪些活跃会话，不发任何模型请求 |
| `/title rebuild all confirm` | 执行批量重建 |
| `/title rebuild all confirm force` | 连固定标题一起重建 |
| `/title rename <text>` | 手动改名并固定 |

`/title rename` 会固定标题；把它重新交还给自动策略的方式是 `/title refresh force`。

在输入框里先输入 `/` 并从菜单选中 `title`，再输入子命令；直接把一整行 `/title refresh` 当普通消息发出去会被模型当成聊天内容。

`/title` 还会显示当前 `Policy`（idle/everyN/min）和 `Last auto`：最近一次自动判断是 `idle-scheduled`、`idle-fired`、`skip (no-drift)`、`refreshed` 还是 `error`。排查“为什么没刷”时先看这一行。

### 批量重建

**推荐使用设置页按钮，不需要打开会话或输入命令：**

1. 打开 **插件 → 会话标题工坊 → 维护**（或 Settings → 会话标题工坊）。
2. 先选 **「仅当前已加载会话」** 或 **「全部对话（包含未加载历史）」**，再点击 **「批量重建标题…」** 查看数量、目标清单、跳过项与预计模型请求数。
3. 默认保护固定标题；只有显式勾选「同时重建手动固定的标题」时才纳入，并显示覆盖警告。
4. 点击 **「确认重建」** 执行；显示进度和逐项结果，运行中可点「停止重建」。关闭设置页不会取消任务，重新打开可恢复显示；停止后已完成的标题会保留。

预览**不调用模型**，有效期 5 分钟。确认使用预览中的准确目标清单，不会把后来打开的会话偷偷加入；确认后变成固定标题的会话也会再次检查。任务串行执行、全局同一时刻只允许一批；重复提交同一个确认不会重复执行。

命令仍作为快捷入口保留，和按钮共用同一套批量控制器。已加载范围受 `maxSessionsPerBatch`（默认 10）限制；**全部历史范围不截成前 10 个**，会串行处理预览中的全部符合条件目标。预计每个目标一次辅助标题调用（模型服务重试另计）。

```text
/title rebuild all                  # 预览
/title rebuild all confirm          # 执行
/title rebuild all confirm force    # 连 pin 一起
```

**全部历史模式**通过 DSH 持久化服务只读扫描，再对每个冷会话取得独占写锁、生成标题并追加已知日志事件，完成持久化后释放。不会创建或唤醒主智能体，也不会把所有对话一次性载入内存。固定标题、空会话、子会话默认排除；不可读记录在预览中列明，执行时被其他进程占用的记录跳过，不强行解锁。这里的“全部”指持久化服务能发现且读取的对话，不保证损坏头部等不可发现物理记录。命令 `rebuild all` 保留已加载范围；全部历史请在设置页选择。

冷会话使用共享的标题模型设置，留空则读取该会话最后记录的模型路由；两者都没有时会明确失败，建议先指定标题模型。冷写回采用保守的 80 字节标题上限；标题请求审计在本次操作收尾时持久化，并非网络发出前的崩溃持久化保证。

### 标题写回与侧栏同步

从 0.7.1 起，冷标题日志持久化后会在写锁内更新 `sessionProjectionCache`，释放写锁后发送带**准确日志水位**的 `api-session/added` 更新。这样即使客户端之前读过该会话，也不会被旧的投影缓存挡住；侧栏无需点开会话即可更新。标题刷新不改变最后用户消息时间，因此不会把历史会话全部重新排序到最前面。派生缓存或通知失败会作为同步警告显示，不会将已经保存的标题误报成模型生成失败。

修复旧版本已经保存但未显示的标题，可点击 **维护 →「同步已保存标题到侧栏」**。它只读日志、修复派生缓存并推送标题，**不重新生成、不调用模型、不唤醒会话、不修改会话日志**。界面报告的是已推送数量；该修复使用 DSH 的 fail-soft 冷投影缓存写回，缓存持久化由框架异步完成。

---

## 请求成本

漂移判断是纯本地计算，**不产生请求**。真正会调用模型的只有“标题生成/刷新”本身：

- 每个**新会话**首条消息后 1 次自动生成；
- 自动刷新候选来自 idle / 每 N 轮 / 定时扫描，但必须同时通过：有新消息、非 pinned、最小间隔 2 分钟、每日预算、以及漂移判断（或新消息达到 6 条强制刷新）；
- 每个会话每天最多 `maxRefreshesPerSessionPerDay`（默认 **12**）次自动刷新；
- 定时扫描默认关闭；打开后一次最多处理 5 个活跃会话；
- 没有新消息、pinned、子会话、漂移不足时，**0 次请求**；
- 单次输入上限 4096 字节、输出上限 1024 token；标题输出通常很短。

因此一个普通会话的典型成本是“首次 1 次 + 几次漂移刷新”，不是每条消息一次；最坏情况也被每日 12 次的上限封顶。批量重建会按会话数放大请求，所以先在页面预览，再点击「确认重建」（命令入口使用 `confirm`），已加载范围受 `maxSessionsPerBatch` 限制，全部历史按预览总量确认。

如果仍想更省，可以在设置页：

- 关闭「空闲后刷新」，只保留每 N 轮；
- 把「每日刷新预算」降到 4；
- 把「漂移阈值」调到 0.7，或把「强制刷新阈值」调大。

---

## 安全与边界

- **手改优先**：默认绝不覆盖 `source.kind === 'user'` 的标题。
- **失败保留旧标题**：provider 出错、超时、输出不合法时，标题服务保留现有标题。
- **冷历史重建**：使用独占写锁及已验证的 DSH 0.2 持久化 API；损坏、格式不兼容、正在写入的记录不会强行覆盖。
- **预算在内存里**：每日次数和最后尝试时间在进程内维护；重启后日预算清零，但最小间隔会从标题的 `updatedAt` 恢复。
- **80 字节现实**：base 配置的 `maxTitleBytes` 是 80。前缀越长，留给模型内容的越少；预览请在配置里自己算一下字节。
- **超长对话**：保留首条意图与最近消息，对单条长文本做 Unicode 安全的头尾缩短，并按最终 JSON/模板字节数计算预算，不再因会话超过 4096 字节直接拒绝。自定义模板固定文本本身过长仍会报配置错误，不会悄悄截断指令。抽样来源按真实 seq 记录，单独维护处理水位避免反复自动刷新。
- **单 provider**：与官方 all-prompts bundle 互斥，二者只能开一个。
- **设置页依赖 settings 服务**：profile 没有启用设置界面时，仍可通过 `cordis.patch.yml` 改配置；字段本身仍然是 volatile。
- **漂移是词面的**：同义改写或跨语言表达可能被误判；需要更稳的行为时调高 `driftThreshold` 或调大 `driftForceAfterMessages`。

---

## 开发与验证

```bash
cd dsh-session-title-studio
npm test          # node:test，覆盖纯逻辑
npm run check     # 语法检查 + 测试
```

纯逻辑（模板、格式化、策略判定、漂移打分、配置校验）不依赖 Harness，可以直接在 Node 里跑。涉及 DSH 服务、历史存储和客户端模块的集成测试，需要相应的 DSH 依赖可解析；在独立 checkout 缺少宿主依赖时，这部分测试会明确标记为跳过，不能把纯逻辑测试通过当成完整宿主兼容性验证。Host 入口负责注册 provider、挂事件、注册命令；`client.js` 是设置页的浏览器工件。

---

## License

MIT
