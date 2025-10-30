import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import systemPrompt from "./systemPrompt.js"; // ✅ import your prompt

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
//  🎧 /session → Create ephemeral OpenAI Realtime session
// ---------------------------------------------------------
app.get("/session", async (req, res) => {
  try {
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "coral", // ✅ updated voice
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        instructions: systemPrompt, // ✅ load from file
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("OpenAI error:", data);
      return res.status(resp.status).json(data);
    }

    console.log("✅ Realtime session created");
    res.json(data);
  } catch (err) {
    console.error("❌ Session creation error:", err);
    res.status(500).json({ error: "failed to create session" });
  }
});

// ---------------------------------------------------------
//  🔍 /search → Query Gemini API for live info
// ---------------------------------------------------------
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const geminiResp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Zoek actuele informatie via Google over: ${query}.
Vat het kort samen in het Nederlands (max. 3 zinnen) en geef maximaal 2 relevante links.`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await geminiResp.json();
    const result =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Geen resultaten gevonden.";
    res.json({ result });
  } catch (err) {
    console.error("❌ Gemini search error:", err);
    res.status(500).json({ error: "Gemini search failed" });
  }
});

// ---------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
