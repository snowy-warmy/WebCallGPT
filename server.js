import express from "express";
import { WebSocketServer, WebSocket as WS } from "ws";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Serve static files (frontend)
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ✅ WebSocket bridge between Browser <-> OpenAI
const wss = new WebSocketServer({ server });

wss.on("connection", async (clientSocket) => {
  console.log("🔗 Browser connected");

  try {
    // 1️⃣ Create an ephemeral OpenAI Realtime session
    const sessionResp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "alloy",
        instructions:
          "You are a friendly Dutch sustainability assistant. Speak clearly, answer in Dutch, and help users talk about verduurzaming and eco-friendly home improvements."
      })
    });

    const data = await sessionResp.json();
    if (!data.client_secret?.value) {
      console.error("❌ Failed to create session:", data);
      clientSocket.send(JSON.stringify({ error: "Session creation failed" }));
      return;
    }

    // 2️⃣ Connect to the OpenAI Realtime WebSocket
    const openaiSocket = new WS(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
      {
        headers: {
          "Authorization": `Bearer ${data.client_secret.value}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    // 3️⃣ Setup message queue for safe buffering
    const queue = [];

    openaiSocket.on("open", () => {
      console.log("✅ Connected to OpenAI");
      // Flush queued messages
      while (queue.length > 0) openaiSocket.send(queue.shift());
    });

    // Forward data between both sockets
    clientSocket.on("message", (msg) => {
      if (openaiSocket.readyState === WS.OPEN) {
        openaiSocket.send(msg);
      } else {
        queue.push(msg);
      }
    });

    openaiSocket.on("message", (msg) => clientSocket.send(msg));

    // Cleanup
    clientSocket.on("close", () => openaiSocket.close());
    openaiSocket.on("close", () => clientSocket.close());
    openaiSocket.on("error", (err) => console.error("OpenAI WS error:", err));
  } catch (err) {
    console.error("❌ Connection error:", err);
  }
});
