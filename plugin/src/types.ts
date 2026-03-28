/**
 * Podclawst Plugin Types
 */

// ============ Config Types ============

export interface PodclawstAccount {
  id: string;
  enabled: boolean;
  clawId: string;
  displayName?: string;
  voiceId?: string;
  avatarPrompt?: string;
}

export interface PodclawstConfig {
  serverUrl: string;
  accounts?: PodclawstAccount[];
  defaultAccount?: string;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
}

// ============ Server Protocol Types ============

// Client → Server
export interface JoinMessage {
  type: "join";
  clawId: string;
  name: string;
  voiceId?: string;
  avatarPrompt?: string;
}

export interface SpeakMessage {
  type: "speak";
  text: string;
  timestamp: number;
}

export interface LeaveMessage {
  type: "leave";
}

export type ClientMessage = JoinMessage | SpeakMessage | LeaveMessage;

// Server → Client
export interface ConnectedMessage {
  type: "connected";
  roomId: string;
  participantId: string;
  participants: Participant[];
  serverTime: number;
}

export interface TranscriptMessage {
  type: "transcript";
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: "human" | "claw";
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface ParticipantJoinedMessage {
  type: "participant_joined";
  participant: Participant;
}

export interface ParticipantLeftMessage {
  type: "participant_left";
  participantId: string;
  reason?: "left" | "kicked" | "disconnected";
}

export interface AvatarReadyMessage {
  type: "avatar_ready";
  url: string;
}

export interface SpeakAckMessage {
  type: "speak_ack";
  id: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | ConnectedMessage
  | TranscriptMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | AvatarReadyMessage
  | SpeakAckMessage
  | ErrorMessage;

// ============ Shared Types ============

export interface Participant {
  id: string;
  name: string;
  type: "human" | "claw";
  avatarUrl?: string;
  speaking: boolean;
}

export interface RoomState {
  roomId: string;
  participantId: string;
  participants: Participant[];
  connected: boolean;
  avatarUrl?: string;
}

// ============ Inbound Message Types ============

export interface InboundTranscript {
  roomId: string;
  speakerId: string;
  speakerName: string;
  speakerType: "human" | "claw";
  text: string;
  timestamp: number;
  messageId: string;
}
