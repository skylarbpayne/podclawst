/**
 * Podclawst OpenClaw Plugin
 * 
 * Registers Podclawst as a channel for live podcast rooms.
 * Claws can join rooms, receive transcripts, and speak.
 */

import type { OpenClawPluginApi, ChannelPlugin } from "openclaw/plugin-sdk/core";
import { podclawstChannel, setRuntime, joinRoom, leaveRoom, getRoomState } from "./src/channel.js";

export default function register(api: OpenClawPluginApi) {
  const logger = api.logger;

  // Set runtime for inbound message dispatch
  setRuntime({
    dispatchInbound: (envelope) => {
      // TODO: Wire this to actual runtime dispatch when available
      // For now, log that we would dispatch
      logger.info(`[podclawst] Would dispatch inbound: ${JSON.stringify(envelope).slice(0, 200)}`);
    },
    logger,
  });

  // Register the channel
  api.registerChannel({ plugin: podclawstChannel as ChannelPlugin });

  // Register CLI commands for room management
  api.registerCli(({ program }) => {
    const cmd = program.command("podclawst").description("Podclawst live room commands");

    cmd
      .command("join <roomId>")
      .description("Join a Podclawst room")
      .option("-a, --account <id>", "Account ID to use", "default")
      .action(async (roomId: string, opts: { account: string }) => {
        const config = api.runtime.config.loadConfig();
        try {
          await joinRoom(config, opts.account, roomId);
          console.log(`Joined room: ${roomId}`);
        } catch (error) {
          console.error(`Failed to join room: ${error}`);
          process.exit(1);
        }
      });

    cmd
      .command("leave")
      .description("Leave the current room")
      .option("-a, --account <id>", "Account ID", "default")
      .action(async (opts: { account: string }) => {
        await leaveRoom(opts.account);
        console.log("Left room");
      });

    cmd
      .command("status")
      .description("Show current room status")
      .option("-a, --account <id>", "Account ID", "default")
      .action((opts: { account: string }) => {
        const state = getRoomState(opts.account);
        if (!state) {
          console.log("Not connected to any room");
          return;
        }
        console.log(`Room: ${state.roomId}`);
        console.log(`Participant ID: ${state.participantId}`);
        console.log(`Connected: ${state.connected}`);
        console.log(`Participants (${state.participants.length}):`);
        for (const p of state.participants) {
          console.log(`  - ${p.name} (${p.type})${p.speaking ? " [speaking]" : ""}`);
        }
      });
  }, { commands: ["podclawst"] });

  // Register agent tool for room control
  // This allows agents to join/leave rooms programmatically
  api.registerTool({
    name: "podclawst",
    description: "Control Podclawst live room connection. Use 'join' to connect to a room, 'leave' to disconnect, 'status' to check connection state.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["join", "leave", "status"],
          description: "Action to perform",
        },
        roomId: {
          type: "string",
          description: "Room ID to join (required for join action)",
        },
        accountId: {
          type: "string",
          description: "Account ID to use (optional, defaults to 'default')",
        },
      },
      required: ["action"],
    },
    async execute(_sessionId, params: { action: string; roomId?: string; accountId?: string }) {
      const config = api.runtime.config.loadConfig();
      const accountId = params.accountId || "default";

      switch (params.action) {
        case "join": {
          if (!params.roomId) {
            return {
              content: [{ type: "text", text: "Error: roomId is required for join action" }],
            };
          }
          try {
            await joinRoom(config, accountId, params.roomId);
            const state = getRoomState(accountId);
            return {
              content: [{
                type: "text",
                text: `Connected to room: ${params.roomId}\n` +
                  `Participant ID: ${state?.participantId}\n` +
                  `Participants: ${state?.participants.map(p => p.name).join(", ")}\n\n` +
                  `You will now receive transcripts from other participants automatically. ` +
                  `Simply reply to participate in the conversation.`,
              }],
            };
          } catch (error) {
            return {
              content: [{ type: "text", text: `Failed to join room: ${error}` }],
            };
          }
        }

        case "leave": {
          await leaveRoom(accountId);
          return {
            content: [{ type: "text", text: "Disconnected from room" }],
          };
        }

        case "status": {
          const state = getRoomState(accountId);
          if (!state) {
            return {
              content: [{ type: "text", text: "Not connected to any room. Use podclawst(action='join', roomId='...') to connect." }],
            };
          }
          const participantList = state.participants
            .map(p => `- ${p.name} (${p.type})${p.speaking ? " [speaking]" : ""}`)
            .join("\n");
          return {
            content: [{
              type: "text",
              text: `Room: ${state.roomId}\n` +
                `Connected: ${state.connected}\n` +
                `Your ID: ${state.participantId}\n` +
                `Participants:\n${participantList}`,
            }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${params.action}` }],
          };
      }
    },
  });

  logger.info("[podclawst] Plugin registered (channel + tool + CLI)");
}
