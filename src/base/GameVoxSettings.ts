// GameVoxSettings.ts — serve AtlantaBot's per-server configuration inside the
// GameVox client's Server Settings ▸ Apps ▸ Settings panel.
//
// GameVox stores none of this. When an operator opens the panel, GameVox
// dispatches APP_SETTINGS_REQUEST over the gateway; we answer with a FORM
// DESCRIPTION, GameVox renders it, and edited values come back as a second
// request with action "save". The bot remains the only owner of its data —
// which is the point: no dashboard to host, no OAuth flow to build, and
// nothing about this guild leaves Mongo except what an operator who can
// already manage the server asked to see.
//
// Three things are worth knowing before editing this file.
//
// 1. We never send ids for a picker. A channel or role field declares only its
//    TYPE; GameVox attaches the server's own channel and group list and hands
//    back one of the ids it issued. That is why there is no channel list in
//    this file, and why the ids that come back are already in the same
//    snowflake space discord.js uses everywhere else.
//
// 2. Everything that comes back is still validated here. GameVox guarantees
//    the SHAPE of a save (bounded strings, no nested objects, arrays of
//    strings) and explicitly not its meaning — it does not retain the form it
//    rendered, so it cannot know that `autorole.role` was a role picker. Every
//    value below is re-checked against this guild before it is written.
//
// 3. The reply goes out over REST, not the gateway. Bot libraries universally
//    expose an HTTP client; most do not let application code send arbitrary
//    gateway opcodes.
//
// The request carries `schema_version`, so an older GameVox deployment that
// only understands the flat v1 form still gets a usable panel — see
// describeLegacy at the bottom.

import type Atlanta from "./Atlanta.js";
import type { IGuildPlugins } from "./Guild.js";

/** Schema version this file knows how to speak. */
const SCHEMA_V2 = 2;

/** GameVox's own ceiling on a multi-value field. */
const MAX_SELECTED = 25;

interface SettingsRequest {
	nonce?: unknown;
	server_id?: unknown;
	action?: unknown;
	schema_version?: unknown;
	values?: unknown;
}

interface SettingsOption {
	value: string;
	label: string;
	description?: string;
}

interface SettingsField {
	key: string;
	label: string;
	type:
		| "string"
		| "text"
		| "boolean"
		| "number"
		| "select"
		| "multiselect"
		| "channel"
		| "channels"
		| "role"
		| "roles"
		| "color"
		| "static";
	value?: unknown;
	help?: string;
	placeholder?: string;
	options?: SettingsOption[];
	min?: number;
	max?: number;
	step?: number;
	max_length?: number;
	channel_kinds?: string[];
	required?: boolean;
	show_if?: { key: string; equals: unknown };
}

interface SettingsSection {
	key: string;
	label: string;
	description?: string;
	fields: SettingsField[];
}

/** Channel kinds that can hold a message. Headers are GameVox's categories. */
const POSTABLE = ["text", "news", "forum", "fileshare"];

/** Guard against the events loader wiring us up twice across a reconnect. */
const wired = new WeakSet<Atlanta>();

export function handleGameVoxPacket(client: Atlanta, packet: unknown): void {
	const p = packet as { t?: unknown; d?: unknown } | null;
	if (!p || p.t !== "APP_SETTINGS_REQUEST") return;
	void handleRequest(client, (p.d ?? {}) as SettingsRequest);
}

/**
 * Only needed if you wire this up somewhere other than src/events/raw.ts.
 * Idempotent, so calling it twice does not double every reply.
 */
export function initGameVoxSettings(client: Atlanta): void {
	if (wired.has(client)) return;
	wired.add(client);
	client.on("raw", (packet: unknown) => handleGameVoxPacket(client, packet));
}

