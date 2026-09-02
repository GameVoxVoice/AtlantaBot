import { type GuildMember } from "discord.js";
import type Atlanta from "../base/Atlanta.js";

// The welcome message that used to live here has been removed: GameVox posts
// one itself now (/welcome), and running both meant two greetings for every
// person who joined. The Canvas machinery that drew the welcome banner went
// with it, which is also why this file no longer registers any fonts.
//
// What is left is the part GameVox does NOT do: re-applying a mute to someone
// who left and came back, and handing out the autorole.

export default class GuildMemberAddEvent {
	client: Atlanta;

	constructor(client: Atlanta) {
		this.client = client;
	}

	async run(member: GuildMember): Promise<void> {
		const client = this.client;
		const guildData = await client.findOrCreateGuild({ id: member.guild.id });

		const memberData = await client.findOrCreateMember({
			id: member.id,
			guildID: member.guild.id,
		});

		// Rejoining does not clear a mute that has not expired.
		if (memberData.mute.muted && memberData.mute.endDate && memberData.mute.endDate > Date.now()) {
			for (const channel of member.guild.channels.cache.values()) {
				if ("permissionOverwrites" in channel) {
					channel.permissionOverwrites.edit(member.id, {
						SendMessages: false,
						AddReactions: false,
						Connect: false,
					}).catch(() => {});
				}
			}
		}

		if (guildData.plugins.autorole.enabled && guildData.plugins.autorole.role) {
			member.roles.add(guildData.plugins.autorole.role).catch(() => {});
		}
	}
}
