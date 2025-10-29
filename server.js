import express from "express";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (like index.html) from /public
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// WebSocket relay for OpenAI Realtime API
const wss = new WebSocketServer({ server });

wss.on("connection", async (clientSocket) => {
  console.log("🔗 Client connected");

  // Create an ephemeral session for the OpenAI Realtime API
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview",
      voice: "alloy",
      instructions: "You are a friendly Dutch assistant who helps people verduurzamen their homes.",
    }),
  });

  const data = await response.json();
  const wsUrl = data.client_secret.value;

  const openaiSocket = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });

  // Proxy messages between browser ↔ OpenAI
  clientSocket.on("message", (msg) => openaiSocket.send(msg));
  openaiSocket.on("message", (msg) => clientSocket.send(msg));

  clientSocket.on("close", () => {
    console.log("❌ Client disconnected");
    openaiSocket.close();
  });
});