async function handleRequest(client: Atlanta, req: SettingsRequest): Promise<void> {
	const nonce = typeof req.nonce === "string" ? req.nonce : "";
	const guildID = typeof req.server_id === "string" ? req.server_id : "";
	// server_id is stamped by GameVox from the operator's own request, never
	// read off anything we send. If it is missing the request is malformed.
	if (!nonce || !guildID) return;

	const version = typeof req.schema_version === "number" ? req.schema_version : 1;

	try {
		if (req.action === "save") {
			const message = await applySettings(client, guildID, req.values);
			await reply(client, nonce, guildID, { message });
			return;
		}
		if (version >= SCHEMA_V2) {
			await reply(client, nonce, guildID, {
				version: SCHEMA_V2,
				sections: await describeSettings(client, guildID),
			});
		} else {
			await reply(client, nonce, guildID, {
				fields: await describeLegacy(client, guildID),
			});
		}
	} catch (err) {
		client.logger.log(`GameVox settings (${String(req.action)}) failed for ${guildID}: ${err}`, "error");
		// Answer even on failure. A silent drop leaves the operator staring at
		// a spinner until GameVox's timeout, which reads as "this app is
		// broken" rather than "this went wrong once".
		await reply(client, nonce, guildID, {
			error: "AtlantaBot could not read its settings for this server.",
		}).catch(() => undefined);
	}
}

async function reply(
	client: Atlanta,
	nonce: string,
	guildID: string,
	body: Record<string, unknown>
): Promise<void> {
	await client.rest.post("/applications/@me/settings-response", {
		body: { nonce, ...body },
		query: new URLSearchParams({ server_id: guildID }),
	});
}

// ---------------------------------------------------------------------------
// Describe
// ---------------------------------------------------------------------------

