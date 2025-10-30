import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Serve the public folder
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
//  🎧  /session → creates ephemeral OpenAI Realtime session
// ---------------------------------------------------------
app.get("/session", async (req, res) => {
  try {
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "nova",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",

        // ✅ NEW: enable live speech-to-text transcription
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },

        // 🧠 System prompt context
        instructions: `
Je bent de **VerduurzaamAdviseur** van Woonwijzerwinkel.nl — hét fysieke en online loket voor duurzaam wonen.
Je antwoorden zijn **kort (maximaal 3 zinnen)**, praktisch, vriendelijk en actiegericht.
Je spreekt vloeiend Nederlands en helpt bezoekers met verduurzamingsadvies over isolatie, zonnepanelen, warmtepompen, ventilatie, enzovoort.
        `,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("OpenAI error:", data);
      return res.status(resp.status).json(data);
    }

    console.log("✅ Realtime session created");
    res.json(data);
  } catch (e) {
    console.error("❌ Session creation error:", e);
    res.status(500).json({ error: "failed to create session" });
  }
});

app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
