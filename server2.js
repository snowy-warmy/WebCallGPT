// server2.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Serve assistant UI from /assistant path
app.use("/assistant", express.static(path.join(__dirname, "static")));

// ---------------------------------------------------------
//  🎧 /assistant-session → Create OpenAI Realtime session
// ---------------------------------------------------------
app.get("/assistant-session", async (req, res) => {
  try {
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        instructions: `
You are a live business-call assistant.
You listen through the user's microphone.
Your job:
- Transcribe what is being said in real time.
- Identify key questions, objections, or requests.
- Suggest short, polite, and professional responses the user could say.
- Do NOT output audio. Only text.
Keep it concise and natural.
        `,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("OpenAI error:", data);
      return res.status(resp.status).json(data);
    }

    console.log("✅ Assistant realtime session created");
    res.json(data);
  } catch (err) {
    console.error("❌ Assistant session error:", err);
    res.status(500).json({ error: "failed to create assistant session" });
  }
});

// ---------------------------------------------------------
//  Root info route
// ---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🤖 Assistant server running. Visit /assistant/assistant.html");
});

app.listen(PORT, () =>
  console.log(`🚀 Assistant server running at http://localhost:${PORT}`)
);
