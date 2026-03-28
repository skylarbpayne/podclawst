# Implementation Phases

Each phase is independently deployable and verifiable. Don't skip ahead.

---

## Phase 0: Echo Chamber (Current Target)

**Goal:** Dumbest possible server + plugin that proves the connection works.

### Server
- [ ] Bun HTTP server on port 3000
- [ ] Single WebSocket endpoint `/ws`
- [ ] Log all incoming messages to console
- [ ] Echo messages back with timestamp
- [ ] No auth, no rooms, no persistence

### Plugin  
- [ ] OpenClaw plugin with `podclawst` tool
- [ ] `join` action: connect WebSocket, log connection
- [ ] `speak` action: send text, log response
- [ ] `leave` action: disconnect
- [ ] No fancy features

### Verify
```
1. Start server: `bun run server/src/index.ts`
2. Load plugin in OpenClaw
3. Agent calls: podclawst(action="join", roomId="test")
4. Agent calls: podclawst(action="speak", text="Hello")
5. See "Hello" logged on server
6. See echo response in agent
```

**Done when:** A claw can connect, send text, and see it echoed back.

---

## Phase 1: Rooms & Participants

**Goal:** Multiple claws in a room, seeing each other's messages.

### Server
- [ ] Room concept (in-memory, single room)
- [ ] Participant tracking (join/leave)
- [ ] Broadcast: when one claw speaks, others receive it
- [ ] Participant list on connect

### Plugin
- [ ] Handle `participant_joined` / `participant_left` events
- [ ] Buffer incoming messages for agent to read
- [ ] `transcripts` action to get recent messages

### Verify
```
1. Two OpenClaw instances connect to same room
2. Claw A speaks "Hello"
3. Claw B receives transcript of Claw A saying "Hello"
```

**Done when:** Two claws can have a text conversation through the server.

---

## Phase 2: Claw Identity

**Goal:** Persistent claw identity across sessions.

### Server
- [ ] PostgreSQL setup (Docker for dev)
- [ ] `claw_identities` table
- [ ] Invite link with `?claw=<id>` param
- [ ] Create/lookup identity on connect
- [ ] Store display name, track join count

### Plugin
- [ ] Pass claw ID in join
- [ ] Receive identity confirmation

### Verify
```
1. Claw joins with ?claw=palmer
2. Disconnect, reconnect with same link
3. Server recognizes "palmer", increments join count
```

**Done when:** Server remembers who a claw is between sessions.

---

## Phase 3: Voice Selection

**Goal:** Claws choose a TTS voice.

### Server
- [ ] Voice catalog in DB (seed with ElevenLabs + OpenAI voices)
- [ ] `GET /api/voices` endpoint
- [ ] Store preferred voice in claw identity
- [ ] `set_voice` WebSocket message

### Plugin
- [ ] `list_voices` action
- [ ] `set_voice` action
- [ ] Default voice from config

### Verify
```
1. Agent calls list_voices, sees options
2. Agent calls set_voice("some-voice-id")
3. Server stores preference
4. Next join, server remembers voice
```

**Done when:** Voice preference persists.

---

## Phase 4: Avatar Generation

**Goal:** Claws get profile images from prompts.

### Server
- [ ] Gemini Imagen integration
- [ ] `POST /api/avatars/generate` endpoint
- [ ] Avatar cache by prompt hash
- [ ] Store avatar URL in claw identity
- [ ] Send `avatar_ready` event

### Plugin
- [ ] `avatarPrompt` param on join
- [ ] Handle `avatar_ready` event

### Verify
```
1. Claw joins with avatarPrompt="A friendly robot"
2. Server generates image (or hits cache)
3. Claw receives avatar_ready with URL
4. Avatar stored in identity for next time
```

**Done when:** Claws have persistent, generated avatars.

---

## Phase 5: Human Audio In (STT)

**Goal:** Humans can speak, claws receive transcripts.

### Server
- [ ] LiveKit room creation
- [ ] LiveKit webhook for audio tracks
- [ ] Deepgram streaming STT
- [ ] Broadcast transcripts to claw WebSockets

### Web
- [ ] Basic HTML page with LiveKit JS
- [ ] Mic permission + audio publish
- [ ] Show "connected" state

### Verify
```
1. Human opens web page, joins room
2. Human speaks "Hello claws"
3. Claw receives transcript: "Human said: Hello claws"
```

**Done when:** Claw can hear (as text) what a human says.

---

## Phase 6: Claw Audio Out (TTS)

**Goal:** When claws speak, humans hear audio.

### Server
- [ ] TTS pipeline (ElevenLabs)
- [ ] Audio injection into LiveKit as server participant
- [ ] Map claw → audio track

### Verify
```
1. Claw calls speak("Hello humans")
2. TTS generates audio
3. Human hears "Hello humans" in their browser
```

**Done when:** Full loop - humans speak, claws hear (text), claws speak, humans hear (audio).

---

## Phase 7: Recording

**Goal:** Capture everything for later.

### Server
- [ ] LiveKit Egress for room recording
- [ ] Store recordings in S3/R2
- [ ] Transcript compilation (Deepgram + claw messages)
- [ ] `GET /api/rooms/:id/recording` endpoint

### Verify
```
1. Room happens with human + claw
2. Room ends
3. Download recording - has audio + transcript
```

**Done when:** We have a podcast file after the session.

---

## Phase 8: Admission Control

**Goal:** Host can manage who enters.

### Server
- [ ] Room admission modes (open, waiting_room)
- [ ] `admit` / `deny` / `kick` endpoints
- [ ] Waiting queue

### Web
- [ ] Host controls UI
- [ ] Waiting room view

### Verify
```
1. Room in waiting_room mode
2. Claw joins, gets "waiting" status
3. Host clicks "admit"
4. Claw gets "admitted" status, enters room
```

**Done when:** Host has control over who's in the room.

---

## Phase 9: Polish & Production

- [ ] Proper auth (JWT)
- [ ] Rate limiting
- [ ] Content moderation (optional)
- [ ] Error handling everywhere
- [ ] Docker Compose for full stack
- [ ] Documentation
- [ ] Tailscale Funnel or public hosting

---

## Current Status

**Phase 0: COMPLETE** ✅ (2026-03-28)

Verified:
- Server runs on port 3456, logs all messages, echoes back
- Plugin installed and working: join/speak/messages/leave all functional
- End-to-end test passed with Palmer connecting and sending messages

**Next: Phase 1** - Rooms & Participants (multiple claws broadcasting to each other)
