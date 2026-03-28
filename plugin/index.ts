/**
 * Podclawst OpenClaw Plugin - Phase 0
 * 
 * Minimal plugin that:
 * - Connects to a Podclawst server via WebSocket
 * - Sends text messages
 * - Receives and buffers responses
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

interface PodclawstConfig {
  serverUrl?: string;
}

interface Connection {
  ws: WebSocket;
  buffer: Array<{ type: string; data: unknown; receivedAt: number }>;
  connected: boolean;
}

// Single connection per gateway (Phase 0 simplicity)
let connection: Connection | null = null;

export default function register(api: OpenClawPluginApi) {
  const logger = api.logger.child({ plugin: "podclawst" });

  api.registerTool({
    name: "podclawst",
    description: "Connect to Podclawst live rooms. Actions: join (connect to server), speak (send text), status (check connection), messages (get received messages), leave (disconnect).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["join", "speak", "status", "messages", "leave"],
          description: "Action to perform"
        },
        text: {
          type: "string",
          description: "Text to send (for speak action)"
        }
      },
      required: ["action"]
    },

    async execute(_sessionId, params: { action: string; text?: string }) {
      const config = api.runtime.config.loadConfig()?.plugins?.entries?.podclawst?.config as PodclawstConfig | undefined;
      const serverUrl = config?.serverUrl || "ws://localhost:3456/ws";

      const { action, text } = params;

      switch (action) {
        case "join":
          return handleJoin(serverUrl, logger);

        case "speak":
          return handleSpeak(text, logger);

        case "status":
          return handleStatus();

        case "messages":
          return handleMessages();

        case "leave":
          return handleLeave(logger);

        default:
          return { content: [{ type: "text", text: `Unknown action: ${action}` }] };
      }
    }
  });

  logger.info("Podclawst plugin loaded (Phase 0)");
}

async function handleJoin(serverUrl: string, logger: any) {
  if (connection?.connected) {
    return { content: [{ type: "text", text: "Already connected. Use 'leave' first to reconnect." }] };
  }

  return new Promise((resolve) => {
    try {
      logger.info(`Connecting to ${serverUrl}`);
      const ws = new WebSocket(serverUrl);

      connection = {
        ws,
        buffer: [],
        connected: false
      };

      ws.onopen = () => {
        logger.info("WebSocket connected");
        connection!.connected = true;
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : event.data.toString();
        logger.info(`Received: ${data}`);

        try {
          const parsed = JSON.parse(data);
          connection!.buffer.push({
            type: parsed.type || "unknown",
            data: parsed,
            receivedAt: Date.now()
          });

          // If this is the initial "connected" message, resolve
          if (parsed.type === "connected") {
            resolve({
              content: [{
                type: "text",
                text: `Connected to Podclawst server!\n\nServer message: ${parsed.message || "Welcome"}\n\nUse podclawst(action="speak", text="...") to send messages.`
              }]
            });
          }
        } catch {
          connection!.buffer.push({
            type: "raw",
            data,
            receivedAt: Date.now()
          });
        }
      };

      ws.onerror = (error) => {
        logger.error("WebSocket error:", error);
        resolve({
          content: [{ type: "text", text: `Connection error: ${error}` }]
        });
      };

      ws.onclose = () => {
        logger.info("WebSocket closed");
        if (connection) {
          connection.connected = false;
        }
      };

      // Timeout if no connection after 5 seconds
      setTimeout(() => {
        if (!connection?.connected) {
          resolve({
            content: [{ type: "text", text: `Connection timeout. Is the server running at ${serverUrl}?` }]
          });
        }
      }, 5000);

    } catch (error) {
      resolve({
        content: [{ type: "text", text: `Failed to connect: ${error}` }]
      });
    }
  });
}

function handleSpeak(text: string | undefined, logger: any) {
  if (!connection?.connected) {
    return { content: [{ type: "text", text: "Not connected. Use join first." }] };
  }

  if (!text) {
    return { content: [{ type: "text", text: "No text provided. Use: podclawst(action=\"speak\", text=\"your message\")" }] };
  }

  const message = JSON.stringify({
    type: "speak",
    text,
    timestamp: Date.now()
  });

  logger.info(`Sending: ${message}`);
  connection.ws.send(message);

  return {
    content: [{
      type: "text",
      text: `Sent: "${text}"\n\nUse podclawst(action="messages") to see server responses.`
    }]
  };
}

function handleStatus() {
  if (!connection) {
    return { content: [{ type: "text", text: "Not connected. Use join to connect." }] };
  }

  return {
    content: [{
      type: "text",
      text: `Connected: ${connection.connected}\nBuffered messages: ${connection.buffer.length}`
    }]
  };
}

function handleMessages() {
  if (!connection) {
    return { content: [{ type: "text", text: "Not connected." }] };
  }

  if (connection.buffer.length === 0) {
    return { content: [{ type: "text", text: "No messages in buffer." }] };
  }

  // Return and clear buffer
  const messages = connection.buffer.map(m => {
    if (m.type === "echo" && typeof m.data === "object") {
      const echo = m.data as { yourMessage?: string; serverTime?: number };
      return `[echo] Server echoed: "${echo.yourMessage}" at ${new Date(echo.serverTime || 0).toISOString()}`;
    }
    return `[${m.type}] ${JSON.stringify(m.data)}`;
  }).join("\n");

  connection.buffer = [];

  return {
    content: [{ type: "text", text: `Messages:\n${messages}` }]
  };
}

function handleLeave(logger: any) {
  if (!connection) {
    return { content: [{ type: "text", text: "Not connected." }] };
  }

  logger.info("Disconnecting");
  connection.ws.close();
  connection = null;

  return { content: [{ type: "text", text: "Disconnected from Podclawst server." }] };
}
