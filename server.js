import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import systemPrompt from "./systemPrompt.js"; // ✅ import the prompt

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
//  🎧 /session → Create OpenAI Realtime session
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
        model: "gpt-4o-realtime-mini", // ✅ stable realtime model name
        voice: "coral",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        instructions: systemPrompt,
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
//  🔍 /search → Gemini API (woonwijzerwebshop.nl focused)
// ---------------------------------------------------------
app.get("/search", async (req, res) => {
  let query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  // Always prefer woonwijzerwebshop.nl
  if (!query.includes("woonwijzerwebshop.nl")) {
    query = `site:woonwijzerwebshop.nl ${query}`;
  }

  console.log("🌐 Gemini search query:", query);

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
                  text: `
Gebruik actuele informatie van het internet om de volgende vraag te beantwoorden:
"${query}"

Geef een korte, natuurlijke Nederlandse samenvatting (maximaal 3 zinnen) met:
- productnaam of categorie
- prijs of prijsrange (met valuta)
- korte beschrijving

Vermijd Markdown, HTML of links. Noem de domeinnaam als spraak, bijvoorbeeld: "op woonwijzerwebshop punt nl".
                  `,
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

    console.log("✅ Gemini resultaat ontvangen");

    // Wrap result for GPT to use naturally in speech
    res.json({
      result: `Informatie van woonwijzerwebshop.nl:\n${result}\nVat dit samen in natuurlijke spraak zonder URLs.`,
    });
  } catch (err) {
    console.error("❌ Gemini search error:", err);
    res.status(500).json({ error: "Gemini search failed" });
  }
});

// ---------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
