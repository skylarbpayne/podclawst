/**
 * Podclawst Server - Phase 1: Room Support
 * 
 * WebSocket server with:
 * - Room-based participant management
 * - Broadcast messages to room participants
 * - Claw identity tracking
 */

const PORT = process.env.PORT || 3456;

// ============ Types ============

interface Participant {
  id: string;
  ws: unknown; // WebSocket
  clawId: string;
  name: string;
  type: "claw";
  roomId: string;
  joinedAt: number;
  avatarUrl?: string;
  voiceId?: string;
}

interface Room {
  id: string;
  participants: Map<string, Participant>;
  createdAt: number;
}

// ============ State ============

const rooms = new Map<string, Room>();
const participantsByWs = new WeakMap<object, Participant>();
let participantIdCounter = 0;

function generateParticipantId(): string {
  return `p_${Date.now().toString(36)}_${(++participantIdCounter).toString(36)}`;
}

function generateMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ Room Management ============

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      participants: new Map(),
      createdAt: Date.now(),
    };
    rooms.set(roomId, room);
    console.log(`[${timestamp()}] 🏠 Room created: ${roomId}`);
  }
  return room;
}

function removeParticipant(participant: Participant, reason: string = "left"): void {
  const room = rooms.get(participant.roomId);
  if (!room) return;

  room.participants.delete(participant.id);
  console.log(`[${timestamp()}] 👋 ${participant.name} left room ${participant.roomId} (${reason})`);

  // Notify other participants
  broadcastToRoom(room, {
    type: "participant_left",
    participantId: participant.id,
    reason,
  }, participant.id);

  // Clean up empty rooms
  if (room.participants.size === 0) {
    rooms.delete(room.id);
    console.log(`[${timestamp()}] 🏠 Room deleted (empty): ${room.id}`);
  }
}

function broadcastToRoom(room: Room, message: unknown, excludeId?: string): void {
  const json = JSON.stringify(message);
  for (const [id, p] of room.participants) {
    if (id === excludeId) continue;
    try {
      (p.ws as { send: (data: string) => void }).send(json);
    } catch (error) {
      console.error(`[${timestamp()}] Failed to send to ${p.name}:`, error);
    }
  }
}

function getParticipantList(room: Room): Array<{
  id: string;
  name: string;
  type: "claw" | "human";
  avatarUrl?: string;
  speaking: boolean;
}> {
  return Array.from(room.participants.values()).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    avatarUrl: p.avatarUrl,
    speaking: false,
  }));
}

// ============ Server ============

const server = Bun.serve({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") || "default";
      const clawId = url.searchParams.get("claw") || "anonymous";
      
      const upgraded = server.upgrade(req, {
        data: { roomId, clawId, connectedAt: Date.now() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        phase: 1,
        rooms: rooms.size,
        totalParticipants: Array.from(rooms.values()).reduce(
          (sum, r) => sum + r.participants.size,
          0
        ),
      });
    }

    // Room info
    if (url.pathname.startsWith("/api/rooms/")) {
      const roomId = url.pathname.split("/")[3];
      const room = rooms.get(roomId);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }
      return Response.json({
        id: room.id,
        participants: getParticipantList(room),
        createdAt: room.createdAt,
      });
    }

    // List rooms
    if (url.pathname === "/api/rooms") {
      const roomList = Array.from(rooms.values()).map((r) => ({
        id: r.id,
        participantCount: r.participants.size,
        createdAt: r.createdAt,
      }));
      return Response.json({ rooms: roomList });
    }

    // Info
    if (url.pathname === "/") {
      return Response.json({
        name: "podclawst",
        phase: 1,
        description: "Connect via WebSocket at /ws?room=<roomId>&claw=<clawId>",
      });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      const data = ws.data as { roomId: string; clawId: string; connectedAt: number };
      console.log(`[${timestamp()}] 🔌 Connection opened: claw=${data.clawId} room=${data.roomId}`);
      
      // Don't join room yet - wait for join message with full details
    },

    message(ws, message) {
      const data = ws.data as { roomId: string; clawId: string };
      const text = typeof message === "string" ? message : message.toString();

      try {
        const parsed = JSON.parse(text);
        handleMessage(ws, data, parsed);
      } catch (error) {
        console.error(`[${timestamp()}] ❌ Failed to parse message:`, text);
        ws.send(JSON.stringify({
          type: "error",
          code: "invalid_message",
          message: "Failed to parse message",
        }));
      }
    },

    close(ws, code, reason) {
      const participant = participantsByWs.get(ws);
      if (participant) {
        removeParticipant(participant, "disconnected");
        participantsByWs.delete(ws);
      }
      console.log(`[${timestamp()}] 🔌 Connection closed (code: ${code})`);
    },

    error(ws, error) {
      console.error(`[${timestamp()}] ❌ WebSocket error:`, error);
    },
  },
});

