import type Atlanta from "../base/Atlanta.js";
import { handleGameVoxPacket } from "../base/GameVoxSettings.js";

/**
 * Every gateway dispatch, before discord.js decides whether it knows what to
 * do with it.
 *
 * GameVox sends APP_SETTINGS_REQUEST here when an operator opens this app's
 * Settings panel in Server Settings ▸ Apps. discord.js has no handler for an
 * event it does not ship, so the packet would otherwise be dropped — but it is
 * emitted on `raw` first, which is exactly what this hook is for. Against real
 * Discord the event never arrives and this stays a no-op.
 *
 * Keep it cheap: this runs for every packet on the socket.
 */
export default class RawEvent {
	client: Atlanta;

	constructor(client: Atlanta) {
		this.client = client;
	}

	run(packet: unknown): void {
		handleGameVoxPacket(this.client, packet);
	}
}
