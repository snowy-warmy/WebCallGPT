import express from "express";
import { WebSocketServer, WebSocket as WS } from "ws";  // ✅ import the correct WebSocket class
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the public folder
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

wss.on("connection", async (clientSocket) => {
  console.log("🔗 Browser connected");

  try {
    // Create ephemeral session for Realtime API
    const sessionResp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "alloy",
        instructions: "You are a friendly Dutch assistant that helps users with verduurzaming and sustainability advice."
      })
    });

    const data = await sessionResp.json();
    if (!data.client_secret?.value) {
      console.error("❌ Failed to create session:", data);
      clientSocket.send(JSON.stringify({ error: "Session creation failed" }));
      return;
    }

    // ✅ Explicitly use WS from 'ws' module to connect to OpenAI
    const openaiSocket = new WS(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
      {
        headers: {
          "Authorization": `Bearer ${data.client_secret.value}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    openaiSocket.on("open", () => console.log("✅ Connected to OpenAI"));
    openaiSocket.on("message", (msg) => clientSocket.send(msg));
    openaiSocket.on("close", () => clientSocket.close());
    openaiSocket.on("error", (err) => console.error("OpenAI WS error:", err));

    clientSocket.on("message", (msg) => openaiSocket.send(msg));
    clientSocket.on("close", () => openaiSocket.close());
  } catch (err) {
    console.error("❌ Connection error:", err);
  }
});
