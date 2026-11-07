/**
 * Session Title Studio — browser settings page.
 *
 * Registers the same React page in two surfaces:
 *   - Settings → 会话标题工坊 (settings.section)
 *   - Plugins → 会话标题工坊 → 设置 (plugins.bundle.config)
 *
 * Written as a plain Client artifact: React comes from the browser module
 * table, controls are local, and every color uses a host theme token.
 */

window.__ModuleLoader__.load({
  id: '@idealclover/dsh-session-title-studio',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'session-title-studio'
    const PKG = '@idealclover/dsh-session-title-studio'
    const STUDIO_ENTRY = 'session-title-studio'

    const PRESETS = ['concise', 'action', 'topic-tags', 'conventional', 'custom']
    const LANGUAGES = ['auto', 'zh', 'en', 'bilingual']
    const STABILITY = ['strict', 'balanced', 'follow']

    const zh = {
      'menu.label': '重新生成标题',
      'menu.running': '正在使用标题模型重新生成，请稍候…',
      'menu.success': '标题已更新：{title}',
      'menu.failed': '重新生成标题失败，请重试。',
      'menu.cancelled': '标题重新生成已取消。',
      'menu.confirmTitle': '替换手动固定的标题？',
      'menu.confirmBody': '这条会话的标题由你手动设置。继续会使用标题模型替换并解除固定，预计产生一次标题请求。',
      'menu.confirm': '确认重新生成',
      'menu.back': '取消',
      'menu.close': '关闭',
      'menu.skip.no-input': '这条会话还没有可用于生成标题的用户文本。',
      'menu.skip.subagent': '当前设置不包含子会话标题。',
      'menu.skip.owned-elsewhere': '这条会话正由其他进程写入，请稍后重试。',
      'menu.skip.in-flight': '这条会话已经有标题请求正在运行，请稍后重试。',
      'menu.skip.no-longer-live': '会话状态已变化，请重试。',
      'menu.skip.disposed': '标题插件正在重新加载，请稍后重试。',
      'page.nav': '会话标题工坊',
      'page.title': '会话标题工坊',
      'page.desc': '配置标题的生成方式、刷新时机与话题漂移判断。修改会立即写入当前 profile。',
      'recipe.title': '生成配方',
      'recipe.desc': '决定标题长什么样：提示词、语言、长度和确定性前后缀。',
      'recipe.style': '风格与长度',
      'recipe.prompt': '提示词',
      'recipe.budget': '预算与模型',
      'policy.title': '刷新策略',
      'policy.desc': '决定标题何时重新生成。自动刷新仍受固定标题、最小间隔和每日预算保护。',
      'policy.triggers': '触发时机',
      'policy.guards': '护栏',
      'drift.title': '话题漂移',
      'drift.desc': '用本地 n-gram 比较最近消息与当前标题的依据；相似度足够高时跳过自动刷新，不额外调用模型。',
      'drift.budget': '判定与强制',
      'field.preset': '预设风格',
      'field.systemPrompt': '系统提示词',
      'field.userTemplate': '用户消息模板',
      'field.language': '标题语言',
      'field.targetWords': '目标词数',
      'field.targetCjkCharacters': '目标汉字数',
      'field.prefix': '固定前缀',
      'field.suffix': '固定后缀',
      'field.stability': '稳定性',
      'field.maxTitleBytes': '标题字节上限',
      'field.maxInputBytes': '输入字节上限',
      'field.maxOutputTokens': '输出 token 上限',
      'field.timeoutMs': '请求超时',
      'field.provider': '模型 provider',
      'field.titleModel': '标题模型',
      'field.model': '模型 id',
      'field.enableIdle': '空闲后刷新',
      'field.idleDebounceMs': '空闲判定',
      'field.everyNTurns': '每 N 条消息',
      'field.intervalMs': '定时扫描',
      'field.activeWindowMs': '活跃窗口',
      'field.minIntervalMs': '最小刷新间隔',
      'field.maxRefreshesPerSessionPerDay': '每日刷新预算',
      'field.maxSessionsPerSweep': '单次扫描上限',
      'field.maxSessionsPerBatch': '批量重建上限',
      'field.includeSubagents': '包含子会话',
      'field.respectPinned': '保护手动标题',
      'field.refreshTimeoutMs': '刷新超时',
      'field.enableDrift': '启用漂移检测',
      'field.driftThreshold': '漂移阈值',
      'field.driftMinNewMessages': '最少新消息',
      'field.driftForceAfterMessages': '强制刷新阈值',
      'field.driftWindowMessages': '比较窗口',
      'field.driftMinChars': '最少文本长度',
      'hint.preset': 'concise 最接近默认；custom 完全使用自定义提示词。',
      'hint.systemPrompt': '追加到预设提示词；custom 时作为完整提示词。支持 {{变量}}。',
      'hint.userTemplate': '留空使用 JSON 封装。支持 {{messages}}、{{transcript}}、{{currentTitle}} 等。',
      'hint.language': 'auto 跟随消息语言；bilingual 输出“中文 / English”。',
      'hint.targetWords': '非 CJK 标题的目标词数。',
      'hint.targetCjkCharacters': 'CJK 标题的目标字数。',
      'hint.prefix': '直接拼在模型标题前，例如 “[dsh] ”。',
      'hint.suffix': '直接拼在模型标题后，例如 “ · 2026-10-18”。',
      'hint.stability': 'strict 尽量不改；balanced 主题变了才改；follow 跟随最新。',
      'hint.maxTitleBytes': 'base 服务默认上限是 80 字节，超出会被截断。',
      'hint.maxInputBytes': '标题输入预算；长对话会保留首条意图和最近内容，并安全缩短单条文本。',
      'hint.maxOutputTokens': '辅助请求的输出上限，不是标题长度。',
      'hint.timeoutMs': '辅助标题请求的端到端超时。',
      'hint.provider': '留空则跟随会话当前路由；与 model 必须成对配置。',
      'hint.titleModel': '只影响标题辅助请求，不改变会话模型；留空跟随当前会话路由。',
      'hint.model': '留空则跟随会话当前路由；与 provider 必须成对配置。',
      'hint.enableIdle': '一轮结束后安静一段时间再尝试刷新。',
      'hint.idleDebounceMs': '毫秒；默认 180000（3 分钟），最小 5000。',
      'hint.everyNTurns': '每 N 条新用户消息尝试一次；0 关闭。',
      'hint.intervalMs': '毫秒；0 关闭，开启时最小 30000。',
      'hint.activeWindowMs': '只扫描这段时间内有活动的会话。',
      'hint.minIntervalMs': '同一会话两次自动刷新之间的最小间隔。',
      'hint.maxRefreshesPerSessionPerDay': '每个会话每个本地自然日的自动刷新次数上限。',
      'hint.maxSessionsPerSweep': '一次定时扫描最多处理几个会话。',
      'hint.maxSessionsPerBatch': '仅限制“已加载会话”范围；“全部对话”会串行处理预览中的全部目标。',
      'hint.includeSubagents': '默认跳过子智能体会话。',
      'hint.respectPinned': '手动 rename 过的标题默认不会被自动刷新覆盖。',
      'hint.refreshTimeoutMs': '调用方为单次刷新设置的整体超时。',
      'hint.enableDrift': '只有漂移分数达到阈值才自动刷新。',
      'hint.driftThreshold': '0–1；越高越保守，默认 0.6。',
      'hint.driftMinNewMessages': '少于这个数量的新消息不做漂移判断。',
      'hint.driftForceAfterMessages': '新消息达到这个数量时跳过漂移判断，直接刷新。',
      'hint.driftWindowMessages': '参与比较的最近消息条数。',
      'hint.driftMinChars': '最近文本短于这个长度时不做漂移判断。',
      'preset.concise': '简洁短语',
      'preset.action': '动作导向',
      'preset.topic-tags': '主题标签',
      'preset.conventional': 'Conventional Commits',
      'preset.custom': '自定义',
      'language.auto': '跟随消息',
      'language.zh': '简体中文',
      'language.en': 'English',
      'language.bilingual': '中英双语',
      'stability.strict': '严格保留',
      'stability.balanced': '平衡',
      'stability.follow': '跟随最新',
      'on': '开',
      'off': '关',
      'loading': '正在读取配置…',
      'unavailable': '当前部署没有暴露这个插件的配置。',
      'readOnly': '配置当前只读，无法在此修改。',
      'saveFailed': '写入失败',
      'reset': '恢复默认',
      'seconds': '秒',
      'ms': '毫秒',
      'messages': '条消息',
      'chars': '字符',
      'maintenance.title': '维护',
      'maintenance.desc': '批量重建已有标题',
      'maintenance.body': '先选择已加载或全部历史范围，预览请求数量和目标清单，再确认重建。无需输入命令。',
      'maintenance.scopeLabel': '重建范围',
      'maintenance.scopeLive': '仅当前已加载会话',
      'maintenance.scopeAll': '全部对话（包含未加载历史）',
      'maintenance.scopeAllDetail': '范围：全部可读取的已存储对话及已加载会话。不会唤醒主智能体。',
      'maintenance.allWarning': '全部范围会扫描历史记录，并串行处理所有符合条件的会话，不受“已加载批量上限”限制。会增加标题模型请求，请先查看预览。',
      'maintenance.scanSummary': '已排除空会话 {empty} 个、子会话 {children} 个、不可读记录 {errors} 个。',
      'maintenance.loaded': '已加载',
      'maintenance.history': '历史会话',
      'maintenance.preview': '批量重建标题…',
      'maintenance.synchronize': '同步已保存标题到侧栏',
      'maintenance.syncHint': '只读取已保存标题并更新列表缓存，不重新生成，不调用模型。',
      'maintenance.syncResult': '已推送 {count} 个标题到侧栏 · 跳过 {skipped} · 失败 {failed} · 模型请求 0 次',
      'maintenance.previewing': '正在预览…',
      'maintenance.includePinned': '同时重建手动固定的标题',
      'maintenance.previewTitle': '确认重建范围',
      'maintenance.scope': '范围：当前已加载的会话；不会自动打开历史会话。',
      'maintenance.counts': '已加载 {live} 个 · 已存储 {stored} 个 · 跳过固定标题 {pinned} 个 · 本次重建 {count} 个',
      'maintenance.cost': '预计最多 {count} 次标题模型请求；预览本身不调用模型。',
      'maintenance.omitted': '另有 {count} 个会话超出本次数量上限。',
      'maintenance.forceWarning': '本次会覆盖手动固定的标题，请确认这是你的意图。',
      'maintenance.confirm': '确认重建',
      'maintenance.dismiss': '返回',
      'maintenance.cancel': '停止重建',
      'maintenance.cancelling': '正在停止…',
      'maintenance.progress': '标题重建进度',
      'maintenance.current': '正在处理：',
      'maintenance.results': '成功 {ok} · 跳过 {skipped} · 失败 {failed}',
      'maintenance.state.running': '正在重建标题',
      'maintenance.state.cancelling': '正在停止重建，已完成的标题会保留',
      'maintenance.state.cancelled': '已停止，已完成的标题已保留',
      'maintenance.state.completed': '重建完成',
      'maintenance.state.failed': '重建失败',
      'maintenance.item.succeeded': '成功',
      'maintenance.item.skipped': '跳过',
      'maintenance.item.failed': '失败',
      'maintenance.item.cancelled': '已取消',
      'model.follow': '跟随当前会话模型',
      'model.loading': '正在读取模型列表…',
      'model.error': '无法读取模型列表，使用下方 provider/model 手动填写。',
      'model.empty': '当前没有可用模型，使用下方 provider/model 手动填写。',
    }

    const en = {
      'menu.label': 'Regenerate title',
      'menu.running': 'Regenerating with the title model. Please wait…',
      'menu.success': 'Title updated: {title}',
      'menu.failed': 'Could not regenerate the title. Please try again.',
      'menu.cancelled': 'Title regeneration was cancelled.',
      'menu.confirmTitle': 'Replace the manually pinned title?',
      'menu.confirmBody': 'You named this conversation manually. Continuing replaces and unpins its title, using approximately one title-model request.',
      'menu.confirm': 'Confirm regeneration',
      'menu.back': 'Cancel',
      'menu.close': 'Close',
      'menu.skip.no-input': 'This conversation has no eligible user text to title yet.',
      'menu.skip.subagent': 'Subagent titles are excluded by the current settings.',
      'menu.skip.owned-elsewhere': 'Another process is writing this conversation. Try again later.',
      'menu.skip.in-flight': 'A title request is already running for this conversation.',
      'menu.skip.no-longer-live': 'The conversation state changed. Please try again.',
      'menu.skip.disposed': 'Title Studio is reloading. Please try again.',
      'page.nav': 'Title Studio',
      'page.title': 'Title Studio',
      'page.desc': 'Configure how titles are generated, when they refresh, and how topic drift is judged. Changes are written to the current profile immediately.',
      'recipe.title': 'Recipe',
      'recipe.desc': 'What a title looks like: prompt, language, length, and deterministic decoration.',
      'recipe.style': 'Style and length',
      'recipe.prompt': 'Prompts',
      'recipe.budget': 'Budget and model',
      'policy.title': 'Refresh policy',
      'policy.desc': 'When a title is regenerated. Automatic refreshes still respect pinned titles, minimum spacing, and the daily budget.',
      'policy.triggers': 'Triggers',
      'policy.guards': 'Guards',
      'drift.title': 'Topic drift',
      'drift.desc': 'Compares recent messages with the basis of the current title using local n-grams. Similar topics skip the automatic refresh without a model call.',
      'drift.budget': 'Judgement and force',
      'field.preset': 'Preset',
      'field.systemPrompt': 'System prompt',
      'field.userTemplate': 'User message template',
      'field.language': 'Title language',
      'field.targetWords': 'Target words',
      'field.targetCjkCharacters': 'Target CJK characters',
      'field.prefix': 'Prefix',
      'field.suffix': 'Suffix',
      'field.stability': 'Stability',
      'field.maxTitleBytes': 'Title byte limit',
      'field.maxInputBytes': 'Input byte limit',
      'field.maxOutputTokens': 'Output token limit',
      'field.timeoutMs': 'Request timeout',
      'field.provider': 'Model provider',
      'field.titleModel': 'Title model',
      'field.model': 'Model id',
      'field.enableIdle': 'Refresh after idle',
      'field.idleDebounceMs': 'Idle delay',
      'field.everyNTurns': 'Every N messages',
      'field.intervalMs': 'Interval sweep',
      'field.activeWindowMs': 'Active window',
      'field.minIntervalMs': 'Minimum spacing',
      'field.maxRefreshesPerSessionPerDay': 'Daily budget',
      'field.maxSessionsPerSweep': 'Sessions per sweep',
      'field.maxSessionsPerBatch': 'Batch rebuild cap',
      'field.includeSubagents': 'Include subagents',
      'field.respectPinned': 'Protect manual titles',
      'field.refreshTimeoutMs': 'Refresh timeout',
      'field.enableDrift': 'Enable drift detection',
      'field.driftThreshold': 'Drift threshold',
      'field.driftMinNewMessages': 'Minimum new messages',
      'field.driftForceAfterMessages': 'Force after',
      'field.driftWindowMessages': 'Comparison window',
      'field.driftMinChars': 'Minimum text length',
      'hint.preset': 'concise is closest to the default; custom uses your prompt verbatim.',
      'hint.systemPrompt': 'Appended to the preset prompt, or the whole prompt for custom. Supports {{variables}}.',
      'hint.userTemplate': 'Empty uses JSON framing. Supports {{messages}}, {{transcript}}, {{currentTitle}}, and more.',
      'hint.language': 'auto follows the messages; bilingual returns “Chinese / English”.',
      'hint.targetWords': 'Target words for non-CJK titles.',
      'hint.targetCjkCharacters': 'Target CJK characters.',
      'hint.prefix': 'Concatenated before the model title, e.g. “[dsh] ”.',
      'hint.suffix': 'Concatenated after the model title, e.g. “ · 2026-10-18”.',
      'hint.stability': 'strict preserves; balanced changes on a new topic; follow prefers the latest.',
      'hint.maxTitleBytes': 'The base service caps titles at 80 bytes by default.',
      'hint.maxInputBytes': 'Input budget; long conversations retain first intent and recent content, with Unicode-safe clipping.',
      'hint.maxOutputTokens': 'Output ceiling for the auxiliary request, not a title length.',
      'hint.timeoutMs': 'End-to-end deadline for the auxiliary request.',
      'hint.provider': 'Empty follows the session route; pair with model.',
      'hint.titleModel': 'Affects only the auxiliary title request; the session model stays unchanged. Empty follows the session route.',
      'hint.model': 'Empty follows the session route; pair with provider.',
      'hint.enableIdle': 'Refresh once the conversation goes quiet after a turn.',
      'hint.idleDebounceMs': 'Milliseconds; default 180000, minimum 5000.',
      'hint.everyNTurns': 'Try once per N new human messages; 0 disables.',
      'hint.intervalMs': 'Milliseconds; 0 disables, minimum 30000 when enabled.',
      'hint.activeWindowMs': 'Only sweep sessions active within this window.',
      'hint.minIntervalMs': 'Minimum spacing between automatic refreshes of one session.',
      'hint.maxRefreshesPerSessionPerDay': 'Automatic refreshes per session per local day.',
      'hint.maxSessionsPerSweep': 'Maximum sessions handled by one interval sweep.',
      'hint.maxSessionsPerBatch': 'Caps loaded-session scope only; all-history processes every previewed target sequentially.',
      'hint.includeSubagents': 'Subagent sessions are skipped by default.',
      'hint.respectPinned': 'A manually renamed title is never overwritten automatically.',
      'hint.refreshTimeoutMs': 'Caller-side deadline for one refresh.',
      'hint.enableDrift': 'Only refresh when the drift score reaches the threshold.',
      'hint.driftThreshold': '0–1; higher is more conservative, default 0.6.',
      'hint.driftMinNewMessages': 'Fewer new messages skip the drift judgement.',
      'hint.driftForceAfterMessages': 'This many new messages bypass the drift judgement.',
      'hint.driftWindowMessages': 'Recent messages considered by the comparison.',
      'hint.driftMinChars': 'Shorter recent text skips the drift judgement.',
      'preset.concise': 'Concise',
      'preset.action': 'Action',
      'preset.topic-tags': 'Topic tags',
      'preset.conventional': 'Conventional Commits',
      'preset.custom': 'Custom',
      'language.auto': 'Follow messages',
      'language.zh': 'Simplified Chinese',
      'language.en': 'English',
      'language.bilingual': 'Bilingual',
      'stability.strict': 'Strict',
      'stability.balanced': 'Balanced',
      'stability.follow': 'Follow latest',
      'on': 'On',
      'off': 'Off',
      'loading': 'Reading configuration…',
      'unavailable': 'This deployment does not expose this plugin\'s configuration.',
      'readOnly': 'Configuration is read-only here.',
      'saveFailed': 'Write failed',
      'reset': 'Reset',
      'seconds': 'seconds',
      'ms': 'ms',
      'messages': 'messages',
      'chars': 'characters',
      'maintenance.title': 'Maintenance',
      'maintenance.desc': 'Rebuild existing titles',
      'maintenance.body': 'Choose loaded sessions or all history, preview the request count and target list, then confirm. No chat command is required.',
      'maintenance.scopeLabel': 'Rebuild scope',
      'maintenance.scopeLive': 'Loaded sessions only',
      'maintenance.scopeAll': 'All conversations (including unloaded history)',
      'maintenance.scopeAllDetail': 'Scope: all readable persisted conversations plus loaded sessions. Main agents will not be resumed.',
      'maintenance.allWarning': 'All-history scans records and processes every eligible conversation sequentially, not only the first 10. This uses additional title-model requests; review the preview first.',
      'maintenance.scanSummary': 'Excluded: {empty} empty, {children} subagent and {errors} unreadable records.',
      'maintenance.loaded': 'Loaded',
      'maintenance.history': 'Historical',
      'maintenance.preview': 'Rebuild titles…',
      'maintenance.synchronize': 'Sync saved titles to sidebar',
      'maintenance.syncHint': 'Reads saved titles and refreshes list checkpoints; no generation or model calls.',
      'maintenance.syncResult': 'Pushed {count} titles · {skipped} skipped · {failed} failed · 0 model requests',
      'maintenance.previewing': 'Loading preview…',
      'maintenance.includePinned': 'Also rebuild manually pinned titles',
      'maintenance.previewTitle': 'Confirm rebuild scope',
      'maintenance.scope': 'Scope: currently loaded sessions. Historical sessions will not be opened.',
      'maintenance.counts': '{live} loaded · {stored} stored · {pinned} pinned titles skipped · {count} selected',
      'maintenance.cost': 'At most {count} title-model requests. Preview makes no model calls.',
      'maintenance.omitted': '{count} additional sessions exceed this batch cap.',
      'maintenance.forceWarning': 'This will replace manually pinned titles. Confirm that this is intended.',
      'maintenance.confirm': 'Confirm rebuild',
      'maintenance.dismiss': 'Back',
      'maintenance.cancel': 'Stop rebuild',
      'maintenance.cancelling': 'Stopping…',
      'maintenance.progress': 'Title rebuild progress',
      'maintenance.current': 'Processing:',
      'maintenance.results': '{ok} succeeded · {skipped} skipped · {failed} failed',
      'maintenance.state.running': 'Rebuilding titles',
      'maintenance.state.cancelling': 'Stopping; completed titles will be kept',
      'maintenance.state.cancelled': 'Stopped; completed titles were kept',
      'maintenance.state.completed': 'Rebuild completed',
      'maintenance.state.failed': 'Rebuild failed',
      'maintenance.item.succeeded': 'Succeeded',
      'maintenance.item.skipped': 'Skipped',
      'maintenance.item.failed': 'Failed',
      'maintenance.item.cancelled': 'Cancelled',
      'model.follow': 'Follow session model',
      'model.loading': 'Loading models…',
      'model.error': 'Could not load the model list; edit provider/model below.',
      'model.empty': 'No models available; edit provider/model below.',
    }

    const CSS = `
.sts-page { display:flex; flex-direction:column; gap:16px; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }
.sts-head { display:flex; flex-direction:column; gap:4px; }
.sts-title { margin:0; font-size:16px; font-weight:600; }
.sts-desc { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px; }
.sts-notice { margin:0; padding:8px 10px; border-radius:6px; font-size:12px; background:var(--dsw-alias-bg-layer-3); }
.sts-notice.is-error { color:var(--dsw-alias-state-error-primary); }
.sts-notice.is-muted { color:var(--dsw-alias-label-tertiary); }
.sts-card { display:flex; flex-direction:column; gap:10px; padding:14px 16px; border:.5px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-2); }
.sts-card-title { margin:0; font-size:14px; font-weight:600; }
.sts-card-desc { margin:0 0 2px; color:var(--dsw-alias-label-tertiary); font-size:12px; }
.sts-subtitle { margin:10px 0 0; color:var(--dsw-alias-label-secondary); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; }
.sts-row { display:grid; grid-template-columns:220px minmax(0,1fr); gap:12px; align-items:start; }
.sts-label { display:flex; flex-direction:column; gap:2px; padding-top:5px; min-width:0; }
.sts-label-text { color:var(--dsw-alias-label-primary); }
.sts-hint { color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:1.4; }
.sts-control { display:flex; flex-direction:column; gap:4px; min-width:0; }
.sts-input { box-sizing:border-box; width:100%; padding:6px 8px; border:.5px solid var(--dsw-alias-border-l2); border-radius:6px; background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); font:inherit; outline:none; }
.sts-input:focus { border-color:var(--dsw-alias-brand-primary); }
.sts-input:disabled { opacity:.55; cursor:not-allowed; }
.sts-textarea { min-height:78px; resize:vertical; }
.sts-mono { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; }
.sts-number { width:150px; }
.sts-inline { display:flex; align-items:center; gap:8px; }
.sts-unit { color:var(--dsw-alias-label-tertiary); font-size:11px; }
.sts-switch { position:relative; flex:none; width:36px; height:20px; padding:0; border:none; border-radius:999px; background:var(--dsw-alias-fill-l2); cursor:pointer; }
.sts-switch.is-on { background:var(--dsw-alias-button-primary-fill); }
.sts-switch:disabled { opacity:.55; cursor:not-allowed; }
.sts-knob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s ease; }
.sts-switch.is-on .sts-knob { transform:translateX(16px); }
.sts-reset { align-self:flex-start; padding:0; border:none; background:none; color:var(--dsw-alias-link); font-size:11px; cursor:pointer; }
.sts-reset:hover { text-decoration:underline; }
.sts-state { color:var(--dsw-alias-label-tertiary); font-size:11px; }
.sts-status { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px; }
.sts-button { padding:7px 12px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); font:inherit; cursor:pointer; align-self:flex-start; }
.sts-button:hover { background:var(--dsw-alias-interactive-bg-hover); }
.sts-button.is-primary { background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground); border-color:var(--dsw-alias-button-primary-fill); }
.sts-button:disabled { opacity:.5; cursor:not-allowed; }
.sts-button:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.sts-batch-panel { border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.sts-batch-panel p { margin:0; font-size:12px; }
.sts-batch-list { max-height:180px; overflow:auto; padding-left:20px; margin:0; font-size:12px; overflow-wrap:anywhere; }
.sts-progress { width:100%; accent-color:var(--dsw-alias-brand-primary); }
.sts-menu-backdrop { position:fixed; inset:0; z-index:1000; pointer-events:auto; display:flex; align-items:center; justify-content:center; padding:20px; background:var(--dsw-alias-bg-mask-1); }
.sts-menu-dialog { width:min(440px,100%); max-height:80vh; overflow:auto; padding:22px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.6; outline:none; overflow-wrap:anywhere; }
.sts-menu-dialog h3 { margin:0 0 8px; font-size:16px; }
.sts-menu-dialog .sts-inline { justify-content:flex-end; margin-top:18px; }
@media (max-width:720px) {
  .sts-row { grid-template-columns:1fr; gap:4px; }
  .sts-label { padding-top:0; }
}
`

    const EMPTY_SNAPSHOT = {
      status: 'unavailable',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
    }

    const hasOwn = (object, key) =>
      object !== null &&
      typeof object === 'object' &&
      Object.prototype.hasOwnProperty.call(object, key)

    function useLocaleTick(ctx) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const off = ctx.locale.subscribe(() => setTick((value) => value + 1))
        return typeof off === 'function' ? off : undefined
      }, [ctx])
    }

    function useForm(ctx, entryId) {
      const form = React.useMemo(() => {
        try {
          return ctx.configForms.get(entryId)
        } catch {
          return null
        }
      }, [ctx, entryId])
      const subscribe = React.useCallback(
        (listener) => (form === null ? () => {} : form.subscribe(listener)),
        [form],
      )
      const read = React.useCallback(
        () => (form === null ? EMPTY_SNAPSHOT : form.getSnapshot()),
        [form],
      )
      const snapshot = React.useSyncExternalStore(subscribe, read, read)
      return { form, snapshot }
    }

    function useDraft(value, commit) {
      const text = value === undefined || value === null ? '' : String(value)
      const [draft, setDraft] = React.useState(text)
      const focused = React.useRef(false)
      const timer = React.useRef(null)
      const current = React.useRef(text)

      React.useEffect(() => {
        current.current = text
        if (!focused.current) setDraft(text)
      }, [text])

      React.useEffect(
        () => () => {
          if (timer.current !== null) clearTimeout(timer.current)
        },
        [],
      )

      const flush = (next) => {
        if (next === current.current) return
        commit(next)
      }

      return {
        value: draft,
        onFocus: () => {
          focused.current = true
        },
        onChange: (event) => {
          const next = event.target.value
          setDraft(next)
          if (timer.current !== null) clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            timer.current = null
            flush(next)
          }, 600)
        },
        onBlur: (event) => {
          focused.current = false
          if (timer.current !== null) {
            clearTimeout(timer.current)
            timer.current = null
          }
          flush(event.target.value)
        },
      }
    }

    function Row(props) {
      return h(
        'div',
        { className: 'sts-row' },
        h(
          'div',
          { className: 'sts-label' },
          h('span', { className: 'sts-label-text' }, props.label),
          props.hint === undefined ? null : h('span', { className: 'sts-hint' }, props.hint),
        ),
        h(
          'div',
          { className: 'sts-control' },
          props.children,
          props.overridden
            ? h(
                'button',
                { type: 'button', className: 'sts-reset', onClick: props.onReset },
                props.resetLabel,
              )
            : null,
        ),
      )
    }

    function TextField(props) {
      const { form, snapshot, section, field, write, reset, t } = props
      const path = [section, field]
      const draft = useDraft(snapshot.value?.[section]?.[field], (text) =>
        write(form, path, text),
      )
      const common = {
        className:
          'sts-input' +
          (props.multiline ? ' sts-textarea' : '') +
          (props.mono ? ' sts-mono' : ''),
        value: draft.value,
        placeholder: props.placeholder,
        disabled: !snapshot.writable,
        spellCheck: false,
        onFocus: draft.onFocus,
        onChange: draft.onChange,
        onBlur: draft.onBlur,
      }
      return h(
        Row,
        {
          label: props.label,
          hint: props.hint,
          overridden: hasOwn(snapshot.user?.[section], field),
          onReset: () => reset(form, path),
          resetLabel: t('reset'),
        },
        props.multiline
          ? h('textarea', { ...common, rows: 4 })
          : h('input', { ...common, type: 'text' }),
      )
    }

    function NumberField(props) {
      const { form, snapshot, section, field, write, reset, t } = props
      const path = [section, field]
      const raw = snapshot.value?.[section]?.[field]
      const value =
        typeof raw === 'number' && typeof props.step === 'number' && props.step < 1
          ? Number(raw.toFixed(2))
          : raw
      const draft = useDraft(value, (text) => {
        const next = Number(text)
        if (Number.isFinite(next)) write(form, path, next)
      })
      return h(
        Row,
        {
          label: props.label,
          hint: props.hint,
          overridden: hasOwn(snapshot.user?.[section], field),
          onReset: () => reset(form, path),
          resetLabel: t('reset'),
        },
        h(
          'div',
          { className: 'sts-inline' },
          h('input', {
            className: 'sts-input sts-number',
            type: 'number',
            value: draft.value,
            min: props.min,
            max: props.max,
            step: props.step,
            disabled: !snapshot.writable,
            onFocus: draft.onFocus,
            onChange: draft.onChange,
            onBlur: draft.onBlur,
          }),
          props.unit === undefined ? null : h('span', { className: 'sts-unit' }, props.unit),
        ),
      )
    }

    function SelectField(props) {
      const { form, snapshot, section, field, write, reset, t } = props
      const path = [section, field]
      const value = snapshot.value?.[section]?.[field] ?? props.options[0]?.value
      return h(
        Row,
        {
          label: props.label,
          hint: props.hint,
          overridden: hasOwn(snapshot.user?.[section], field),
          onReset: () => reset(form, path),
          resetLabel: t('reset'),
        },
        h(
          'select',
          {
            className: 'sts-input',
            value,
            disabled: !snapshot.writable,
            onChange: (event) => write(form, path, event.target.value),
          },
          props.options.map((option) =>
            h('option', { key: option.value, value: option.value }, option.label),
          ),
        ),
      )
    }

    function ToggleField(props) {
      const { form, snapshot, section, field, write, reset, t } = props
      const path = [section, field]
      const checked = snapshot.value?.[section]?.[field] === true
      return h(
        Row,
        {
          label: props.label,
          hint: props.hint,
          overridden: hasOwn(snapshot.user?.[section], field),
          onReset: () => reset(form, path),
          resetLabel: t('reset'),
        },
        h(
          'div',
          { className: 'sts-inline' },
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': checked,
              'aria-label': props.label,
              className: 'sts-switch' + (checked ? ' is-on' : ''),
              disabled: !snapshot.writable,
              onClick: () => write(form, path, !checked),
            },
            h('span', { className: 'sts-knob' }),
          ),
          h('span', { className: 'sts-state' }, t(checked ? 'on' : 'off')),
        ),
      )
    }

    /** Load the global model catalog once for the title model picker. */
    function useModelCatalog(ctx) {
      const [state, setState] = React.useState({
        status: 'loading',
        groups: [],
        error: null,
      })
      React.useEffect(() => {
        let alive = true
        const remote = ctx.remote
        if (remote?.session?.modelCatalog === undefined) {
          setState({ status: 'error', groups: [], error: 'model catalog unavailable' })
          return undefined
        }
        remote.session
          .modelCatalog()
          .then((response) => {
            if (!alive) return
            if (!response?.ok) {
              throw new Error(response?.error?.message ?? 'model catalog failed')
            }
            setState({ status: 'ready', groups: response.value?.groups ?? [], error: null })
          })
          .catch((error) => {
            if (!alive) return
            setState({
              status: 'error',
              groups: [],
              error: error instanceof Error ? error.message : String(error),
            })
          })
        return () => {
          alive = false
        }
      }, [ctx])
      return state
    }

    /** Pick the auxiliary title route without touching the session's model. */
    function ModelField(props) {
      const { form, snapshot, ctx, t, notify } = props
      const catalog = useModelCatalog(ctx)
      const provider = snapshot.value?.recipe?.provider ?? ''
      const model = snapshot.value?.recipe?.model ?? ''
      const current =
        provider.length > 0 && model.length > 0 ? JSON.stringify([provider, model]) : ''
      const known = catalog.groups.some(
        (group) =>
          group.id === provider && group.models.some((candidate) => candidate.id === model),
      )

      const writeOps = async (ops) => {
        try {
          if (typeof form.mutate !== 'function') {
            notify?.(`${t('saveFailed')} · ${t('field.titleModel')}`)
            return
          }
          const ok = await form.mutate(ops)
          if (!ok) notify?.(`${t('saveFailed')} · ${t('field.titleModel')}`)
        } catch (error) {
          notify?.(
            `${t('saveFailed')} · ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      const resetRoute = () =>
        writeOps([
          { op: 'unset', path: ['recipe', 'provider'] },
          { op: 'unset', path: ['recipe', 'model'] },
        ])

      const commit = (value) => {
        if (value === '') return resetRoute()
        if (value === 'custom') return undefined
        let pair
        try {
          pair = JSON.parse(value)
        } catch {
          return undefined
        }
        if (!Array.isArray(pair) || pair.length !== 2) return undefined
        return writeOps([
          { op: 'set', path: ['recipe', 'provider'], value: String(pair[0]) },
          { op: 'set', path: ['recipe', 'model'], value: String(pair[1]) },
        ])
      }

      if (catalog.status !== 'ready' || catalog.groups.length === 0) {
        return h(
          React.Fragment,
          null,
          h(TextField, {
            ...props,
            section: 'recipe',
            field: 'provider',
            label: t('field.provider'),
            hint: t('hint.provider'),
            placeholder: 'deepseek-account',
          }),
          h(TextField, {
            ...props,
            section: 'recipe',
            field: 'model',
            label: t('field.model'),
            hint: t('hint.model'),
            placeholder: 'deepseek-flash',
          }),
          h(
            'p',
            { className: 'sts-hint' },
            catalog.status === 'loading'
              ? t('model.loading')
              : catalog.status === 'ready'
                ? t('model.empty')
                : t('model.error'),
          ),
        )
      }

      const selectValue = current.length > 0 && !known ? 'custom' : current
      return h(
        Row,
        {
          label: t('field.titleModel'),
          hint: t('hint.titleModel'),
          overridden: current.length > 0,
          onReset: resetRoute,
          resetLabel: t('reset'),
        },
        h(
          'select',
          {
            className: 'sts-input',
            value: selectValue,
            disabled: !snapshot.writable,
            onChange: (event) => void commit(event.target.value),
          },
          h('option', { value: '' }, t('model.follow')),
          selectValue === 'custom'
            ? h('option', { value: 'custom' }, `${provider} / ${model}`)
            : null,
          catalog.groups.map((group) =>
            h(
              'optgroup',
              { key: group.id, label: group.name },
              group.models.map((candidate) =>
                h(
                  'option',
                  {
                    key: `${group.id}/${candidate.id}`,
                    value: JSON.stringify([group.id, candidate.id]),
                  },
                  candidate.name,
                ),
              ),
            ),
          ),
        ),
      )
    }

    function Card(props) {
      return h(
        'section',
        { className: 'sts-card' },
        h('h4', { className: 'sts-card-title' }, props.title),
        props.desc === undefined ? null : h('p', { className: 'sts-card-desc' }, props.desc),
        props.children,
      )
    }

    function SubTitle(props) {
      return h('h5', { className: 'sts-subtitle' }, props.children)
    }

    function StatusLine(props) {
      return h('p', { className: 'sts-status' }, props.children)
    }

    function optionsOf(t, prefix, values) {
      return values.map((value) => ({ value, label: t(prefix + value) }))
    }

    function RecipeCard(props) {
      const { form, snapshot, section, write, reset, t, ctx, notify } = props
      if (snapshot.status === 'loading') {
        return h(Card, { title: t('recipe.title') }, h(StatusLine, null, t('loading')))
      }
      if (snapshot.status === 'unavailable' || snapshot.value === undefined) {
        return h(Card, { title: t('recipe.title') }, h(StatusLine, null, t('unavailable')))
      }
      const base = { form, snapshot, section, write, reset, t, ctx, notify }
      return h(
        Card,
        { title: t('recipe.title'), desc: t('recipe.desc') },
        h(SubTitle, null, t('recipe.style')),
        h(SelectField, {
          ...base,
          field: 'preset',
          label: t('field.preset'),
          hint: t('hint.preset'),
          options: optionsOf(t, 'preset.', PRESETS),
        }),
        h(SelectField, {
          ...base,
          field: 'language',
          label: t('field.language'),
          hint: t('hint.language'),
          options: optionsOf(t, 'language.', LANGUAGES),
        }),
        h(SelectField, {
          ...base,
          field: 'stability',
          label: t('field.stability'),
          hint: t('hint.stability'),
          options: optionsOf(t, 'stability.', STABILITY),
        }),
        h(NumberField, {
          ...base,
          field: 'targetWords',
          label: t('field.targetWords'),
          hint: t('hint.targetWords'),
          min: 1,
          max: 50,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'targetCjkCharacters',
          label: t('field.targetCjkCharacters'),
          hint: t('hint.targetCjkCharacters'),
          min: 1,
          max: 100,
          step: 1,
          unit: t('chars'),
        }),
        h(TextField, {
          ...base,
          field: 'prefix',
          label: t('field.prefix'),
          hint: t('hint.prefix'),
        }),
        h(TextField, {
          ...base,
          field: 'suffix',
          label: t('field.suffix'),
          hint: t('hint.suffix'),
        }),
        h(SubTitle, null, t('recipe.prompt')),
        h(TextField, {
          ...base,
          field: 'systemPrompt',
          label: t('field.systemPrompt'),
          hint: t('hint.systemPrompt'),
          multiline: true,
          mono: true,
        }),
        h(TextField, {
          ...base,
          field: 'userTemplate',
          label: t('field.userTemplate'),
          hint: t('hint.userTemplate'),
          multiline: true,
          mono: true,
        }),
        h(SubTitle, null, t('recipe.budget')),
        h(NumberField, {
          ...base,
          field: 'maxTitleBytes',
          label: t('field.maxTitleBytes'),
          hint: t('hint.maxTitleBytes'),
          min: 8,
          max: 4096,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'maxInputBytes',
          label: t('field.maxInputBytes'),
          hint: t('hint.maxInputBytes'),
          min: 64,
          max: 1000000,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'maxOutputTokens',
          label: t('field.maxOutputTokens'),
          hint: t('hint.maxOutputTokens'),
          min: 8,
          max: 32768,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'timeoutMs',
          label: t('field.timeoutMs'),
          hint: t('hint.timeoutMs'),
          min: 1000,
          max: 600000,
          step: 1000,
          unit: t('ms'),
        }),
        h(ModelField, { ...base }),
      )
    }

    function PolicyCard(props) {
      const { form, snapshot, section, write, reset, t } = props
      if (snapshot.status === 'loading') {
        return h(Card, { title: t('policy.title') }, h(StatusLine, null, t('loading')))
      }
      if (snapshot.status === 'unavailable' || snapshot.value === undefined) {
        return h(Card, { title: t('policy.title') }, h(StatusLine, null, t('unavailable')))
      }
      const base = { form, snapshot, section, write, reset, t }
      return h(
        Card,
        { title: t('policy.title'), desc: t('policy.desc') },
        h(SubTitle, null, t('policy.triggers')),
        h(ToggleField, {
          ...base,
          field: 'enableIdle',
          label: t('field.enableIdle'),
          hint: t('hint.enableIdle'),
        }),
        h(NumberField, {
          ...base,
          field: 'idleDebounceMs',
          label: t('field.idleDebounceMs'),
          hint: t('hint.idleDebounceMs'),
          min: 5000,
          max: 3600000,
          step: 1000,
          unit: t('ms'),
        }),
        h(NumberField, {
          ...base,
          field: 'everyNTurns',
          label: t('field.everyNTurns'),
          hint: t('hint.everyNTurns'),
          min: 0,
          max: 100,
          step: 1,
          unit: t('messages'),
        }),
        h(NumberField, {
          ...base,
          field: 'intervalMs',
          label: t('field.intervalMs'),
          hint: t('hint.intervalMs'),
          min: 0,
          max: 86400000,
          step: 1000,
          unit: t('ms'),
        }),
        h(SubTitle, null, t('policy.guards')),
        h(NumberField, {
          ...base,
          field: 'activeWindowMs',
          label: t('field.activeWindowMs'),
          hint: t('hint.activeWindowMs'),
          min: 60000,
          max: 86400000,
          step: 1000,
          unit: t('ms'),
        }),
        h(NumberField, {
          ...base,
          field: 'minIntervalMs',
          label: t('field.minIntervalMs'),
          hint: t('hint.minIntervalMs'),
          min: 0,
          max: 3600000,
          step: 1000,
          unit: t('ms'),
        }),
        h(NumberField, {
          ...base,
          field: 'maxRefreshesPerSessionPerDay',
          label: t('field.maxRefreshesPerSessionPerDay'),
          hint: t('hint.maxRefreshesPerSessionPerDay'),
          min: 1,
          max: 1000,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'maxSessionsPerSweep',
          label: t('field.maxSessionsPerSweep'),
          hint: t('hint.maxSessionsPerSweep'),
          min: 1,
          max: 100,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'maxSessionsPerBatch',
          label: t('field.maxSessionsPerBatch'),
          hint: t('hint.maxSessionsPerBatch'),
          min: 1,
          max: 100,
          step: 1,
        }),
        h(NumberField, {
          ...base,
          field: 'refreshTimeoutMs',
          label: t('field.refreshTimeoutMs'),
          hint: t('hint.refreshTimeoutMs'),
          min: 5000,
          max: 600000,
          step: 1000,
          unit: t('ms'),
        }),
        h(ToggleField, {
          ...base,
          field: 'includeSubagents',
          label: t('field.includeSubagents'),
          hint: t('hint.includeSubagents'),
        }),
        h(ToggleField, {
          ...base,
          field: 'respectPinned',
          label: t('field.respectPinned'),
          hint: t('hint.respectPinned'),
        }),
      )
    }

    function DriftCard(props) {
      const { form, snapshot, section, write, reset, t } = props
      if (snapshot.status === 'loading') {
        return h(Card, { title: t('drift.title') }, h(StatusLine, null, t('loading')))
      }
      if (snapshot.status === 'unavailable' || snapshot.value === undefined) {
        return h(Card, { title: t('drift.title') }, h(StatusLine, null, t('unavailable')))
      }
      const base = { form, snapshot, section, write, reset, t }
      return h(
        Card,
        { title: t('drift.title'), desc: t('drift.desc') },
        h(ToggleField, {
          ...base,
          field: 'enableDrift',
          label: t('field.enableDrift'),
          hint: t('hint.enableDrift'),
        }),
        h(NumberField, {
          ...base,
          field: 'driftThreshold',
          label: t('field.driftThreshold'),
          hint: t('hint.driftThreshold'),
          min: 0,
          max: 1,
          step: 0.01,
        }),
        h(SubTitle, null, t('drift.budget')),
        h(NumberField, {
          ...base,
          field: 'driftMinNewMessages',
          label: t('field.driftMinNewMessages'),
          hint: t('hint.driftMinNewMessages'),
          min: 1,
          max: 20,
          step: 1,
          unit: t('messages'),
        }),
        h(NumberField, {
          ...base,
          field: 'driftForceAfterMessages',
          label: t('field.driftForceAfterMessages'),
          hint: t('hint.driftForceAfterMessages'),
          min: 2,
          max: 100,
          step: 1,
          unit: t('messages'),
        }),
        h(NumberField, {
          ...base,
          field: 'driftWindowMessages',
          label: t('field.driftWindowMessages'),
          hint: t('hint.driftWindowMessages'),
          min: 2,
          max: 50,
          step: 1,
          unit: t('messages'),
        }),
        h(NumberField, {
          ...base,
          field: 'driftMinChars',
          label: t('field.driftMinChars'),
          hint: t('hint.driftMinChars'),
          min: 0,
          max: 2000,
          step: 1,
          unit: t('chars'),
        }),
      )
    }

    // No active conversation is needed; the Connection's authenticated owner-only
    // Fetch endpoints call the same controller as /title rebuild all.
    async function rebuildCall(method, input = {}, signal) {
      const route = 'api/session-title-studio/' + method
      const transport = globalThis.__DSH_TRANSPORT__
      const response = await (transport?.fetch
        ? transport.fetch.bind(transport)
        : globalThis.fetch.bind(globalThis))(transport?.fetch ? route : new URL(route, document.baseURI), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`)
      }
      return result.value
    }

    function MaintenanceCard({ t, writable }) {
      const [plan, setPlan] = React.useState(null)
      const [job, setJob] = React.useState(null)
      const [force, setForce] = React.useState(false)
      const [scope, setScope] = React.useState('live')
      const [syncResult, setSyncResult] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const mounted = React.useRef(true)
      const active = job?.state === 'running' || job?.state === 'cancelling'
      // Reopening Settings recovers an existing task. Polls read progress only:
      // none of these requests call the model or start a second batch.
      React.useEffect(() => {
        mounted.current = true
        const controller = new AbortController()
        let timer
        const read = async () => {
          try {
            const next = await rebuildCall('status', {}, controller.signal)
            if (!mounted.current || controller.signal.aborted) return
            setJob(next)
            if (next.state === 'running' || next.state === 'cancelling') {
              timer = setTimeout(read, 750)
            }
          } catch (failure) {
            if (!controller.signal.aborted) setError(failure.message)
          }
        }
        void read()
        return () => {
          mounted.current = false
          controller.abort()
          clearTimeout(timer)
        }
      }, [job?.id])

      const act = async (method, input, accept) => {
        setBusy(true)
        setError('')
        try {
          const next = await rebuildCall(method, input)
          if (mounted.current) accept(next)
        } catch (failure) {
          if (mounted.current) setError(failure.message)
        } finally {
          if (mounted.current) setBusy(false)
        }
      }
      const disabled = busy || active || !writable
      const button = (label, onClick, primary = false, off = disabled) => h('button', {
        type: 'button', className: 'sts-button' + (primary ? ' is-primary' : ''),
        disabled: off, onClick,
      }, label)

      return h(
        Card,
        { title: t('maintenance.title'), desc: t('maintenance.desc') },
        h('p', { className: 'sts-card-desc' }, t('maintenance.body')),
        h('label', { className: 'sts-control' }, t('maintenance.scopeLabel'),
          h('select', { className: 'sts-input', value: scope, disabled,
            onChange: (event) => { setScope(event.target.value); setPlan(null) } },
            h('option', { value: 'live' }, t('maintenance.scopeLive')),
            h('option', { value: 'all' }, t('maintenance.scopeAll')))),
        scope === 'all' ? h('p', { className: 'sts-notice' }, t('maintenance.allWarning')) : null,
        h('label', { className: 'sts-inline' },
          h('input', {
            type: 'checkbox', checked: force, disabled,
            onChange: (event) => { setForce(event.target.checked); setPlan(null) },
          }), t('maintenance.includePinned')),
        button(t(busy && !plan ? 'maintenance.previewing' : 'maintenance.preview'),
          () => act('preview', { force, scope }, (next) => { setPlan(next); setJob(null) })),
        button(t('maintenance.synchronize'), () => act('synchronize', {}, setSyncResult)),
        h('p', { className: 'sts-hint' }, t('maintenance.syncHint')),
        syncResult ? h('p', { className: 'sts-notice', role: 'status' }, t('maintenance.syncResult', {
          count: String(syncResult.synchronized), skipped: String(syncResult.skipped), failed: String(syncResult.failures.length),
        })) : null,
        error ? h('p', { className: 'sts-notice is-error', role: 'alert' }, error) : null,
        plan ? h('div', { className: 'sts-batch-panel', 'aria-label': t('maintenance.previewTitle') },
          h('strong', null, t('maintenance.previewTitle')),
          h('p', null, t(plan.scope === 'all' ? 'maintenance.scopeAllDetail' : 'maintenance.scope')),
          plan.scope === 'all' ? h('p', null, t('maintenance.scanSummary', {
            empty: String(plan.empty), children: String(plan.children), errors: String(plan.unreadable?.length ?? 0),
          })) : null,
          plan.unreadable?.length ? h('ul', { className: 'sts-batch-list' },
            plan.unreadable.map((item) => h('li', { key: item.id }, `${item.id} · ${item.message}`))) : null,
          h('p', null, t('maintenance.counts', {
            live: String(plan.live), stored: plan.stored === null ? '—' : String(plan.stored),
            pinned: String(plan.pinnedSkipped), count: String(plan.estimatedRequests),
          })),
          h('p', null, t('maintenance.cost', { count: String(plan.estimatedRequests) })),
          plan.omitted > 0 ? h('p', null, t('maintenance.omitted', { count: String(plan.omitted) })) : null,
          plan.force ? h('p', { className: 'sts-notice is-error' }, t('maintenance.forceWarning')) : null,
          h('ul', { className: 'sts-batch-list' }, plan.targets.map((target) =>
            h('li', { key: target.id }, target.title + ' · ' + t(target.live ? 'maintenance.loaded' : 'maintenance.history')))),
          h('div', { className: 'sts-inline' },
            button(t('maintenance.confirm'), () => act('start', { previewId: plan.id },
              (next) => { setJob(next); setPlan(null) }), true,
              disabled || plan.estimatedRequests === 0),
            button(t('maintenance.dismiss'), () => setPlan(null))),
        ) : null,
        job && job.state !== 'idle' ? h('div', { className: 'sts-batch-panel', role: 'status', 'aria-live': 'polite' },
          h('strong', null, t('maintenance.state.' + job.state)),
          h('progress', { className: 'sts-progress', value: job.completed, max: Math.max(1, job.total),
            'aria-label': t('maintenance.progress') }),
          h('p', null, `${job.completed} / ${job.total} · ` + t('maintenance.results', {
            ok: String(job.succeeded), skipped: String(job.skipped), failed: String(job.failed),
          })),
          job.current ? h('p', null, t('maintenance.current') + ' ' + job.current.title) : null,
          job.error ? h('p', { className: 'sts-notice is-error' }, job.error) : null,
          h('ul', { className: 'sts-batch-list' }, job.items.map((item) => h('li', { key: item.id },
            `${item.title} · ${t('maintenance.item.' + item.state)}` +
              (item.newTitle ? ` → ${item.newTitle}` : '') + (item.message ? ` · ${item.message}` : '')))),
          active ? button(t(job.state === 'cancelling' ? 'maintenance.cancelling' : 'maintenance.cancel'),
            () => act('cancel', { jobId: job.id }, setJob), false,
            busy || job.state === 'cancelling' || !writable) : null,
        ) : null,
      )
    }

    function SettingsPage(props) {
      const runtime = props.runtime
      const { ctx, t } = runtime
      useLocaleTick(ctx)
      const studio = useForm(ctx, STUDIO_ENTRY)
      const snapshot = studio.snapshot
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        if (notice === null) return undefined
        const timer = setTimeout(() => setNotice(null), 4000)
        return () => clearTimeout(timer)
      }, [notice])

      if (props.view === 'summary') return null

      const write = async (form, path, value) => {
        if (form === null) return
        try {
          const ok = await form.mutate([{ op: 'set', path, value }])
          if (!ok) setNotice({ kind: 'error', text: t('saveFailed') + ' · ' + path.join('.') })
        } catch (error) {
          setNotice({
            kind: 'error',
            text: t('saveFailed') + ' · ' + (error instanceof Error ? error.message : String(error)),
          })
        }
      }

      const reset = async (form, path) => {
        if (form === null) return
        try {
          const ok = await form.mutate([{ op: 'unset', path }])
          if (!ok) setNotice({ kind: 'error', text: t('saveFailed') + ' · ' + path.join('.') })
        } catch (error) {
          setNotice({
            kind: 'error',
            text: t('saveFailed') + ' · ' + (error instanceof Error ? error.message : String(error)),
          })
        }
      }

      const readOnly = snapshot.status === 'ready' && snapshot.writable === false

      return h(
        'div',
        { className: 'sts-page' },
        h('style', { key: 'sts-style' }, CSS),
        h(
          'div',
          { className: 'sts-head' },
          h('h3', { className: 'sts-title' }, t('page.title')),
          h('p', { className: 'sts-desc' }, t('page.desc')),
        ),
        readOnly ? h('p', { className: 'sts-notice is-muted' }, t('readOnly')) : null,
        notice === null
          ? null
          : h(
              'p',
              { className: 'sts-notice is-error', role: 'status' },
              notice.text,
            ),
        h(RecipeCard, {
          form: studio.form,
          snapshot,
          section: 'recipe',
          write,
          reset,
          t,
          ctx,
          notify: (text) => setNotice({ kind: 'error', text }),
        }),
        h(PolicyCard, {
          form: studio.form,
          snapshot,
          section: 'policy',
          write,
          reset,
          t,
        }),
        h(DriftCard, {
          form: studio.form,
          snapshot,
          section: 'policy',
          write,
          reset,
          t,
        }),
        h(MaintenanceCard, { t, writable: snapshot.status === 'ready' && snapshot.writable }),
      )
    }

    // Local SVG keeps the menu icon theme-aware without cross-plugin imports.
    function RegenerateTitleIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false, style: { flexShrink: 0 } },
      h('path', { d: 'M20 7v5h-5M4 17v-5h5' }),
      h('path', { d: 'M6.1 7a7 7 0 0 1 11.55-1L20 9M4 15l2.35 3A7 7 0 0 0 17.9 17' }))
    }

    /** Shared UI controller: menu dismissal must not cancel title work or hide errors. */
    function createSessionMenuController({ call, t, notify = () => {} }) {
      let state = Object.freeze({ sessionId: null, title: '', phase: 'idle', message: '' })
      const listeners = new Set()
      let aborted
      let disposed = false
      const set = (patch) => {
        if (disposed) return
        state = Object.freeze({ ...state, ...patch })
        for (const listener of listeners) listener()
      }
      const busy = () => state.phase === 'running' || state.phase === 'confirm'
      const execute = async (force) => {
        aborted = new AbortController()
        set({ phase: 'running', message: '' })
        try {
          const result = await call('regenerate', { sessionId: state.sessionId, force }, aborted.signal)
          if (disposed) return
          if (result.ok) {
            const message = t('menu.success', { title: result.title })
            set({ phase: 'success', message: result.warnings?.length
              ? message + '\n' + result.warnings.join('\n') : message })
            notify(message, true)
          } else if (result.skip === 'pinned') {
            set({ phase: 'confirm', title: result.title ?? state.title })
          } else {
            const key = result.skip ? 'menu.skip.' + result.skip : result.cancelled ? 'menu.cancelled' : null
            const message = result.error ?? (key ? t(key) : t('menu.failed'))
            set({ phase: 'error', message })
            notify(message, false)
          }
        } catch (error) {
          if (disposed) return
          const message = error instanceof Error ? error.message : String(error)
          set({ phase: 'error', message })
          notify(message, false)
        }
      }
      return {
        getSnapshot: () => state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        busy,
        request(sessionId, title) {
          if (disposed || busy()) return Promise.resolve()
          set({ sessionId, title, phase: 'running', message: '' })
          return execute(false)
        },
        confirm() { return state.phase === 'confirm' ? execute(true) : Promise.resolve() },
        dismiss() { if (state.phase !== 'running') set({ phase: 'idle', message: '' }) },
        dispose() { disposed = true; aborted?.abort(); listeners.clear() },
      }
    }

    function SessionMenuFeedback({ controller, t }) {
      const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
      const panel = React.useRef(null)
      React.useEffect(() => {
        if (state.phase === 'idle') return undefined
        const previous = document.activeElement
        panel.current?.focus()
        return () => { if (previous?.isConnected) previous.focus?.() }
      }, [state.phase])
      if (state.phase === 'idle') return null
      const confirming = state.phase === 'confirm'
      const running = state.phase === 'running'
      const dismiss = () => { if (!running) controller.dismiss() }
      const onKeyDown = (event) => {
        if (event.key === 'Escape' && !running) { event.preventDefault(); dismiss() }
        if (event.key !== 'Tab') return
        const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')]
        const first = buttons[0]; const last = buttons.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
          event.preventDefault(); first.focus()
        }
      }
      return h('div', { className: 'sts-menu-backdrop', onClick: (event) => {
        if (event.target === event.currentTarget) dismiss()
      } },
        h('style', null, CSS),
        h('section', { className: 'sts-menu-dialog', role: 'dialog', 'aria-modal': true,
          'aria-labelledby': 'sts-menu-dialog-title', ref: panel, tabIndex: -1, onKeyDown },
          h('h3', { id: 'sts-menu-dialog-title' }, t(confirming ? 'menu.confirmTitle' : 'menu.label')),
          h('p', { className: 'sts-hint' }, state.title),
          h('p', { role: state.phase === 'error' ? 'alert' : 'status', style: { whiteSpace: 'pre-wrap' } },
            confirming ? t('menu.confirmBody') : running ? t('menu.running') : state.message),
          h('div', { className: 'sts-inline' },
            confirming ? h('button', { type: 'button', className: 'sts-button is-primary',
              onClick: () => void controller.confirm() }, t('menu.confirm')) : null,
            !running ? h('button', { type: 'button', className: 'sts-button', onClick: dismiss },
              t(confirming ? 'menu.back' : 'menu.close')) : null)))
    }

    function apply(ctx) {
      ctx.effect(function* () {
        yield ctx.locale.register(NS, { zh, en })
        const t = ctx.locale.bind(NS)
        const runtime = { ctx, t }
        let nativeMenus = null
        const menuController = createSessionMenuController({ call: rebuildCall, t,
          notify: (text, success) => nativeMenus?.notify(text, success) })
        yield () => menuController.dispose()
        yield ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'session-title-studio-regenerate',
          inject: () => ({ controller: menuController, t }),
        }, SessionMenuFeedback))
        yield ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
          name: 'contextMenu.icon', key: 'session-title-studio.regenerate',
        }, RegenerateTitleIcon))
        // Prefer the current structured menu API. Optional injection also makes
        // the native/legacy choice reactive when this service loads or unloads.
        ctx.inject(['contextMenus'], (scope) => {
          const menus = scope.contextMenus
          scope.effect(() => {
            nativeMenus = menus
            return () => { if (nativeMenus === menus) nativeMenus = null }
          })
          scope.effect(() => menus.register({
            id: 'session-title-studio.regenerate', target: 'session', order: 400,
            observe: () => [ctx.locale, menuController],
            resolve: ({ sessionId, displayTitle }) => [{
              id: 'regenerate-title', label: t('menu.label'),
              icon: { key: 'session-title-studio.regenerate' },
              disabled: menuController.busy(), failureLabel: t('menu.failed'),
              run: () => menuController.request(sessionId, displayTitle),
            }],
          }))
        })
        // Compatibility with older DSH versions which expose only this slot.
        // It renders nothing once the structured menu service is present.
        yield ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item', id: 'session-title-studio-regenerate', order: 400,
        }, ({ sessionId, displayTitle, useMenuOpenState }) => {
          const [, setMenuOpen] = useMenuOpenState()
          if (nativeMenus) return null
          return h('button', { type: 'button', role: 'menuitem',
            style: { display: 'flex', alignItems: 'center', gap: 8 },
            disabled: menuController.busy(), onClick: () => {
              setMenuOpen(false)
              void menuController.request(sessionId, displayTitle)
            } }, h(RegenerateTitleIcon), t('menu.label'))
        }))
        yield ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.bundle.config',
              key: PKG,
              locale: NS,
              inject: () => ({ runtime }),
            },
            SettingsPage,
          ),
        )
        yield ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'session-title-studio',
              order: 60,
              label: () => t('page.nav'),
              locale: NS,
              inject: () => ({ runtime }),
            },
            SettingsPage,
          ),
        )
      })
    }

    return {
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.session'],
      createSessionMenuController,
      apply,
    }
  },
})
