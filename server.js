import express from "express";
import { WebSocketServer, WebSocket as WS } from "ws";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// WebSocket bridge Browser <-> OpenAI
const wss = new WebSocketServer({ server });

wss.on("connection", async (clientSocket) => {
  console.log("🔗 Browser connected");

  try {
    // Create ephemeral session
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
          "You are a friendly Dutch assistant helping users talk about verduurzaming and sustainable products. Respond clearly, naturally and always in Dutch."
      })
    });

    const data = await sessionResp.json();
    if (!data.client_secret?.value) {
      console.error("❌ Failed to create session:", data);
      clientSocket.send(JSON.stringify({ error: "Session creation failed" }));
      return;
    }

    // Connect to OpenAI realtime socket
    const openaiSocket = new WS(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
      {
        headers: {
          "Authorization": `Bearer ${data.client_secret.value}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    const queue = [];

    openaiSocket.on("open", () => {
      console.log("✅ Connected to OpenAI");
      while (queue.length > 0) openaiSocket.send(queue.shift());
    });

    // Debug logging
    clientSocket.on("message", (msg) => {
      console.log("⬅️ From browser:", msg.toString().slice(0, 100));
      if (openaiSocket.readyState === WS.OPEN) {
        openaiSocket.send(msg);
      } else {
        queue.push(msg);
      }
    });

    openaiSocket.on("message", (msg) => {
      console.log("➡️ F
