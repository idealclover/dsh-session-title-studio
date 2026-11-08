# 详细配置参考（供 AI 助手与高级用户阅读）

[English](./configuration.md) | 简体中文 · [返回 README](../README.md)

README 面向安装和日常使用；本文保存完整配置说明。AI 助手在替用户修改本插件的设置、编写 YAML、解释请求成本或操作批量重建前，应先阅读本文对应章节，不要仅凭 README 猜测参数名或默认值。

## 按任务查阅

| 用户目标 | 先读 |
|---|---|
| 改标题格式、语言、长度或 prompt | [配置结构](#config-layout)、[生成配方](#recipe)、[模板变量](#variables)、[常用配置](#recipes) |
| 给标题单独选模型 | [标题模型](#title-model) |
| 改刷新频率、降低请求量 | [刷新策略](#policy)、[漂移判断](#drift)、[请求成本](#request-cost) |
| 重建当前或历史标题 | [命令](#commands)、[批量重建](#batch-rebuild) |
| 重建成功但侧栏显示旧标题 | [侧栏同步](#sidebar-sync) |
| 排查输入超限、无更新或配置错误 | [排查清单](#troubleshooting)、[安全与边界](#safety) |

## AI 修改配置前检查

1. **先读取实际配置，再修改。** 唯一组件 id 是 `session-title-studio`，配置根下只有 `recipe` 和 `policy`。不要把字段平铺到根层，也不要插入第二个标题 provider。
2. **优先使用设置页。** 所有字段都是 volatile。若必须写 YAML，Cordis 的 `config` 覆盖会替换整个配置对象，而不是深度合并；应先保留用户现有的两个 section 和无关字段，再做目标改动，不能直接拿示例覆盖已有配置。
3. **确认模型路由与模板语义。** `recipe.provider` 与 `recipe.model` 必须同时设置或同时清空；`preset: custom` 需要非空 `systemPrompt`，此时语言、长度、稳定性指令应自行写入 prompt。
4. **不要擅自扩大范围或覆盖固定标题。** 用户只说改格式时，不代表同意重建全部历史。批量生成前需展示范围、数量与预计模型请求；包含手动固定标题要单独取得明确确认。
5. **示例不是默认值。** 默认值以 [constants.js](../lib/constants.js) 为准；字段类型与范围以 [schema.js](../lib/schema.js) 和 [config-core.js](../lib/config-core.js) 为准。应核对当前安装版本，不要把本文当成未来版本不变的 API 保证。

---

<a id="config-layout"></a>

## 一个组件

设置页修改会写入当前 profile，volatile 字段在下一次使用时读取，不需要为每次配置更改重启。每个字段的「恢复默认」会清除用户覆盖，回落到组合包配置或 schema 默认值。若升级后 Client 页面未更新，可先重新启用插件并刷新页面；宿主提示需要重启时按提示处理。

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

设置页只读写这个组件的嵌套配置，内部模块无需分别配置插件行。

从 0.4.x 的两个 row 升级时，bundle patch 会把旧的 `session-title-studio-recipe` / `session-title-studio-policy` disable 掉；旧的 profile 覆盖值不再生效，需要在设置页重新设置一次。升级前请备份已有的自定义配置。

---

<a id="recipe"></a>

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

<a id="title-model"></a>

### 标题模型

设置页的「标题模型」是一个真正的模型选择器：它从当前 DSH 的全局模型目录里按 provider 分组列出模型。选中的路由**只用于标题辅助请求**，不会切换会话本身的模型；留空就是「跟随当前会话模型」。

模型选择会原子地同时写入 `provider` 和 `model`，所以不会出现只配了一半的中间状态。底层配置字段仍然保留，YAML 里可以直接写：

```yaml
provider: deepseek-account
model: deepseek-v4-pro
```

标题请求固定使用该路由**最低的 reasoning effort**，以控制成本；失败时保留旧标题。

<a id="variables"></a>

### 变量

`systemPrompt` 和 `userTemplate` 支持：

| 变量 | 内容 |
|---|---|
| `{{messages}}` | 预算内选取的用户消息，JSON 数组 `[{seq,text}]`；长对话保留首条与最近内容 |
| `{{transcript}}` | 纯文本转录，每条消息一段 |
| `{{currentTitle}}` | 当前标题（仅当它来自 provider 时作为锚点传入） |
| `{{firstMessage}}` | 第一条用户消息（可能已按预算缩短） |
| `{{workspace}}` | 会话工作目录的 basename |
| `{{date}}` | 本地日期 `YYYY-MM-DD` |
| `{{messageCount}}` | 当前实际采样的消息数，不是完整历史消息总量 |

未知变量会在加载时直接报错，而不是静默消失。

<a id="presets"></a>

### 预设

- **concise**：短标题，最接近官方行为；
- **action**：动词开头，如 `修复登录超时`；
- **topic-tags**：2–3 个标签，用 ` · ` 分隔；
- **conventional**：Conventional Commits 风格，如 `fix(auth): handle OAuth timeout`；
- **custom**：完全使用你的 `systemPrompt`，不再追加语言/长度/稳定性指令。

<a id="examples"></a>

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

<a id="policy"></a>

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

<a id="drift"></a>

### 话题漂移怎么算

漂移检测完全在本地、纯 JS 完成，**不额外调用模型**：

1. 每次成功刷新标题时，把标题覆盖的用户消息保存为“标题依据”；
2. 下一次自动触发时，取出标题之后的新用户消息，逐条与“标题依据”比较；
3. 去掉代码块、URL 和中文/英文的对话填充词后，拉丁词按单词、中文按字符 bigram 建 token 集合；
4. 用 `0.7 × containment + 0.3 × Jaccard` 计算相似度，`漂移 = 1 - 相似度`；
5. 取最近消息里的**最高漂移分**（避免一条旧的同话题消息把后面的新话题稀释掉）；
6. 最高分 ≥ `driftThreshold` 才刷新；新消息达到 `driftForceAfterMessages` 时绕过漂移判断，但仍受触发时机、最小间隔、每日预算和固定标题保护约束。

它是词面统计，不是语义模型：同义改写、跨语言的同一话题可能被判成“漂移”，带很多代码的长消息也可能被高估。阈值和强制条数都可以在设置页调。

---

<a id="commands"></a>

## 命令

### 侧栏单会话操作

点击侧栏目标会话的 **「⋯ → 重新生成标题」**。操作绑定被点击的会话 id，不会切换当前选中的对话；也支持未打开的冷历史。它复用同一标题模型、prompt、预算与历史写锁，成功后立即推送侧栏标题。新版本 DSH 使用原生会话菜单，旧版本通过兼容菜单插槽展示，避免重复菜单项。

默认先检查固定标题：若该标题由用户手动命名，会提示确认覆盖并解除固定；取消不会调用模型。非固定标题直接生成，约一次标题模型请求。生成期间显示进度并阻止重复点击，失败和锁占用会显示明确原因。只有菜单关闭不会取消生成；卸载插件或关闭页面可能中止请求。子会话仍受 `includeSubagents` 限制。


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

<a id="batch-rebuild"></a>

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

<a id="sidebar-sync"></a>

### 标题写回与侧栏同步

从 0.7.1 起，冷标题日志持久化后会在写锁内更新 `sessionProjectionCache`，释放写锁后发送带**准确日志水位**的 `api-session/added` 更新。这样即使客户端之前读过该会话，也不会被旧的投影缓存挡住；侧栏无需点开会话即可更新。标题刷新不改变最后用户消息时间，因此不会把历史会话全部重新排序到最前面。派生缓存或通知失败会作为同步警告显示，不会将已经保存的标题误报成模型生成失败。

修复旧版本已经保存但未显示的标题，可点击 **维护 →「同步已保存标题到侧栏」**。它只读日志、修复派生缓存并推送标题，**不重新生成、不调用模型、不唤醒会话、不修改会话日志**。界面报告的是已推送数量；该修复使用 DSH 的 fail-soft 冷投影缓存写回，缓存持久化由框架异步完成。

---

<a id="request-cost"></a>

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

<a id="safety"></a>

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

<a id="recipes"></a>

## 常用配置：供 AI 按用户目标选用

下面只是要合并到现有 `config` 的字段片段，不是替换整份 profile 的指令。不要改变与用户目标无关的设置。

### 所有标题使用同一个 emoji

```yaml
recipe:
  prefix: '💬 '
```

前缀和后缀是确定性字面文本，不展开 `{{变量}}`。emoji 后留一个空格即可；标题仍受 UTF-8 字节预算约束。

### 按主题选择一个 emoji

将 `recipe.prefix` 留空，在现有 `recipe.systemPrompt` 后追加以下要求；不需要把 `preset` 改成 `custom`：

```text
每个标题必须以一个贴合会话主题的 emoji 开头，随后是一个空格和简洁的中文标题。
标题开头只能有一个 emoji，不要在正文中重复添加。
如果当前标题缺少 emoji，即使主题未变，也必须补齐此格式。
只输出最终标题，不要引号、解释或 Markdown。
```

不要同时让模型生成 emoji 又设固定 emoji 前缀，以免重复。修改格式只影响下一次生成，不会自动重建全部旧标题；是否批量处理及是否覆盖固定标题，应另外询问用户。

### 更省请求的自动刷新

```yaml
policy:
  enableIdle: false
  everyNTurns: 6
  intervalMs: 0
  maxRefreshesPerSessionPerDay: 4
  enableDrift: true
  driftThreshold: 0.7
  driftForceAfterMessages: 10
```

如果用户只想手动刷新，将 `enableIdle: false`、`everyNTurns: 0`、`intervalMs: 0` 三项同时设置；新会话首条消息的初始标题生成仍然存在。

### 单独指定标题模型

```yaml
recipe:
  provider: '<当前 DSH 中已配置的 provider id>'
  model: '<该 provider 下的 model id>'
```

先读取当前模型目录，或请用户在设置页下拉选择；不要猜测一个不存在的模型 id，也不要写入 API key。标题请求不修改主会话模型，失败时不会自动回退到主会话模型。恢复跟随会话时，`provider` 与 `model` 一起清空。

<a id="troubleshooting"></a>

## AI 排查清单

| 现象 | 检查与处理 |
|---|---|
| 改了 prompt，但旧标题没变 | 保存设置不会主动重建全部历史；先手动刷新一个会话验证，批量处理前再确认范围。 |
| 刷新被跳过 | `/title` 看来源、处理水位、`Policy`、`Drift`、`Last auto`；检查固定标题、无新消息、最小间隔、日预算、漂移阈值和文本长度。 |
| 长对话出现 4096 字节相关错误 | 当前版本会按首条意图和最近内容抽样、Unicode 安全缩短；若是自定义模板固定文本本身过长，应缩短模板或让用户明确提高预算，不应反复重试制造请求。 |
| 重新生成时报 `side request payload` 百万 token 超限 | 支持公开排除接口的 Host 上，Title Studio 会让 `purpose: session-title` 跳过 DeepSeek 可选的 `dsh_session_log` 日志上传字段；否则即使标题摘要很短，附件也可能带上数 MB 历史。升级并重新加载 Title Studio 与 DSH，不要靠提高标题输入预算或关闭压缩绕过。正常聊天的日志上传不受影响。 |
| 设置页改值无效或报错 | 检查 `recipe` / `policy` 是否嵌套正确、类型/数值范围是否有效、是否有更高优先级覆盖。验证未通过时运行逻辑可能保留最后一份有效配置。 |
| 自定义模板生成失败 | 模板变量仅限本文列表；自定义模板与 system prompt 合起来至少要引用 `{{messages}}`、`{{transcript}}` 或 `{{firstMessage}}` 中一个，不能只给固定文本或消息计数。 |
| 指定模型失败 | provider/model 必须成对；查模型是否可用、凭据是否由 DSH 配好。不要把凭据放进本插件配置。 |
| 批量成功但侧栏还是旧标题 | 点击「同步已保存标题到侧栏」，不要先重新发一批模型请求。 |
| 全部历史重建有跳过项 | 空会话、子会话和固定标题默认跳过；其他进程持有写锁时跳过；损坏或格式不兼容的记录应报告，不能强行解锁或重写。 |

### 校验来源与兼容性

- [默认值与可用枚举](../lib/constants.js)
- [可编辑 Config schema](../lib/schema.js)
- [类型、数值范围和跨字段校验](../lib/config-core.js)
- [输入预算与模板抽样](../lib/input-budget.js)
- [刷新判断](../lib/policy-core.js)
- [全历史存储适配与边界](../lib/history.js)
- [列表缓存与同步通知](../lib/title-publication.js)

这些路径也随插件包发布；AI 在实际操作时仍需核对安装版本和用户当前配置。本文是配置参考，不是修改权限或跳过用户确认的授权。
