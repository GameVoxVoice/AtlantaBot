import {
	Client,
	Collection,
	GatewayIntentBits,
	type Guild as DiscordGuild,
	type GuildMember,
	type Role,
	type User as DiscordUser,
} from "discord.js";
import { Player } from "discord-player";
import { GiveawaysManager } from "discord-giveaways";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import type { TFunction } from "i18next";
import type { HydratedDocument } from "mongoose";

import { config } from "../config.js";
import { Command } from "./Command.js";
import GuildModel, { type IGuild } from "./Guild.js";
import UserModel, { type IUser } from "./User.js";
import MemberModel, { type IMember } from "./Member.js";
import LogModel from "./Log.js";
import Logger from "../helpers/logger.js";
import type { BotConfig, CustomEmojis, DatabaseCache, LanguageMeta } from "../types/index.js";
import customEmojis from "../../emojis.json" with { type: "json" };
import languageMeta from "../../languages/language-meta.json" with { type: "json" };

dayjs.extend(relativeTime);

export default class Atlanta extends Client {
	config: BotConfig;
	customEmojis: CustomEmojis;
	languages: LanguageMeta[];
	commands: Collection<string, Command>;
	logger: typeof Logger;
	guildsData: typeof GuildModel;
	usersData: typeof UserModel;
	membersData: typeof MemberModel;
	logs: typeof LogModel;
	translations!: Map<string, TFunction>;
	states: Record<string, string>;
	knownGuilds: string[];
	databaseCache: DatabaseCache;
	player: Player;
	giveawaysManager: GiveawaysManager;

	constructor() {
		// GameVox compat: when these env vars are set, point discord.js at
		// the GameVox bot-api host instead of discord.com. Leave them unset
		// and the bot connects to real Discord normally. discord.js types
		// the rest/ws nested options narrowly; we cast since we're only
		// supplying the two fields that exist.
		const apiBase = process.env.GAMEVOX_API; // e.g. https://bot.gamevox.com
		const gatewayURL = process.env.GAMEVOX_GATEWAY; // e.g. wss://bot.gamevox.com
		const opts: any = {
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.DirectMessages,
			],
			allowedMentions: { parse: ["users"] },
		};
		if (apiBase) opts.rest = { api: apiBase + "/api" };
		if (gatewayURL) opts.ws = { gatewayURL };
		super(opts);

		this.config = config;
		this.customEmojis = customEmojis as CustomEmojis;
		this.languages = languageMeta as LanguageMeta[];
		this.commands = new Collection();
		this.logger = Logger;
		this.guildsData = GuildModel;
		this.usersData = UserModel;
		this.membersData = MemberModel;
		this.logs = LogModel;
		this.states = {};
		this.knownGuilds = [];

		this.databaseCache = {
			users: new Collection(),
			guilds: new Collection(),
			members: new Collection(),
			usersReminds: new Collection(),
			mutedUsers: new Collection(),
		};

