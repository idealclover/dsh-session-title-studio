# Detailed configuration reference for AI assistants

English | [简体中文](./configuration.zh.md) · [Back to README](../README.en.md)

The README covers installation and everyday entry points. This reference contains the detailed settings. Before changing configuration, writing YAML, explaining request budgets, or running a batch rebuild for a user, an AI assistant should read the relevant sections here rather than infer field names or defaults from the README.

## Read by task

| User goal | Read first |
|---|---|
| Change title style, language, length, or prompts | [Config layout](#config-layout), [Recipe](#recipe), [Variables](#variables), [Common recipes](#recipes) |
| Select a separate title model | [Title model](#title-model) |
| Change refresh frequency or reduce requests | [Policy](#policy), [Drift](#drift), [Request cost](#request-cost) |
| Rebuild current or historical titles | [Commands](#commands), [Batch rebuild](#batch-rebuild) |
| Titles were rebuilt but the sidebar is stale | [Sidebar synchronization](#sidebar-sync) |
| Diagnose oversized input, missing updates, or invalid settings | [Troubleshooting](#troubleshooting), [Boundaries](#safety) |

## Before an AI changes settings

1. **Read the actual configuration first.** The only component id is `session-title-studio`; the configuration root contains only `recipe` and `policy`. Do not flatten fields or register a second title provider.
2. **Prefer the settings UI.** Every field is volatile. When YAML is necessary, a Cordis `config` override replaces the entire object rather than deep-merging it. Preserve both existing sections and unrelated settings; never overwrite a user's configuration with an example blindly.
3. **Check route and template semantics.** Set or clear `recipe.provider` and `recipe.model` together. `preset: custom` requires a nonempty `systemPrompt`; language, length, and stability instructions must then be included in that prompt explicitly.
4. **Do not silently widen scope or replace pinned titles.** A request to change formatting is not authorization to rebuild all history. Show scope, count, and expected model requests before a batch; obtain explicit confirmation before including manually pinned titles.
5. **Examples are not defaults.** [constants.js](../lib/constants.js) defines defaults; [schema.js](../lib/schema.js) and [config-core.js](../lib/config-core.js) define types and limits. Check the installed version rather than treating this reference as a permanent API guarantee.

---

<a id="config-layout"></a>

## One component

The settings page writes current-profile overrides. Volatile fields are read again on their next use, without a restart for each edit. Per-field **Reset** clears the user override and inherits bundle or schema defaults. If an upgraded Client page remains stale, reactivate the bundle and refresh the page; restart if the Host requests it.

The bundle mounts **one component**: `session-title-studio`.

The recipe (generation) and policy (refresh) remain separate modules internally, composed by one entry, with nested config:

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

One switch, one label, one config namespace in the plugin page — no second row with a raw subpath.

Upgrading from the 0.4.x two-row layout: the bundle patch disables the old `session-title-studio-recipe` / `session-title-studio-policy` rows; old profile overrides no longer apply and should be set again on the settings page. Back up any customized configuration before upgrading.

---

<a id="recipe"></a>

## Recipe

| Field | Default | Meaning |
|---|---|---|
| `preset` | `concise` | `concise`, `action`, `topic-tags`, `conventional`, `custom` |
| `systemPrompt` | `""` | Extra instructions appended to the preset; the whole prompt for `custom` |
| `userTemplate` | `""` | Custom user message; empty uses JSON framing |
| `language` | `auto` | `auto`, `zh`, `en`, `bilingual` |
| `targetWords` | `5` | Target words for non-CJK titles |
| `targetCjkCharacters` | `10` | Target CJK characters |
| `prefix` / `suffix` | `""` | Deterministic decoration around the model title |
| `stability` | `balanced` | `strict`, `balanced`, `follow` |
| `maxTitleBytes` | `80` | UTF-8 budget for the composed title |
| `maxInputBytes` | `4096` | Rendered user-input budget |
| `maxOutputTokens` | `1024` | Auxiliary request output ceiling |
| `timeoutMs` | `60000` | Auxiliary request deadline |
| `provider` / `model` | `""` | Optional independent route; must be set together |

<a id="title-model"></a>

### Title model

The settings page's **Title model** is a real picker over the current DSH global model catalog, grouped by provider. The chosen route affects **only the auxiliary title request**; the session's own model stays unchanged. Empty means "follow the session model".

Selection writes `provider` and `model` atomically, so there is no half-configured intermediate state. The raw fields remain available in YAML:

```yaml
provider: deepseek-account
model: deepseek-v4-pro
```

The title request always uses the route's **lowest reasoning effort** to control cost; a failed request keeps the previous title.

<a id="variables"></a>

### Variables

`systemPrompt` and `userTemplate` accept `{{messages}}`, `{{transcript}}`, `{{currentTitle}}`, `{{firstMessage}}`, `{{workspace}}`, `{{date}}`, and `{{messageCount}}`. Unknown variables are rejected by configuration validation. `{{messages}}`, `{{transcript}}`, and `{{firstMessage}}` use the same budget-selected text; `{{messageCount}}` is the selected sample count, not the total historical message count.

<a id="examples"></a>

### Example

```yaml
- id: session-title-studio
  config:
    recipe:
      preset: action
      language: zh
      targetCjkCharacters: 12
      prefix: '[demo] '
      stability: balanced
```

Custom prompt:

```yaml
- id: session-title-studio
  config:
    recipe:
      preset: custom
      language: zh
      systemPrompt: |
        Title this Chinese development session in 6-12 Han characters.
        Start with a verb, output one line, no quotes, no trailing period.
        If currentTitle is still accurate, return it unchanged.
```

---

<a id="policy"></a>

## Policy

| Field | Default | Meaning |
|---|---|---|
| `enableIdle` | `true` | Refresh after the conversation goes quiet |
| `idleDebounceMs` | `180000` | Quiet period before the idle trigger |
| `everyNTurns` | `4` | Refresh every N new human messages; `0` disables |
| `intervalMs` | `0` | Sweep active sessions; `0` disables, minimum 30 s |
| `activeWindowMs` | `1800000` | Only sweep sessions active within this window |
| `minIntervalMs` | `120000` | Minimum spacing between automatic refreshes |
| `maxRefreshesPerSessionPerDay` | `12` | Automatic daily budget per session |
| `maxSessionsPerSweep` | `5` | Sessions refreshed per sweep |
| `maxSessionsPerBatch` | `10` | Live sessions handled by one batch rebuild |
| `includeSubagents` | `false` | Also title subagent sessions |
| `respectPinned` | `true` | Never overwrite a manually renamed title |
| `refreshTimeoutMs` | `90000` | Caller-side deadline per refresh |
| `enableDrift` | `true` | Enable local topic-drift detection |
| `driftThreshold` | `0.6` | Minimum drift score for an automatic refresh (0–1, higher is conservative) |
| `driftMinNewMessages` | `1` | Fewer new messages skip the drift judgement |
| `driftForceAfterMessages` | `6` | This many new messages bypass the drift judgement |
| `driftWindowMessages` | `12` | Recent messages considered by the comparison |
| `driftMinChars` | `24` | Shorter recent text skips the drift judgement |

<a id="drift"></a>

### Topic drift

Drift detection is local and makes **no model call**:

1. A successful refresh stores the covered user messages as the title basis.
2. The next automatic trigger compares each newer user message with that basis.
3. Code blocks, URLs, and conversational filler are removed; Latin words and CJK character bigrams form token sets.
4. Similarity is `0.7 × containment + 0.3 × Jaccard`, and drift is `1 - similarity`.
5. The **maximum** per-message score is used, so an older same-topic message cannot dilute a later topic change.
6. A refresh runs when the score reaches `driftThreshold`; `driftForceAfterMessages` bypasses only the drift judgement; trigger timing, minimum spacing, the daily cap, and pin protection still apply.

This is lexical, not semantic: paraphrase or cross-language continuity can look like drift, and code-heavy messages can be over-scored. Tune the threshold and force count on the settings page.

### Guards

A refresh runs only when the session is live, is not a subagent (by default), is not pinned (unless forced), has new input since the last title, passes the every-N threshold, passes the drift judgement (unless forced by message count), is outside the minimum interval, is under the daily budget, and has no refresh already in flight.

Manual refreshes bypass staleness, interval, and budget, but still respect a pinned title unless `force` is used.

---

<a id="commands"></a>

## Commands

| Command | Effect |
|---|---|
| `/title` | Show title, source, update time, coverage |
| `/title refresh` | Refresh now, respecting a pinned title |
| `/title refresh force` | Refresh even when pinned |
| `/title rebuild` | Rebuild the current session title |
| `/title rebuild all` | **Preview** live sessions that would be rebuilt; no model call |
| `/title rebuild all confirm` | Run the batch rebuild |
| `/title rebuild all confirm force` | Include pinned titles |
| `/title rename <text>` | Set and pin a title |

Pick `title` from the slash menu first, then type the subcommand. Typing a full `/title refresh` line as a normal message sends it to the model instead of the command registry.

`/title` also prints the current `Policy` (idle/everyN/min) and `Last auto`: the most recent automatic decision as `idle-scheduled`, `idle-fired`, `skip (no-drift)`, `refreshed`, or `error`. Check that line first when a refresh did not happen.

<a id="batch-rebuild"></a>

### Batch rebuild

**Use the settings button; no conversation or command is required:**

1. Open **Plugins → Session Title Studio → Maintenance** (or Settings → Title Studio).
2. Choose **Loaded sessions only** or **All conversations (including unloaded history)**, then click **Rebuild titles…** to preview targets, exclusions and expected requests.
3. Pins are protected unless **Also rebuild manually pinned titles** is explicitly checked; a warning explains the overwrite.
4. **Confirm rebuild** starts the batch, showing progress and per-session results. **Stop rebuild** cancels remaining work; completed titles stay. Closing Settings does not cancel the job, and reopening restores its progress.

Preview makes **no model call** and expires after five minutes. Confirmation runs only the previewed targets; sessions opened later are not silently added. Titles pinned after preview are checked again. Only one batch runs at a time, and duplicate confirmation is idempotent.

Slash commands remain shortcuts using the same controller. Batches are sequential. The loaded-session scope is capped by `maxSessionsPerBatch` (default 10); all-history handles the full confirmed eligible corpus, not only the first ten. Expect at most one auxiliary title generation per target, excluding provider-level retries.

```text
/title rebuild all                  # preview
/title rebuild all confirm          # run
/title rebuild all confirm force    # include pinned
```

**All-history mode** scans through read handles, then acquires exclusive write ownership for one cold conversation at a time. It appends known title/audit events, flushes and closes ownership, without creating or waking a main Agent. Empty/subagent/pinned records are excluded by default; unreadable records are listed in preview, and records owned by another process are skipped rather than force-unlocked. “All” means discoverable/readable persistence entries, not physical records with corrupt headers that the backend cannot discover. The command shortcut keeps its loaded-session scope; use Settings for all history.

Cold requests use the configured title model or the conversation's last recorded route; missing both is an explicit error. Cold titles use a conservative 80-byte cap. Request audit is persisted during operation cleanup, not guaranteed durable before network dispatch or process crash.

<a id="sidebar-sync"></a>

### Sidebar synchronization

Since 0.7.1 a durable cold title checkpoints `sessionProjectionCache` while holding write ownership, then sends an `api-session/added` upsert with an exact committed log watermark after closing the writer. This updates both unopened list rows and already-read sequenced projections without opening their conversations. The original last-user-message time is retained, so bulk titles do not reorder all history as new activity. Derived cache or notification errors are warnings, not failures of an already saved model result.

To repair titles saved by earlier versions, click **Maintenance → Sync saved titles to sidebar**. This reads stored logs, refreshes derived checkpoints and pushes exact titles: **no model request, no Agent activation and no session-log write**. The reported count is notifications pushed; the official cold projection path writes derived cache fail-soft in the background.

---

<a id="request-cost"></a>

## Request cost

Drift detection is local and makes **no request**. Model calls come only from title generation itself:

- one automatic call after the first message of a new session;
- automatic refresh candidates from idle / every-N / interval must pass new input, pin protection, the 2-minute minimum interval, the daily budget, and the drift judgement (or reach 6 new messages and force);
- at most `maxRefreshesPerSessionPerDay` (default **12**) automatic refreshes per session per day;
- interval sweeps are off by default; when enabled they handle at most 5 active sessions per sweep;
- no new messages, a pinned title, a subagent session, or insufficient drift means **zero requests**;
- input is capped at 4096 bytes and output at 1024 tokens; a title is usually short.

A typical session therefore costs one initial call plus a few drift-passing refreshes, not one call per message; the daily cap bounds the worst case. Batch rebuild scales with session count, so it requires a preview and a confirmation button (or `confirm` for the command shortcut), loaded-session batches are capped by `maxSessionsPerBatch`, while all-history confirms the full corpus count.

For a lower budget, disable idle refresh, lower the daily cap to 4, raise the drift threshold to 0.7, or raise the force threshold.

---

<a id="safety"></a>

## Boundaries

- Manual titles are protected by default.
- Failed generation keeps the previous title.
- Cold-history rebuilding uses the tested DSH 0.2 persistence API and exclusive ownership, never force-overwriting corrupt, incompatible or currently-owned records.
- The daily budget is in-memory and resets on restart; the minimum interval is recovered from the title's `updatedAt`.
- The base service caps titles at 80 UTF-8 bytes by default.
- Long conversations retain first intent and recent messages with Unicode-safe head/tail clipping and exact rendered-byte budgeting. Fixed custom scaffolding that alone exceeds the budget is an explicit configuration error. Exact sampled source seqs and a separate coverage watermark prevent repeated automatic refreshes.
- Only one provider can be registered; this bundle is mutually exclusive with the official all-prompts bundle.
- The settings page needs the settings service; without it, edit `cordis.patch.yml` directly. Fields remain volatile either way.
- Drift is lexical: paraphrase or cross-language continuity may be misread; raise `driftThreshold` or `driftForceAfterMessages` for calmer behaviour.

---

<a id="recipes"></a>

## Common recipes for AI assistants

These are field fragments to merge into the existing `config`, not instructions to replace a profile. Preserve settings unrelated to the user's request.

### The same emoji on every title

```yaml
recipe:
  prefix: '💬 '
```

Prefix and suffix are deterministic literal text, not `{{variable}}` templates. Leave a space after the emoji and remember the UTF-8 title budget.

### Choose one emoji by topic

Leave `recipe.prefix` empty and append this to the existing `recipe.systemPrompt`; switching `preset` to `custom` is unnecessary:

```text
Every title must start with one emoji appropriate to the conversation topic, followed by one space and a concise title.
Use only one leading emoji and do not repeat emoji in the body.
If currentTitle has no emoji, fix its format even if the topic is unchanged.
Return only the final title, with no quotes, explanation, or Markdown.
```

Do not combine model-generated emoji with a fixed emoji prefix. A format change affects future generations; it does not automatically rewrite history. Ask separately about a batch rebuild and whether pinned titles may be replaced.

### Lower-request automatic refresh

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

For manual-only refresh, set all three: `enableIdle: false`, `everyNTurns: 0`, and `intervalMs: 0`. Initial generation after the first message of a new conversation still occurs.

### Use a separate title model

```yaml
recipe:
  provider: '<provider id already configured in this DSH>'
  model: '<model id from that provider>'
```

Read the available model catalog or use the settings dropdown rather than inventing an id. Never put API credentials in this plugin's config. The title route does not change the main conversation model and does not automatically fall back to it on failure. Clear both fields to follow the session route again.

<a id="troubleshooting"></a>

## AI troubleshooting checklist

| Symptom | Check and action |
|---|---|
| A prompt edit did not change old titles | Saving settings does not rewrite history. Test one manual refresh first; confirm the scope separately before a batch. |
| Refresh is skipped | Inspect `/title`: source, coverage watermark, `Policy`, `Drift`, and `Last auto`. Check pins, new input, spacing, daily cap, drift threshold, and text length. |
| A long conversation reports a 4096-byte error | Current versions sample first intent and recent messages with Unicode-safe clipping. Fixed custom scaffolding may still be too large; shorten it or explicitly agree on a larger budget instead of retrying repeatedly. |
| Edits are ineffective or rejected | Check nested `recipe` / `policy`, field types/ranges, and higher-priority overrides. Runtime code may keep the last valid configuration after semantic validation fails. |
| A custom template fails | Use only documented variables. The user template and system prompt together must reference at least one of `{{messages}}`, `{{transcript}}`, or `{{firstMessage}}`, not just fixed text or a message count. |
| An explicit model fails | Provider and model must be paired. Check availability and DSH-managed credentials; never copy secrets into this config. |
| Batch succeeded but sidebar titles are old | Use **Sync saved titles to sidebar** before attempting another model batch. |
| All-history skips records | Empty/subagent/pinned records are excluded by default. Writer ownership, corruption, or format incompatibility must be reported, not bypassed by forced unlocks or rewrites. |

### Validation sources and compatibility

- [Defaults and enums](../lib/constants.js)
- [Editable Config schema](../lib/schema.js)
- [Types, numeric limits, and cross-field validation](../lib/config-core.js)
- [Input budgeting and template sampling](../lib/input-budget.js)
- [Refresh decisions](../lib/policy-core.js)
- [Historical storage adapter and boundaries](../lib/history.js)
- [Sidebar checkpoints and notifications](../lib/title-publication.js)

These source files ship with the plugin too. Check the installed version and the user's actual configuration before acting. This reference does not grant permission to modify settings or bypass user confirmation.
