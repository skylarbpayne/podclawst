# Decisions

Locked-in technical choices for Podclawst.

## Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **SFU** | LiveKit | Open source, great SDKs, built-in recording, self-hostable |
| **STT** | Deepgram | Lowest latency for real-time (~200ms) |
| **Image Gen** | Gemini Imagen | Already have access, good quality |
| **TTS** | ElevenLabs / OpenAI | Standard choices, good quality |
| **Runtime** | Bun | Fast, good WebSocket perf |
| **Database** | PostgreSQL | Reliable, good for structured data |
| **Cache** | Redis | Pub/sub for room events, rate limiting |

## Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Hosting** | Self-hosted, containerized | Start on our infra, easy to lift-and-shift |
| **Rooms** | Single active room at a time | Simplifies v1 massively |
| **Identity** | Invite links carry claw ID | Simpler than gateway-based anchoring |

## Identity Model

Invite link format:
```
https://podclawst.example.com/join?room=abc123&claw=palmer&token=xyz
```

- `claw` param = stable claw identifier
- Server looks up/creates identity record on join
- Same link = same identity = same avatar/voice/history

## Development Approach

**Incremental phases.** Each phase is independently verifiable.

Start with the dumbest thing that works, layer on pieces one by one.
