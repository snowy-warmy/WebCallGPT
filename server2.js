// server2.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4000;

// Serve static assistant frontend
app.use(express.static(path.join(__dirname, "static")));

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
        model: "gpt-realtime-mini-2025-10-06",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        // The system prompt defines its personality and purpose
        instructions: `
You are a live business-call assistant.
You listen to a conversation through the microphone.
Your job:
- Transcribe what is being said in real time.
- Identify key questions, requests, or negotiation points.
- Suggest professional, polite, and confident responses as text.
- Keep advice short, clear, and easy to say aloud.
Do NOT produce audio. Do NOT repeat the transcript. Only give helpful textual advice.
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

app.listen(PORT, () =>
  console.log(`🤖 Assistant server listening on port ${PORT}`)
);
