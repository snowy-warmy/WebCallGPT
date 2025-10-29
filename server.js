import express from "express";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Fallback: serve index.html for root requests
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", async (clientSocket) => {
  console.log("🔗 Client connected");

  // Create OpenAI Realtime session
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview",
      voice: "alloy",
      instructions: "You are a friendly assistant who talks to users about verduurzamen products.",
    }),
  });

  const data = await response.json();
  const wsUrl = data.client_secret.value;

  const openaiSocket = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });

  clientSocket.on("message", (msg) => openaiSocket.send(msg));
  openaiSocket.on("message", (msg) => clientSocket.send(msg));

  clientSocket.on("close", () => {
    console.log("❌ Client disconnected");
    openaiSocket.close();
  });
});
