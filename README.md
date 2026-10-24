# Session Title Studio

English | [简体中文](./README.zh.md)

Configurable session titles for DeepSeek Harness: a title **recipe** (prompt, language, format), a **refresh policy** (idle, every N turns, interval, manual), **local topic-drift detection**, and a visual **settings page**.

It does not add another automatic titler. It turns the session title into configurable, triggerable, traceable metadata, while reusing DSH's own log-backed `session/title` state and `ctx.sessionTitle` service.

---

## Install

1. Open **Plugins → Add plugin → Install a third-party plugin** in DSH Web or Desktop and enter the Git source:

   ```text
   git+https://github.com/idealclover/dsh-session-title-studio.git
   ```

   For local development, clone the repository and install its **absolute directory path** instead:

   ```bash
   git clone https://github.com/idealclover/dsh-session-title-studio.git
   cd dsh-session-title-studio
   pwd
   ```

   Paste the directory printed by `pwd` into the plugin installer. No build step is required; the package ships plain JavaScript.

2. Enable **Session Title Studio**. If DSH requests a restart, restart it.

3. If the official **"Refresh titles as you chat"** bundle (`dsh-experimental-session-titles-bundle`) is enabled, disable it first. Only one session-title provider may be registered.

Then use `/title` in the composer.

---

## Settings

Two entries render the same page:

- **Settings → Title Studio**
- **Plugins → Session Title Studio → Settings**

Every field is volatile: edits are written to the current profile immediately and take effect without a restart. The per-field **Reset** action clears the user override and falls back to the bundle default.

The settings page is a Client artifact loaded at host startup. Upgrading from a version without it needs **one DSH restart**; later configuration edits do not.

---

## One component

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

### Title model

The settings page's **Title model** is a real picker over the current DSH global model catalog, grouped by provider. The chosen route affects **only the auxiliary title request**; the session's own model stays unchanged. Empty means "follow the session model".

Selection writes `provider` and `model` atomically, so there is no half-configured intermediate state. The raw fields remain available in YAML:

```yaml
provider: deepseek-account
model: deepseek-v4-pro
```

The title request always uses the route's **lowest reasoning effort** to control cost; a failed request keeps the previous title.

### Variables

`systemPrompt` and `userTemplate` accept `{{messages}}`, `{{transcript}}`, `{{currentTitle}}`, `{{firstMessage}}`, `{{workspace}}`, `{{date}}`, and `{{messageCount}}`. Unknown variables fail at load time.

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

### Topic drift

Drift detection is local and makes **no model call**:

1. A successful refresh stores the covered user messages as the title basis.
2. The next automatic trigger compares each newer user message with that basis.
3. Code blocks, URLs, and conversational filler are removed; Latin words and CJK character bigrams form token sets.
4. Similarity is `0.7 × containment + 0.3 × Jaccard`, and drift is `1 - similarity`.
5. The **maximum** per-message score is used, so an older same-topic message cannot dilute a later topic change.
6. A refresh runs when the score reaches `driftThreshold`; `driftForceAfterMessages` forces a refresh regardless.

This is lexical, not semantic: paraphrase or cross-language continuity can look like drift, and code-heavy messages can be over-scored. Tune the threshold and force count on the settings page.

### Guards

A refresh runs only when the session is live, is not a subagent (by default), is not pinned (unless forced), has new input since the last title, passes the every-N threshold, passes the drift judgement (unless forced by message count), is outside the minimum interval, is under the daily budget, and has no refresh already in flight.

Manual refreshes bypass staleness, interval, and budget, but still respect a pinned title unless `force` is used.

---

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

### Sidebar synchronization

Since 0.7.1 a durable cold title checkpoints `sessionProjectionCache` while holding write ownership, then sends an `api-session/added` upsert with an exact committed log watermark after closing the writer. This updates both unopened list rows and already-read sequenced projections without opening their conversations. The original last-user-message time is retained, so bulk titles do not reorder all history as new activity. Derived cache or notification errors are warnings, not failures of an already saved model result.

To repair titles saved by earlier versions, click **Maintenance → Sync saved titles to sidebar**. This reads stored logs, refreshes derived checkpoints and pushes exact titles: **no model request, no Agent activation and no session-log write**. The reported count is notifications pushed; the official cold projection path writes derived cache fail-soft in the background.

---

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

## Development

```bash
npm test
npm run check
```

Pure logic (templates, formatting, policy decisions, drift scoring, config validation) runs without Harness. Integration tests for DSH services, persisted history and Client modules require the corresponding DSH packages to be resolvable. They explicitly skip when those optional Host dependencies are absent in a standalone checkout; passing the pure suite is not a substitute for Host compatibility testing. `client.js` is the browser artifact for the settings page.

## License

MIT
