# Commands

There is no hand-written command list here any more.

This file used to carry a table of every command with its description, usage and
cooldown. It had drifted a long way from the code — it advertised "more than 120
commands" and a 28-command Images category, listing several (`approved`,
`bed`, ...) that this fork has never had. A table that is confidently wrong is
worse than no table, because it is the one people believe.

The two accurate sources:

- **`/help` in the client.** Built from the loaded commands at runtime, so it
  cannot disagree with what the bot actually answers.
- **`src/commands/`.** One file per command, grouped by category. Each declares
  its own name, description and options in a `SlashCommandBuilder`, which is
  the same declaration that gets registered.

The README carries the per-category counts and a sample of each.

## A note for GameVox

GameVox answers a set of commands itself — `/ban`, `/kick`, `/clear`,
`/slowmode`, `/8ball`, `/qrcode`, `/serverinfo` and others. Atlanta's versions
of those were removed rather than shipped beside them: the GameVox picker has no
namespace, so two commands with one name show up as two identical rows with
nothing to choose between them.

Those names are refused at registration by the GameVox API, so a new command
cannot reintroduce the clash by accident. The current list is in the GameVox
developer docs under Slash commands.
