<p align="center">
  <img src="./icon.svg" alt="Session Title Studio logo" width="96" height="96">
</p>

<h1 align="center">Session Title Studio</h1>

<p align="center">
  <strong>English</strong> · <a href="./README.md">简体中文</a>
</p>

<p align="center">
  Add <strong>configurable title recipes</strong> and <strong>refresh policies</strong> to DeepSeek Harness sessions.
</p>

- **Recipe**: custom prompts, language, length, naming style, deterministic prefixes/suffixes, and model routing.
- **Policy**: refresh after idle, every N turns, on an interval, or manually, with safeguards.
- **Drift**: compare recent messages with the current title's basis using local n-grams, with **no extra model calls**.
- **Settings**: configure it in Settings → Title Studio or directly on the plugin details page.
- **Safe defaults**: failed refreshes keep the previous title; no new messages means no automatic model request.

Titles reuse DSH's log-backed `session/title` state and `ctx.sessionTitle` service, so they survive replay, restore, and pagination, and **never enter the main model's context**.

---

## Install

1. Open **Plugins → Add plugin → Install a third-party plugin** in DSH Web/Desktop and enter the Git source:

   ```text
   git+https://github.com/idealclover/dsh-session-title-studio.git
   ```

   For local development, clone the repository and install its **absolute directory path** instead:

   ```bash
   git clone https://github.com/idealclover/dsh-session-title-studio.git
   cd dsh-session-title-studio
   pwd
   ```

   Paste the full directory printed by `pwd` into the plugin installer. This package ships plain JavaScript; no extra build step is required.

2. Enable **Session Title Studio**. If DSH requests a restart, restart it.

3. If the official **“Refresh titles as you chat”** bundle (`dsh-experimental-session-titles-bundle`) is enabled, disable it first. Only one title provider can be registered globally; enabling both causes one to fail registration.

After installation, use `/title` in the composer, or choose **⋯ → Regenerate title** on a sidebar conversation to update that title without opening the conversation.

---

## Settings

- **Settings → Title Studio** (dedicated settings page).
- **Plugins → Session Title Studio → Settings** (inside the bundle details page).

**For AI assistants:** Before configuring this plugin for a user, read the [detailed configuration reference](./docs/configuration.md) or [简体中文参考](./docs/configuration.zh.md). Defaults, nested config layout, prompts/template variables, refresh policies, rebuild scopes, and safety boundaries are documented there. Do not infer configuration from the README alone; obtain user confirmation before a batch rebuild or replacing pinned titles.

---

## What it solves

DSH's default **first-prompt** strategy generates a title from the first message and never updates it. The official experimental **all-prompts** bundle attempts a refresh with every new message, but hard-codes its prompt, language behavior, and title length.

This plugin combines:

| | Default first-prompt | Official all-prompts | This plugin |
|---|---|---|---|
| Generation timing | First message only | Every message | Initial generation + policy |
| Configurable refresh timing | No | No | Yes |
| Configurable prompt | No | No | Yes |
| Format/prefix/suffix | No | No | Yes |
| Language/length | Hard-coded | Hard-coded | Configurable |
| Manual refresh | No UI entry | No UI entry | `/title refresh` |
| Manual-title protection | Yes | Yes | Yes, with an explicit force option |
| Cost controls | — | One call per message | New input + spacing + daily budget |

---

## Development and verification

```bash
cd dsh-session-title-studio
npm test          # node:test, including pure logic
npm run check     # syntax checks + tests
```

Pure logic (templates, formatting, policy decisions, drift scoring, and config validation) runs without Harness. Integration tests for DSH services, persisted history, and Client modules require the corresponding DSH packages to be resolvable. They explicitly skip when Host dependencies are absent in a standalone checkout; passing the pure suite is not a substitute for Host compatibility testing. The Host entry registers the provider, event listeners, and commands; `client.js` is the browser artifact for the settings page.

---

## License

MIT
