/**
 * Podclawst WebSocket Connection Manager
 * 
 * Manages the WebSocket connection to the Podclawst server,
 * handles reconnection, and dispatches messages.
 */

import type {
  PodclawstAccount,
  ServerMessage,
  RoomState,
  InboundTranscript,
  Participant,
} from "./types.js";

export interface ConnectionCallbacks {
  onTranscript: (transcript: InboundTranscript) => void;
  onParticipantJoined: (participant: Participant, roomId: string) => void;
  onParticipantLeft: (participantId: string, roomId: string, reason?: string) => void;
  onConnected: (state: RoomState) => void;
  onDisconnected: (reason?: string) => void;
  onError: (error: string) => void;
  onAvatarReady: (url: string) => void;
}

export class PodclawstConnection {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private participantId: string | null = null;
  private participants: Participant[] = [];
  private avatarUrl: string | null = null;
  private reconnecting = false;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private serverUrl: string,
    private account: PodclawstAccount,
    private callbacks: ConnectionCallbacks,
    private reconnectDelayMs: number = 3000,
  ) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }

  get state(): RoomState | null {
    if (!this.roomId || !this.participantId) {
      return null;
    }
    return {
      roomId: this.roomId,
      participantId: this.participantId,
      participants: this.participants,
      connected: this.connected,
      avatarUrl: this.avatarUrl ?? undefined,
    };
  }

  async connect(roomId: string): Promise<void> {
    if (this.ws) {
      await this.disconnect();
    }

    this.roomId = roomId;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    return this.establishConnection();
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.serverUrl}?room=${this.roomId}&claw=${this.account.clawId}`;
      
      try {
        this.ws = new WebSocket(url);
      } catch (error) {
        reject(new Error(`Failed to create WebSocket: ${error}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        this.sendJoin();
      };

      this.ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : event.data.toString();
        try {
          const message = JSON.parse(data) as ServerMessage;
          this.handleMessage(message, resolve);
        } catch {
          console.error("[podclawst] Failed to parse message:", data);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        this.callbacks.onError(`WebSocket error: ${error}`);
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        this.handleDisconnect(event.reason || "Connection closed");
        
        if (!this.connected && this.reconnectAttempts === 0) {
          reject(new Error("Connection closed before established"));
        }
      };
    });
  }

  private sendJoin(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: "join",
      clawId: this.account.clawId,
      name: this.account.displayName || this.account.clawId,
      voiceId: this.account.voiceId,
      avatarPrompt: this.account.avatarPrompt,
    };

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(message: ServerMessage, resolveConnect?: (value: void) => void): void {
    switch (message.type) {
      case "connected":
        this.participantId = message.participantId;
        this.participants = message.participants;
        this.callbacks.onConnected({
          roomId: this.roomId!,
          participantId: message.participantId,
          participants: message.participants,
          connected: true,
        });
        resolveConnect?.();
        break;

      case "transcript":
        // Don't echo back our own messages
        if (message.speakerId === this.participantId) {
          return;
        }
        this.callbacks.onTranscript({
          roomId: this.roomId!,
          speakerId: message.speakerId,
          speakerName: message.speakerName,
          speakerType: message.speakerType,
          text: message.text,
          timestamp: message.timestamp,
          messageId: message.id,
        });
        break;

      case "participant_joined":
        this.participants = [...this.participants, message.participant];
        this.callbacks.onParticipantJoined(message.participant, this.roomId!);
        break;

      case "participant_left":
        this.participants = this.participants.filter(p => p.id !== message.participantId);
        this.callbacks.onParticipantLeft(message.participantId, this.roomId!, message.reason);
        break;

      case "avatar_ready":
        this.avatarUrl = message.url;
        this.callbacks.onAvatarReady(message.url);
        break;

      case "speak_ack":
        // Message acknowledged, could track pending messages
        break;

      case "error":
        this.callbacks.onError(`Server error: ${message.code} - ${message.message}`);
        break;
    }
  }

  private handleDisconnect(reason: string): void {
    this.ws = null;
    this.callbacks.onDisconnected(reason);

    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnecting = false;
      try {
        await this.establishConnection();
      } catch (error) {
        console.error("[podclawst] Reconnection failed:", error);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  async speak(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to room");
    }

    const message = {
      type: "speak",
      text,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "leave" }));
      }
      this.ws.close();
      this.ws = null;
    }

    this.roomId = null;
    this.participantId = null;
    this.participants = [];
    this.avatarUrl = null;
  }
}

// Connection pool - one connection per account
const connections = new Map<string, PodclawstConnection>();

export function getConnection(accountId: string): PodclawstConnection | undefined {
  return connections.get(accountId);
}

export function setConnection(accountId: string, connection: PodclawstConnection): void {
  connections.set(accountId, connection);
}

export function removeConnection(accountId: string): void {
  const conn = connections.get(accountId);
  if (conn) {
    conn.disconnect();
    connections.delete(accountId);
  }
}

export function getAllConnections(): Map<string, PodclawstConnection> {
  return connections;
}
