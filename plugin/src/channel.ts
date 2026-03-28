/**
 * Podclawst Channel Implementation
 * 
 * Registers Podclawst as a proper OpenClaw channel,
 * handling inbound transcripts and outbound messages.
 */

import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import type { PodclawstConfig, PodclawstAccount, InboundTranscript } from "./types.js";
import {
  PodclawstConnection,
  getConnection,
  setConnection,
  removeConnection,
} from "./connection.js";

// Resolved account with runtime state
interface ResolvedPodclawstAccount {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  config: PodclawstAccount;
  serverUrl: string;
}

// Runtime reference for dispatching inbound messages
let runtime: {
  dispatchInbound?: (envelope: unknown) => void;
  logger?: { info: (msg: string) => void; error: (msg: string, ...args: unknown[]) => void };
} | null = null;

export function setRuntime(r: typeof runtime): void {
  runtime = r;
}

// ============ Config Accessors ============

function getPodclawstConfig(cfg: unknown): PodclawstConfig | null {
  // Config is under plugins.entries.podclawst.config, not channels.podclawst
  const config = cfg as { 
    plugins?: { 
      entries?: { 
        podclawst?: { 
          config?: PodclawstConfig 
        } 
      } 
    } 
  };
  return config?.plugins?.entries?.podclawst?.config ?? null;
}

function listAccountIds(cfg: unknown): string[] {
  const podclawstConfig = getPodclawstConfig(cfg);
  if (!podclawstConfig?.accounts?.length) {
    return ["default"];
  }
  return podclawstConfig.accounts.map((a) => a.id);
}

function resolveAccount(cfg: unknown, accountId: string): ResolvedPodclawstAccount | null {
  const podclawstConfig = getPodclawstConfig(cfg);
  if (!podclawstConfig) {
    return null;
  }

  const accounts = podclawstConfig.accounts ?? [];
  const account = accounts.find((a) => a.id === accountId);

  if (!account) {
    // Return a default account if none configured
    if (accountId === "default" && accounts.length === 0) {
      return {
        accountId: "default",
        name: "Default",
        enabled: true,
        configured: false,
        config: {
          id: "default",
          enabled: true,
          clawId: "default-claw",
        },
        serverUrl: podclawstConfig.serverUrl,
      };
    }
    return null;
  }

  return {
    accountId: account.id,
    name: account.displayName || account.id,
    enabled: account.enabled !== false,
    configured: true,
    config: account,
    serverUrl: podclawstConfig.serverUrl,
  };
}

function resolveDefaultAccountId(cfg: unknown): string {
  const podclawstConfig = getPodclawstConfig(cfg);
  if (podclawstConfig?.defaultAccount) {
    return podclawstConfig.defaultAccount;
  }
  const accounts = podclawstConfig?.accounts ?? [];
  return accounts[0]?.id ?? "default";
}

// ============ Inbound Handler ============

function handleTranscript(
  account: ResolvedPodclawstAccount,
  transcript: InboundTranscript,
): void {
  if (!runtime?.dispatchInbound) {
    runtime?.logger?.error("[podclawst] No runtime available for inbound dispatch");
    return;
  }

  // Build the inbound message envelope
  // This follows the OpenClaw inbound message format
  const envelope = {
    channel: "podclawst",
    accountId: account.accountId,
    chatId: `room:${transcript.roomId}`,
    chatType: "group" as const,
    senderId: transcript.speakerId,
    senderName: transcript.speakerName,
    text: transcript.text,
    timestamp: transcript.timestamp,
    messageId: transcript.messageId,
    metadata: {
      speakerType: transcript.speakerType,
      roomId: transcript.roomId,
    },
  };

  runtime.logger?.info(`[podclawst] Dispatching inbound: ${transcript.speakerName}: ${transcript.text.slice(0, 50)}...`);
  runtime.dispatchInbound(envelope);
}

// ============ Outbound Handler ============

async function sendText(
  account: ResolvedPodclawstAccount,
  target: string,
  text: string,
  _opts?: unknown,
): Promise<{ messageId?: string }> {
  const connection = getConnection(account.accountId);
  
  if (!connection?.connected) {
    throw new Error(`Not connected to room. Use /podclawst join <room> first.`);
  }

  await connection.speak(text);
  
  return { messageId: `${Date.now()}` };
}

// ============ Connection Management ============

export async function joinRoom(
  cfg: unknown,
  accountId: string,
  roomId: string,
): Promise<void> {
  const account = resolveAccount(cfg, accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Disconnect existing connection if any
  removeConnection(accountId);

  const connection = new PodclawstConnection(
    account.serverUrl,
    account.config,
    {
      onTranscript: (transcript) => handleTranscript(account, transcript),
      onParticipantJoined: (participant, room) => {
        runtime?.logger?.info(`[podclawst] ${participant.name} joined room ${room}`);
      },
      onParticipantLeft: (participantId, room, reason) => {
        runtime?.logger?.info(`[podclawst] ${participantId} left room ${room} (${reason})`);
      },
      onConnected: (state) => {
        runtime?.logger?.info(`[podclawst] Connected to room ${state.roomId} as ${state.participantId}`);
      },
      onDisconnected: (reason) => {
        runtime?.logger?.info(`[podclawst] Disconnected: ${reason}`);
      },
      onError: (error) => {
        runtime?.logger?.error(`[podclawst] Error: ${error}`);
      },
      onAvatarReady: (url) => {
        runtime?.logger?.info(`[podclawst] Avatar ready: ${url}`);
      },
    },
    3000, // reconnect delay
  );

  await connection.connect(roomId);
  setConnection(accountId, connection);
}

export async function leaveRoom(accountId: string): Promise<void> {
  removeConnection(accountId);
}

export function getRoomState(accountId: string) {
  const connection = getConnection(accountId);
  return connection?.state ?? null;
}

// ============ Channel Plugin Definition ============

export const podclawstChannel: ChannelPlugin<ResolvedPodclawstAccount> = {
  id: "podclawst",
  meta: {
    label: "Podclawst",
    description: "Live podcast rooms for AI agents",
    docs: "https://github.com/skylarbpayne/podclawst",
  },
  capabilities: {
    chatTypes: ["group"],
    media: false,
    blockStreaming: true,
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultAccountId(cfg),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
    }),
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async (account, target, text, opts) => {
      return sendText(account, target, text, opts);
    },
  },
};
