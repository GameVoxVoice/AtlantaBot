# AtlantaBot, GameVox fork

A fork of [Androz2091/AtlantaBot](https://github.com/Androz2091/AtlantaBot)
that we run against [GameVox](https://gamevox.com)'s Discord-compatible bot
platform.

We keep it for two reasons. It is a broad-surface conformance test: one
unmodified community bot exercising moderation, giveaways, music, member
events and slash-command sync against our REST API and gateway, which catches
compatibility regressions no unit test of ours would. And it is the reference
implementation of our in-app settings schema, because a real bot with real
per-guild configuration is a better specification than a document.

Everything below is additive. Nothing in the fork changes AtlantaBot's
behaviour against Discord: leave the GameVox environment variables unset and
it connects to discord.com exactly as upstream does.

## Changes against upstream

Per GPL-3.0 section 5(a), the modified files and what changed:

| File | Change |
| --- | --- |
| `src/base/Atlanta.ts` | When `GAMEVOX_API` / `GAMEVOX_GATEWAY` are set, point the discord.js `Client` at those hosts instead of discord.com. No-op when unset. |
| `src/base/GameVoxSettings.ts` | New. Serves per-guild configuration into GameVox's app settings panel. |
| `src/events/raw.ts` | New. Hooks the `raw` dispatch so `APP_SETTINGS_REQUEST` reaches the handler above. |
| `Dockerfile` | Collapsed to a single stage, added the build deps `canvas` needs. |
| `.dockerignore` | Stopped excluding `src/`, which the single-stage build compiles in the image. |
| `docker-compose.yml` | New. Mongo plus the bot, for local runs. |
| `.env.local.example` | New. Template for the environment above. |
| `.gitignore` | Added `.env.local`, since upstream's list predates it and `.env` itself is tracked and cannot be ignored. |
| `scripts/secret-guard.sh`, `.githooks/pre-commit`, `.github/workflows/secret-guard.yml` | New. Blocks plaintext credentials at commit time and in CI. |

## Running it

REST and the gateway are **different hostnames**. They are one service behind
the load balancer, but it host-routes: `bot-api.*` serves the REST API and
`gateway.*` serves the websocket upgrade, so the `Host` header decides which
you get. Deriving one from the other by swapping the scheme does not work, and
there is no single `bot.gamevox.com` — that name has never existed in DNS.

`GAMEVOX_API` is the origin only; `Atlanta.ts` appends `/api` itself.

```
cp .env.local.example .env.local
# fill in DISCORD_TOKEN from developers.gamevox.com
docker compose --env-file .env.local up -d --build
docker compose logs -f bot
```

Then OAuth-install the bot to a test server from the developer portal.

**Keep your token in `.env.local`, not `.env`.** Compose reads `.env`
automatically, which makes it the obvious place to put one, but `.env` is
tracked in this repo — it carries upstream's dotenvx-encrypted values.
`.gitignore` cannot protect a file that is already in the index, so a token
written to `.env` is one `git commit -a` away from being public. `.env.local`
is ignored, and `--env-file` points Compose at it.

To run against real Discord instead, unset `GAMEVOX_API` and
`GAMEVOX_GATEWAY`; discord.js falls back to its built-in endpoints.

## Keeping credentials out

`scripts/secret-guard.sh` refuses to let a plaintext credential into the repo.
It runs two ways:

```
git config core.hooksPath .githooks     # once per clone
```

The pre-commit hook is the one that matters, because it runs before anything
leaves your machine. The `secret-guard` workflow runs the same script on every
push as a net for anyone who has not enabled the hook — but by the time CI
fails, the secret is already on GitHub and needs rotating, not amending.

What it checks:

1. **Every value in `.env` is dotenvx-encrypted.** This is an allowlist, not a
   hunt for things that look secret, so a pasted credential fails whatever
   shape it has. `.env` gets this treatment because it is tracked and Compose
   reads it automatically, which makes it the obvious wrong place for a token.
2. **No `.env.local`, `.env.*.local` or `.env.keys` is tracked.**
3. **Nothing credential-shaped anywhere else** — private key blocks, AWS keys,
   GitHub tokens, Discord-style bot tokens. Deliberately narrow, since a guard
   that cries wolf gets switched off. A deliberate sample can opt out with a
   `secret-guard:allow` comment on the line.

Failures report the file, the line and the variable name, never the value: a
guard that echoes a secret into a public build log has moved the problem
rather than solved it. If the scan itself cannot run, it fails the build
instead of reporting a pass it did not verify.

## In-app settings

GameVox lets an operator configure an installed app from Server Settings ▸
Apps ▸ Settings, without the app shipping a web dashboard. GameVox stores none
of the configuration: it asks the running bot what it exposes for that server,
renders a form from the answer, and hands edited values straight back.

`src/base/GameVoxSettings.ts` is our worked example of that contract, and it is
worth reading before implementing it elsewhere. Three things it demonstrates:

**Pickers carry no ids.** A channel or group field declares only its *type*.
GameVox attaches the catalogue of what that server actually has, keyed by the
same snowflakes the bot already sees over the REST API, so the options in front
of the operator are the server's own and the id that comes back needs no
translation.

**The bot validates everything it receives.** GameVox guarantees the *shape* of
a save — bounded strings, no nested objects, arrays of strings — and explicitly
not its meaning. It does not retain the form it rendered, so it cannot know
that `autorole.role` was a group picker rather than a channel one. Every id in
`applySettings` is resolved against the guild before it is written.

**The reply goes out over REST**, not the gateway. Bot libraries universally
expose an HTTP client; most do not let application code send arbitrary gateway
opcodes, so an opcode-based reply would have been unimplementable in the
majority of them.

The request carries a `schema_version`, so a bot can serve a richer form to a
newer server and a flat one to an older deployment. `describeLegacy` is that
fallback.