// ============ Message Handlers ============

function handleMessage(
  ws: unknown,
  data: { roomId: string; clawId: string },
  message: { type: string; [key: string]: unknown }
): void {
  switch (message.type) {
    case "join":
      handleJoin(ws, data, message);
      break;

    case "speak":
      handleSpeak(ws, message);
      break;

    case "leave":
      handleLeave(ws);
      break;

    default:
      console.log(`[${timestamp()}] ❓ Unknown message type: ${message.type}`);
  }
}

function handleJoin(
  ws: unknown,
  data: { roomId: string; clawId: string },
  message: { clawId?: string; name?: string; voiceId?: string; avatarPrompt?: string }
): void {
  const room = getOrCreateRoom(data.roomId);
  const participantId = generateParticipantId();

  const participant: Participant = {
    id: participantId,
    ws,
    clawId: message.clawId || data.clawId,
    name: (message.name as string) || data.clawId,
    type: "claw",
    roomId: data.roomId,
    joinedAt: Date.now(),
    voiceId: message.voiceId as string | undefined,
  };

  room.participants.set(participantId, participant);
  participantsByWs.set(ws as object, participant);

  console.log(`[${timestamp()}] 👋 ${participant.name} joined room ${data.roomId}`);

  // Send connected message to the new participant
  (ws as { send: (data: string) => void }).send(JSON.stringify({
    type: "connected",
    roomId: data.roomId,
    participantId,
    participants: getParticipantList(room),
    serverTime: Date.now(),
    message: `Welcome to room ${data.roomId}!`,
  }));

  // Notify other participants
  broadcastToRoom(room, {
    type: "participant_joined",
    participant: {
      id: participantId,
      name: participant.name,
      type: "claw",
      avatarUrl: participant.avatarUrl,
      speaking: false,
    },
  }, participantId);

  // TODO: Avatar generation (Phase 5)
  if (message.avatarPrompt) {
    console.log(`[${timestamp()}] 🎨 Avatar requested: "${message.avatarPrompt}" (not implemented yet)`);
  }
}

function handleSpeak(ws: unknown, message: { text?: string }): void {
  const participant = participantsByWs.get(ws as object);
  if (!participant) {
    (ws as { send: (data: string) => void }).send(JSON.stringify({
      type: "error",
      code: "not_in_room",
      message: "Must join a room before speaking",
    }));
    return;
  }

  const text = message.text as string;
  if (!text) {
    return;
  }

  const room = rooms.get(participant.roomId);
  if (!room) {
    return;
  }

  console.log(`[${timestamp()}] 💬 ${participant.name}: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);

  // Send acknowledgment to speaker
  (ws as { send: (data: string) => void }).send(JSON.stringify({
    type: "speak_ack",
    id: generateMessageId(),
  }));

  // Broadcast transcript to all OTHER participants
  broadcastToRoom(room, {
    type: "transcript",
    id: generateMessageId(),
    speakerId: participant.id,
    speakerName: participant.name,
    speakerType: "claw",
    text,
    isFinal: true,
    timestamp: Date.now(),
  }, participant.id);
}

function handleLeave(ws: unknown): void {
  const participant = participantsByWs.get(ws as object);
  if (participant) {
    removeParticipant(participant, "left");
    participantsByWs.delete(ws as object);
  }
}

// ============ Utilities ============

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

// ============ Startup ============

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🎙️ PODCLAWST SERVER                    ║
║                     Phase 1: Room Support                 ║
╠═══════════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                        ║
║  WebSocket: ws://localhost:${PORT}/ws?room=<id>&claw=<id>   ║
║  Health:    http://localhost:${PORT}/health                 ║
║  Rooms:     http://localhost:${PORT}/api/rooms              ║
╚═══════════════════════════════════════════════════════════╝
`);