		this.player = new Player(this as any);
		this.giveawaysManager = new GiveawaysManager(this as any, {
			storage: "./giveaways.json",
			default: {
				botsCanWin: false,
				embedColor: "#FF0000",
				reaction: "🎉",
			},
		});
	}

	get defaultLanguage(): string {
		return this.languages.find((l) => l.default)?.name ?? "en-US";
	}

	translate(key: string, args?: Record<string, unknown>, locale?: string): string {
		const lang = locale ?? this.defaultLanguage;
		const translator = this.translations.get(lang);
		if (!translator) throw new Error("Invalid language set in data.");
		const result = translator(key, args as Record<string, string>);
		return result || key.split(":").pop() || key;
	}

	printDate(date: Date | number, format?: string, locale?: string): string {
		const lang = locale ?? this.defaultLanguage;
		const languageData = this.languages.find(
			(l) => l.name === lang || l.aliases.includes(lang)
		);
		const fmt = format ?? languageData?.defaultMomentFormat ?? "MMMM D, YYYY";
		return dayjs(new Date(date)).format(fmt);
	}

	convertTime(time: number | Date, type?: string, noSuffix?: boolean, locale?: string): string {
		const lang = locale ?? this.defaultLanguage;
		const _languageData = this.languages.find(
			(l) => l.name === lang || l.aliases.includes(lang)
		);
		if (type === "from") return dayjs(time).fromNow(noSuffix);
		return dayjs(time).toNow(noSuffix);
	}

	async findOrCreateUser(
		{ id: userID }: { id: string },
		isLean?: boolean
	): Promise<HydratedDocument<IUser>> {
		const cached = this.databaseCache.users.get(userID);
		if (cached) return isLean ? (cached.toJSON() as unknown as HydratedDocument<IUser>) : cached;

		let userData = isLean
			? await this.usersData.findOne({ id: userID }).lean()
			: await this.usersData.findOne({ id: userID });

		if (userData) {
			if (!isLean) this.databaseCache.users.set(userID, userData as HydratedDocument<IUser>);
			return userData as HydratedDocument<IUser>;
		}

		userData = new this.usersData({ id: userID });
		await (userData as HydratedDocument<IUser>).save();
		this.databaseCache.users.set(userID, userData as HydratedDocument<IUser>);
		return userData as HydratedDocument<IUser>;
	}

	async findOrCreateMember(
		{ id: memberID, guildID }: { id: string; guildID: string },
		isLean?: boolean
	): Promise<HydratedDocument<IMember>> {
		const cacheKey = `${memberID}${guildID}`;
		const cached = this.databaseCache.members.get(cacheKey);
		if (cached) return isLean ? (cached.toJSON() as unknown as HydratedDocument<IMember>) : cached;

		let memberData = isLean
			? await this.membersData.findOne({ guildID, id: memberID }).lean()
			: await this.membersData.findOne({ guildID, id: memberID });

		if (memberData) {
			if (!isLean) this.databaseCache.members.set(cacheKey, memberData as HydratedDocument<IMember>);
			return memberData as HydratedDocument<IMember>;
		}

		memberData = new this.membersData({ id: memberID, guildID });
		await (memberData as HydratedDocument<IMember>).save();
		const guild = await this.findOrCreateGuild({ id: guildID });
		if (guild) {
			guild.members.push((memberData as HydratedDocument<IMember>)._id as any);
			await guild.save();
		}
		this.databaseCache.members.set(cacheKey, memberData as HydratedDocument<IMember>);
		return memberData as HydratedDocument<IMember>;
	}

	async findOrCreateGuild(
		{ id: guildID }: { id: string },
		isLean?: boolean
	): Promise<HydratedDocument<IGuild>> {
		const cached = this.databaseCache.guilds.get(guildID);
		if (cached) return isLean ? (cached.toJSON() as unknown as HydratedDocument<IGuild>) : cached;

		let guildData = isLean
			? await this.guildsData.findOne({ id: guildID }).populate("members").lean()
			: await this.guildsData.findOne({ id: guildID }).populate("members");

		if (guildData) {
			if (!isLean) this.databaseCache.guilds.set(guildID, guildData as HydratedDocument<IGuild>);
			return guildData as HydratedDocument<IGuild>;
		}

		guildData = new this.guildsData({ id: guildID });
		await (guildData as HydratedDocument<IGuild>).save();
		this.databaseCache.guilds.set(guildID, guildData as HydratedDocument<IGuild>);
		return guildData as HydratedDocument<IGuild>;
	}

	async resolveUser(search: string): Promise<DiscordUser | undefined> {
		if (!search) return undefined;
		const mentionMatch = search.match(/^<@!?(\d+)>$/);
		if (mentionMatch) {
			const user = await this.users.fetch(mentionMatch[1]).catch(() => undefined);
			if (user) return user;
		}
		return this.users.fetch(search).catch(() => undefined);
	}

	async resolveMember(search: string, guild: DiscordGuild): Promise<GuildMember | undefined> {
		if (!search) return undefined;
		const mentionMatch = search.match(/^<@!?(\d+)>$/);
		if (mentionMatch) {
			const member = await guild.members.fetch(mentionMatch[1]).catch(() => undefined);
			if (member) return member;
		}
		return guild.members.fetch(search).catch(() => undefined);
	}

	async resolveRole(search: string, guild: DiscordGuild): Promise<Role | undefined> {
		if (!search) return undefined;
		const mentionMatch = search.match(/^<@&!?(\d+)>$/);
		if (mentionMatch) {
			const role = guild.roles.cache.get(mentionMatch[1]);
			if (role) return role;
		}
		return guild.roles.cache.find((r) => r.name === search) ?? guild.roles.cache.get(search) ?? undefined;
	}
}