async function describeSettings(client: Atlanta, guildID: string): Promise<SettingsSection[]> {
	const data = await client.findOrCreateGuild({ id: guildID });
	const plugins = data.plugins;

	// `string | false` is how this schema spells "channel, or off". The panel
	// spells it as an empty picker, so false becomes null on the way out and
	// null becomes false on the way back in.
	const chan = (v: string | false | null | undefined) => (typeof v === "string" && v ? v : null);

	const languageOptions: SettingsOption[] = client.languages.map((l) => ({
		value: l.name,
		label: l.nativeName || l.name,
	}));

	return [
		{
			key: "general",
			label: "General",
			description: "How AtlantaBot behaves across this server.",
			fields: [
				{
					key: "language",
					label: "Language",
					type: "select",
					value: data.language,
					options: languageOptions,
					required: true,
					help: "Language AtlantaBot replies in.",
				},
				{
					key: "autoDeleteModCommands",
					label: "Delete moderation commands after running them",
					type: "boolean",
					value: data.autoDeleteModCommands === true,
				},
				{
					key: "ignoredChannels",
					label: "Ignored channels",
					type: "channels",
					value: asStringArray(data.ignoredChannels),
					channel_kinds: POSTABLE,
					help: "AtlantaBot will not respond to commands in these channels.",
				},
			],
		},
		{
			key: "welcome",
			label: "Welcome messages",
			description: "Posted when someone joins.",
			fields: [
				{ key: "welcome.enabled", label: "Send a welcome message", type: "boolean", value: plugins.welcome.enabled === true },
				{
					key: "welcome.channel",
					label: "Channel",
					type: "channel",
					value: chan(plugins.welcome.channel),
					channel_kinds: POSTABLE,
					show_if: { key: "welcome.enabled", equals: true },
				},
				{
					key: "welcome.message",
					label: "Message",
					type: "text",
					value: plugins.welcome.message ?? "",
					max_length: 1800,
					placeholder: "Welcome {user} to {server}!",
					help: "{user}, {server} and {membercount} are replaced when the message is sent.",
					show_if: { key: "welcome.enabled", equals: true },
				},
				{
					key: "welcome.withImage",
					label: "Include a generated welcome card",
					type: "boolean",
					value: plugins.welcome.withImage === true,
					show_if: { key: "welcome.enabled", equals: true },
				},
			],
		},
		{
			key: "goodbye",
			label: "Goodbye messages",
			description: "Posted when someone leaves.",
			fields: [
				{ key: "goodbye.enabled", label: "Send a goodbye message", type: "boolean", value: plugins.goodbye.enabled === true },
				{
					key: "goodbye.channel",
					label: "Channel",
					type: "channel",
					value: chan(plugins.goodbye.channel),
					channel_kinds: POSTABLE,
					show_if: { key: "goodbye.enabled", equals: true },
				},
				{
					key: "goodbye.message",
					label: "Message",
					type: "text",
					value: plugins.goodbye.message ?? "",
					max_length: 1800,
					placeholder: "{user} just left {server}.",
					show_if: { key: "goodbye.enabled", equals: true },
				},
				{
					key: "goodbye.withImage",
					label: "Include a generated goodbye card",
					type: "boolean",
					value: plugins.goodbye.withImage === true,
					show_if: { key: "goodbye.enabled", equals: true },
				},
			],
		},
		{
			key: "autorole",
			label: "Auto-role",
			description: "Given to every member on join.",
			fields: [
				{ key: "autorole.enabled", label: "Assign a group automatically", type: "boolean", value: plugins.autorole.enabled === true },
				{
					key: "autorole.role",
					label: "Group",
					type: "role",
					value: chan(plugins.autorole.role),
					show_if: { key: "autorole.enabled", equals: true },
					help: "AtlantaBot must rank above this group to assign it.",
				},
			],
		},
		{
			key: "automod",
			label: "Auto-moderation",
			description: "Deletes invite links posted by non-moderators.",
			fields: [
				{ key: "automod.enabled", label: "Enable auto-moderation", type: "boolean", value: plugins.automod.enabled === true },
				{
					key: "automod.ignored",
					label: "Exempt channels",
					type: "channels",
					value: asStringArray(plugins.automod.ignored),
					channel_kinds: POSTABLE,
					show_if: { key: "automod.enabled", equals: true },
				},
			],
		},
		{
			key: "moderation",
			label: "Moderation",
			fields: [
				{ key: "modlogs", label: "Moderation log channel", type: "channel", value: chan(plugins.modlogs), channel_kinds: POSTABLE },
				{ key: "logs", label: "Server log channel", type: "channel", value: chan(plugins.logs), channel_kinds: POSTABLE },
				{ key: "reports", label: "Reports channel", type: "channel", value: chan(plugins.reports), channel_kinds: POSTABLE },
				{ key: "suggestions", label: "Suggestions channel", type: "channel", value: chan(plugins.suggestions), channel_kinds: POSTABLE },
				{
					key: "warns.kick",
					label: "Kick after this many warnings",
					type: "number",
					value: typeof plugins.warnsSanctions.kick === "number" ? plugins.warnsSanctions.kick : 0,
					min: 0,
					max: 20,
					step: 1,
					help: "0 turns the automatic kick off.",
				},
				{
					key: "warns.ban",
					label: "Ban after this many warnings",
					type: "number",
					value: typeof plugins.warnsSanctions.ban === "number" ? plugins.warnsSanctions.ban : 0,
					min: 0,
					max: 20,
					step: 1,
					help: "0 turns the automatic ban off.",
				},
			],
		},
		{
			key: "tickets",
			label: "Tickets",
			fields: [
				{ key: "tickets.enabled", label: "Enable tickets", type: "boolean", value: plugins.tickets.enabled === true },
				{
					key: "tickets.category",
					label: "Category to open tickets under",
					type: "channel",
					value: chan(plugins.tickets.category),
					channel_kinds: ["header"],
					show_if: { key: "tickets.enabled", equals: true },
				},
			],
		},
		{
			key: "status",
			label: "This server",
			fields: [
				{ key: "stats.cases", label: "Moderation cases recorded", type: "static", value: String(data.casesCount ?? 0) },
				{
					key: "stats.customCommands",
					label: "Custom commands",
					type: "static",
					value: String(Array.isArray(data.customCommands) ? data.customCommands.length : 0),
				},
			],
		},
	];
}

