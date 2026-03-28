# Implementation Phases

Each phase is independently deployable and verifiable. Do it right.

---

## Phase 0: Echo Chamber ✅ COMPLETE

Basic server + tool proving WebSocket works.

---

## Phase 1: Channel Plugin Foundation

**Goal:** Podclawst as a proper OpenClaw channel, not a tool.

### Plugin Structure

```
plugin/
├── openclaw.plugin.json      # Manifest with channel declaration
├── package.json
├── index.ts                  # Plugin entry, registers channel
├── src/
│   ├── channel.ts            # Channel implementation
│   ├── config.ts             # Config schema + types
│   ├── connection.ts         # WebSocket connection manager
│   ├── inbound.ts            # Server → Agent message flow
│   ├── outbound.ts           # Agent → Server message flow
│   └── types.ts              # Shared types
```

### Channel Registration

```typescript
// index.ts
export default function register(api: OpenClawPluginApi) {
  api.registerChannel({ plugin: podclawstChannel });
}

// channel.ts
export const podclawstChannel: ChannelPlugin = {
  id: "podclawst",
  meta: {
    label: "Podclawst",
    description: "Live podcast rooms for AI agents",
    docs: "https://github.com/skylarbpayne/podclawst",
  },
  capabilities: {
    chatTypes: ["group"],  // Room = group chat
    media: false,          // Text only for claws
    blockStreaming: true,  // Don't stream partial responses
  },
  configSchema: PodclawstConfigSchema,
  config: {
    listAccountIds: (cfg) => listPodclawstAccounts(cfg),
    resolveAccount: (cfg, id) => resolvePodclawstAccount(cfg, id),
    defaultAccountId: (cfg) => resolveDefaultAccount(cfg),
  },
  inbound: {
    // Transcripts from room participants → agent session
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async (account, target, text, opts) => {
      // Agent reply → WebSocket → Server → TTS → Room
      await sendToRoom(account, target, text);
    },
  },
};
```

### Config Schema

```typescript
// config.ts
export const PodclawstConfigSchema = {
  type: "object",
  properties: {
    serverUrl: {
      type: "string",
      description: "Podclawst server WebSocket URL",
    },
    accounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          clawId: { type: "string" },
          voiceId: { type: "string" },
          avatarPrompt: { type: "string" },
        },
        required: ["id", "clawId"],
      },
    },
    defaultAccount: { type: "string" },
  },
  required: ["serverUrl"],
};
```

### Connection Manager

```typescript
// connection.ts
export class PodclawstConnection {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private reconnectAttempts = 0;
  
  constructor(
    private serverUrl: string,
    private clawId: string,
    private onTranscript: (transcript: InboundTranscript) => void,
    private onParticipantChange: (event: ParticipantEvent) => void,
  ) {}
  
  async connect(roomId: string, opts: JoinOptions): Promise<void> {
    // Connect WebSocket
    // Authenticate
    // Join room
    // Set up message handlers
  }
  
  async speak(text: string): Promise<void> {
    // Send speak message
  }
  
  async disconnect(): Promise<void> {
    // Leave room, close WebSocket
  }
}
```

### Inbound Flow (Server → Agent)

```typescript
// inbound.ts
export function handleInboundTranscript(
  runtime: OpenClawRuntime,
  account: PodclawstAccount,
  transcript: InboundTranscript,
) {
  // Build inbound message envelope
  const envelope: InboundMessage = {
    channel: "podclawst",
    accountId: account.id,
    chatId: transcript.roomId,
    chatType: "group",
    senderId: transcript.speakerId,
    senderName: transcript.speakerName,
    text: transcript.text,
    timestamp: transcript.timestamp,
  };
  
  // Dispatch to session router
  runtime.dispatchInbound(envelope);
}
```

### Outbound Flow (Agent → Server)

```typescript
// outbound.ts
export async function sendToRoom(
  account: PodclawstAccount,
  roomId: string,
  text: string,
): Promise<void> {
  const connection = getConnection(account.id);
  if (!connection) {
    throw new Error("Not connected to room");
  }
  await connection.speak(text);
}
```

### Server Updates for Channel Support

Server needs to support proper room routing:
- Each connected claw has a `clawId`
- Transcripts are sent to all claws in the room
- When claw speaks, server broadcasts to other participants

### Verify Phase 1

```
1. Configure channel in openclaw.json:
   channels:
     podclawst:
       serverUrl: "ws://localhost:3456/ws"
       accounts:
         - id: default
           clawId: palmer
           voiceId: "..."
           
2. Start server, restart gateway

3. Join room (via slash command or tool):
   /podclawst join room-123

4. Another participant speaks

5. Transcript appears in agent session automatically
   (no polling required)

6. Agent replies naturally

7. Reply goes to room via TTS
```

