<img width="150" height="150" align="left" style="float: left; margin: 0 10px 0 0;" alt="Atlanta" src="https://i.goopics.net/lEENx.png">  

# Atlanta

[![](https://img.shields.io/discord/565048515357835264.svg?logo=discord&colorB=7289DA&label=Atlanta%20Support)](https://discord.gg/Za9zxTH)
[![](https://img.shields.io/discord/568120814776614924.svg?logo=discord&colorB=00BFFF&label=Atlanta%20Emojis)](https://discord.gg/NPkySYKMkN)
[![](https://img.shields.io/badge/discord.js-v14-blue.svg?logo=npm)](https://discord.js.org)
[![](https://img.shields.io/badge/typescript-5.x-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![](https://img.shields.io/badge/patreon-donate-orange.svg)](https://www.patreon.com/androz2091)

> This bot is used by more than 130,000 Discord users and more than 800 servers.

Atlanta is an open source Discord bot coded in TypeScript with [Discord.js](https://discord.js.org) and [Mongoose](https://mongoosejs.com/docs/api.html) by [Androz2091](https://github.com/Androz2091).  
Feel free to add a star ⭐ to the repository to promote the project!

## What's new in v5

Atlanta v5 is a **ground-up rewrite** of the original JavaScript codebase (which I started when I was 13!):

*   🔷 Entire codebase rewritten from JavaScript to **TypeScript**
*   ⚡ All commands migrated to **slash commands** via [discord-sync-commands](https://github.com/Androz2091/discord-sync-commands)
*   📦 Modern dependencies: Discord.js v14, Mongoose 8, discord-player v6, i18next v24, dayjs
*   🔒 Configuration moved from `config.js` to `.env` encrypted with [dotenvx](https://dotenvx.com)
*   🐳 Docker support with multi-stage `Dockerfile`

## Features

### Complete Bot

Atlanta offers (non-exhaustive list):
*   ⚡ All commands are Discord **slash commands** -- no prefix needed
*   🇫🇷 Support for translations (9 languages out of the box)
*   ⚙️ Guild configuration (language, autorole, automod, tickets, etc...)
*   😀 Commands made pleasant thanks to the many emojis
*   🗳️ Support for top.gg votes with rewards

### Many commands

Atlanta has **8 main categories** and **74 slash commands**:

*   👩‍💼 **Administration** (14): `autorole`, `automod`, `backup`, `setlang`, `addcommand`, `ignore` and **8** more!
*   🚓 **Moderation** (7): `mute`, `unmute`, `sanctions`, `announcement`, `giveaway`, `checkinvites`, `clear-sanctions`
*   🎵 **Music** (13): `play`, `skip`, `queue`, `np`, `lyrics`, `filter`, `autoplay` and **6** more!
*   💰 **Economy** (15): `profile`, `work`, `slots`, `rob`, `leaderboard`, `marry`, `achievements` and **8** more!
*   👻 **Fun** (3): `findwords`, `lmg`, `number`
*   🖨️ **General** (16): `help`, `translate`, `minecraft`, `stats`, `suggest`, `report` and **10** more!
*   🖼️ **Images** (3): `captcha`, `clyde`, `facepalm`
*   👑 **Owner** (3): `eval`, `reload`, `servers-list`

> **Running on GameVox?** GameVox answers a set of commands itself -- `/ban`,
> `/kick`, `/clear`, `/slowmode`, `/8ball`, `/qrcode`, `/serverinfo` and others.
> Atlanta's versions were removed rather than shipped alongside them, because
> two commands with one name cannot be told apart in the GameVox picker.
> Registering one of those names is refused by the GameVox API; see its
> developer docs for the current list.

### A powerful Dashboard

Atlanta has its own dashboard which also offers many features! The dashboard runs with Express and EJS!

<img align="left" style="float: centrer; margin: 0 10px 0 0;" src="https://zupimages.net/up/19/31/c3ya.png" height="200" width="350"/>
<img align="center" style="float: left; margin: 0 10px 0 0;" src="https://zupimages.net/up/19/31/vnq5.png" height="200" width="350"/>
<img align="center" style="float: centrer; margin: 0 10px 0 0;" src="https://zupimages.net/up/19/31/htga.png" height="200" width="350"/>

You can directly **edit your configuration**, **manage your servers**, **view rankings**, **modify your profile** and much more!

> Find the code in the dashboard folder! 

## Installation

### Prerequisites

*   [Node.js](https://nodejs.org/) v22 or later
*   [MongoDB](https://www.mongodb.com/) instance
*   [Yarn](https://yarnpkg.com/) package manager
*   A [Discord application](https://discord.com/developers/applications) with a bot token

### Setup

**1.** Clone the repository and install dependencies:

```bash
git clone https://github.com/Androz2091/AtlantaBot.git
cd AtlantaBot
yarn install
```

**2.** Fill the .env with your values:

At minimum, set your bot token, MongoDB URI, and owner ID in `.env`.

**3.** (Optional) Encrypt your config with [dotenvx](https://dotenvx.com):

```bash
brew install dotenvx/brew/dotenvx
dotenvx encrypt
```

**4.** Build and start:

```bash
yarn build
yarn start
```

For development with hot reload, use `yarn dev` instead.

### Docker

A `Dockerfile` is included for containerized deployments:

```bash
docker build -t atlantabot .
docker run -d --env-file .env atlantabot
```

## Links

*   [Discord](https://discord.gg/NPkySYKMkN)
*   [Github](https://github.com/Androz2091/AtlantaBot/)
*   [Patreon](https://www.patreon.com/androz2091)

## Contributing

Before **creating an issue**, please ensure that it hasn't already been reported/suggested.   
And if you have a question, please ask it in the [Discord server](https://discord.gg/NPkySYKMkN) instead of opening an issue.
If you wish to contribute to the Atlanta codebase or documentation, feel free to fork the repository and submit a pull request!

## License

Atlanta is licensed under the GPL 3.0 license. See the file `LICENSE` for more information. If you plan to use any part of this source code in your own bot, I would be grateful if you would include some form of credit somewhere.
