/**
 * Podclawst Server - Phase 0: Echo Chamber
 * 
 * The dumbest possible WebSocket server:
 * - Accepts connections on /ws
 * - Logs all incoming messages
 * - Echoes them back with timestamp
 */

const PORT = process.env.PORT || 3456;

const server = Bun.serve({
  port: PORT,
  
  fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { connectedAt: Date.now() }
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    
    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", phase: 0 });
    }
    
    // Info
    if (url.pathname === "/") {
      return Response.json({
        name: "podclawst",
        phase: 0,
        description: "Echo chamber - connect via WebSocket at /ws"
      });
    }
    
    return new Response("Not found", { status: 404 });
  },
  
  websocket: {
    open(ws) {
      console.log(`[${timestamp()}] 🔌 Client connected`);
      ws.send(JSON.stringify({
        type: "connected",
        serverTime: Date.now(),
        message: "Welcome to Podclawst (Phase 0 - Echo Chamber)"
      }));
    },
    
    message(ws, message) {
      const text = typeof message === "string" ? message : message.toString();
      console.log(`[${timestamp()}] 📥 Received: ${text}`);
      
      try {
        const parsed = JSON.parse(text);
        
        // Echo back with metadata
        const response = {
          type: "echo",
          received: parsed,
          serverTime: Date.now(),
          yourMessage: parsed.text || parsed.message || text
        };
        
        console.log(`[${timestamp()}] 📤 Sending: ${JSON.stringify(response)}`);
        ws.send(JSON.stringify(response));
        
      } catch {
        // Not JSON, echo as plain text
        const response = {
          type: "echo",
          received: text,
          serverTime: Date.now()
        };
        ws.send(JSON.stringify(response));
      }
    },
    
    close(ws, code, reason) {
      console.log(`[${timestamp()}] 🔌 Client disconnected (code: ${code}, reason: ${reason || "none"})`);
    },
    
    error(ws, error) {
      console.error(`[${timestamp()}] ❌ WebSocket error:`, error);
    }
  }
});

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🎙️ PODCLAWST SERVER                    ║
║                     Phase 0: Echo Chamber                 ║
╠═══════════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                        ║
║  WebSocket: ws://localhost:${PORT}/ws                       ║
║  Health:    http://localhost:${PORT}/health                 ║
╚═══════════════════════════════════════════════════════════╝
`);