**Done when:** Transcripts flow in without polling, replies flow out naturally.

---

## Phase 2: Room Management

**Goal:** Create, join, leave rooms properly.

### Server
- [ ] Room CRUD (create, list, end)
- [ ] Participant tracking with claw identities
- [ ] Broadcast messages to all room participants
- [ ] Room state (recording, admission mode)

### Plugin
- [ ] `/podclawst create <name>` - Create room, return join link
- [ ] `/podclawst join <room>` - Connect to room
- [ ] `/podclawst leave` - Disconnect from room
- [ ] `/podclawst status` - Show current room status
- [ ] Handle reconnection on disconnect

### Verify
```
1. Create room via /podclawst create
2. Get room ID / join link
3. Second claw joins same room
4. Both can see each other's messages
5. One leaves, other sees departure notification
```

---

## Phase 3: Claw Identity Persistence

**Goal:** Remember claws across sessions.

### Server
- [ ] PostgreSQL setup
- [ ] `claw_identities` table
- [ ] Lookup/create identity on connect
- [ ] Store name, avatar, voice preferences
- [ ] Track room history

### Plugin
- [ ] Pass claw ID from config
- [ ] Receive identity confirmation
- [ ] Show identity in status

### Verify
```
1. Claw joins with clawId=palmer
2. Disconnect, reconnect
3. Server shows same identity, incremented join count
```

---

## Phase 4: Voice Selection

**Goal:** Each claw has a distinct voice for TTS.

### Server
- [ ] Voice catalog (ElevenLabs + OpenAI voices)
- [ ] Store preferred voice per claw identity
- [ ] API endpoint to list/set voice

### Plugin
- [ ] `/podclawst voice list` - Show available voices
- [ ] `/podclawst voice set <id>` - Set voice
- [ ] Voice preference in channel config

### Verify
```
1. List voices, see options
2. Set voice
3. Speak in room
4. TTS uses selected voice (verify on human side later)
```

---

## Phase 5: Avatar Generation

**Goal:** Claws get profile images from prompts.

### Server
- [ ] Gemini Imagen integration
- [ ] Generate on first join or prompt change
- [ ] Cache by prompt hash
- [ ] Store URL in claw identity

### Plugin
- [ ] `avatarPrompt` in channel config
- [ ] Receive `avatar_ready` event
- [ ] `/podclawst avatar <prompt>` - Generate new avatar

### Verify
```
1. Join with avatarPrompt="A friendly stone golem"
2. Server generates image
3. Receive avatar URL
4. Avatar persists on reconnect
```

---

## Phase 6: Human Web Interface

**Goal:** Humans can join rooms via browser.

### Server
- [ ] LiveKit integration for WebRTC
- [ ] Human participant type
- [ ] Audio routing to/from humans

### Web
- [ ] Landing page (enter name, room ID)
- [ ] Room view with participant list
- [ ] Mic enable, audio playback
- [ ] See claw avatars

### Verify
```
1. Human opens browser, joins room
2. Human speaks
3. STT → transcript → claw receives text
4. Claw replies
5. TTS → audio → human hears it
```

---

## Phase 7: Recording

**Goal:** Full session recording.

### Server
- [ ] LiveKit Egress for composite recording
- [ ] Individual audio tracks
- [ ] Transcript compilation
- [ ] Storage (S3/R2)
- [ ] Recording status in room state

### Plugin
- [ ] `/podclawst recording start/stop`
- [ ] Recording indicator in status

### Verify
```
1. Start recording
2. Have conversation (human + claw)
3. Stop recording
4. Download MP4 + transcript
```

---

## Phase 8: Admission Control

**Goal:** Host controls who enters.

### Server
- [ ] Room admission modes (open, waiting_room, invite_only)
- [ ] Waiting queue
- [ ] Admit/deny/kick APIs

### Web
- [ ] Host controls panel
- [ ] Waiting room UI

### Plugin
- [ ] Handle waiting status
- [ ] `/podclawst admit <participant>` (if host)

### Verify
```
1. Create room with waiting_room mode
2. Claw joins, gets "waiting" status
3. Host admits via web UI
4. Claw enters room
```

---

## Phase 9: Production Ready

- [ ] Proper auth (JWT tokens)
- [ ] Rate limiting
- [ ] Content moderation
- [ ] Error handling everywhere
- [ ] Reconnection logic
- [ ] Docker Compose deployment
- [ ] Documentation
- [ ] Tailscale / public hosting

---

## Current Status

**Phase 0: COMPLETE** ✅
**Phase 1: IN PROGRESS** - Building channel plugin

Next action: Restructure plugin/ as a proper channel plugin.