/**
 * The v1 form, for a GameVox that predates sections and pickers.
 *
 * Only string/boolean/number/select exist there, so the channel and group
 * settings are left out rather than rendered as boxes an operator would have
 * to paste raw ids into. The panel says as much.
 */
async function describeLegacy(client: Atlanta, guildID: string): Promise<SettingsField[]> {
	const data = await client.findOrCreateGuild({ id: guildID });
	const plugins = data.plugins;
	return [
		{
			key: "language",
			label: "Language",
			type: "select",
			value: data.language,
			options: client.languages.map((l) => ({ value: l.name, label: l.nativeName || l.name })),
			required: true,
		},
		{ key: "autoDeleteModCommands", label: "Delete moderation commands after running them", type: "boolean", value: data.autoDeleteModCommands === true },
		{ key: "welcome.enabled", label: "Send a welcome message", type: "boolean", value: plugins.welcome.enabled === true },
		{ key: "goodbye.enabled", label: "Send a goodbye message", type: "boolean", value: plugins.goodbye.enabled === true },
		{ key: "automod.enabled", label: "Enable auto-moderation", type: "boolean", value: plugins.automod.enabled === true },
		{ key: "tickets.enabled", label: "Enable tickets", type: "boolean", value: plugins.tickets.enabled === true },
		{
			key: "warns.kick",
			label: "Kick after this many warnings",
			type: "number",
			value: typeof plugins.warnsSanctions.kick === "number" ? plugins.warnsSanctions.kick : 0,
			help: "0 turns the automatic kick off. Channel and group settings need a newer GameVox server.",
		},
		{
			key: "warns.ban",
			label: "Ban after this many warnings",
			type: "number",
			value: typeof plugins.warnsSanctions.ban === "number" ? plugins.warnsSanctions.ban : 0,
		},
	];
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Write back whatever the operator changed, and report what was refused.
 *
 * Nothing here trusts the payload. GameVox promises structure only: it does
 * not keep the form it rendered, so it cannot check that `autorole.role` names
 * a group rather than a channel, or that the channel is even ours. Every id is
 * resolved against this guild first, and anything that does not resolve is
 * skipped and counted rather than written — a stale picker must not be able to
 * point AtlantaBot at another server's channel.
 */
async function applySettings(client: Atlanta, guildID: string, raw: unknown): Promise<string> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("settings payload was not an object");
	}
	const values = raw as Record<string, unknown>;
	const data = await client.findOrCreateGuild({ id: guildID });
	const plugins = data.plugins as IGuildPlugins;
	const guild = client.guilds.cache.get(guildID);

	// One fetch, so a channel created since the last gateway event still
	// resolves. A failure here is not fatal: the cache is then the whole
	// answer, and an unresolvable id is skipped either way.
	if (guild) {
		await guild.channels.fetch().catch(() => undefined);
	}

	let skipped = 0;
	const channelID = (v: unknown, kinds: string[] | null): string | null => {
		const id = asSnowflake(v);
		if (id === null) return null;
		const ch = guild?.channels.cache.get(id);
		if (!ch) {
			skipped++;
			return null;
		}
		// GuildChannel kinds are numeric on the wire; category is 4, and the
		// rest are things a message can go in.
		if (kinds && kinds.includes("header") && ch.type !== 4) {
			skipped++;
			return null;
		}
		if (kinds && !kinds.includes("header") && ch.type === 4) {
			skipped++;
			return null;
		}
		return id;
	};
	const channelIDs = (v: unknown): string[] => {
		if (!Array.isArray(v)) return [];
		const out: string[] = [];
		for (const entry of v.slice(0, MAX_SELECTED)) {
			const id = channelID(entry, POSTABLE);
			if (id && !out.includes(id)) out.push(id);
		}
		return out;
	};
	const roleID = (v: unknown): string | null => {
		const id = asSnowflake(v);
		if (id === null) return null;
		if (!guild?.roles.cache.get(id)) {
			skipped++;
			return null;
		}
		return id;
	};

	const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key);

	if (has("language")) {
		const lang = String(values.language ?? "");
		// Closed set. A language we do not ship would make client.translate
		// throw on the next command in this guild.
		if (client.languages.some((l) => l.name === lang)) data.language = lang;
		else skipped++;
	}
	if (has("autoDeleteModCommands")) data.autoDeleteModCommands = values.autoDeleteModCommands === true;
	if (has("ignoredChannels")) {
		data.ignoredChannels = channelIDs(values.ignoredChannels);
		data.markModified("ignoredChannels");
	}

	applyGreeting(plugins.welcome, "welcome", values, has, channelID);
	applyGreeting(plugins.goodbye, "goodbye", values, has, channelID);

	if (has("autorole.enabled")) plugins.autorole.enabled = values["autorole.enabled"] === true;
	if (has("autorole.role")) plugins.autorole.role = roleID(values["autorole.role"]);

	if (has("automod.enabled")) plugins.automod.enabled = values["automod.enabled"] === true;
	if (has("automod.ignored")) plugins.automod.ignored = channelIDs(values["automod.ignored"]);

	for (const key of ["modlogs", "logs", "reports", "suggestions"] as const) {
		if (!has(key)) continue;
		// This schema stores "off" as false, not null.
		plugins[key] = channelID(values[key], POSTABLE) ?? false;
	}

	if (has("warns.kick")) plugins.warnsSanctions.kick = warnCount(values["warns.kick"]);
	if (has("warns.ban")) plugins.warnsSanctions.ban = warnCount(values["warns.ban"]);

	if (has("tickets.enabled")) plugins.tickets.enabled = values["tickets.enabled"] === true;
	if (has("tickets.category")) plugins.tickets.category = channelID(values["tickets.category"], ["header"]);

	// plugins is a Mixed path, so mongoose cannot see a nested mutation on its
	// own. Without this the save is a no-op and the panel reports success on a
	// write that never happened.
	data.markModified("plugins");
	await data.save();

	if (skipped > 0) {
		return `Settings saved. ${skipped} ${skipped === 1 ? "value" : "values"} were skipped because they do not match anything in this server.`;
	}
	return "Settings saved.";
}

function applyGreeting(
	plugin: IGuildPlugins["welcome"],
	prefix: "welcome" | "goodbye",
	values: Record<string, unknown>,
	has: (key: string) => boolean,
	channelID: (v: unknown, kinds: string[] | null) => string | null
): void {
	if (has(`${prefix}.enabled`)) plugin.enabled = values[`${prefix}.enabled`] === true;
	if (has(`${prefix}.channel`)) plugin.channel = channelID(values[`${prefix}.channel`], POSTABLE);
	if (has(`${prefix}.message`)) {
		const msg = typeof values[`${prefix}.message`] === "string" ? (values[`${prefix}.message`] as string).slice(0, 1800) : "";
		plugin.message = msg.trim() === "" ? null : msg;
	}
	if (has(`${prefix}.withImage`)) plugin.withImage = values[`${prefix}.withImage`] === true;
}

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

/** A snowflake, or null. Nothing else is ever treated as an id. */
function asSnowflake(v: unknown): string | null {
	if (typeof v !== "string") return null;
	return /^[0-9]{1,25}$/.test(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").slice(0, MAX_SELECTED) : [];
}

/** 0 means "off", which this schema spells as false. */
function warnCount(v: unknown): number | false {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return false;
	return Math.min(20, Math.round(n));
}
