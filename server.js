import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import systemPrompt from "./systemPrompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
// 🎧 /session → Create OpenAI Realtime session
// ---------------------------------------------------------
app.get("/session", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-realtime-mini-2025-10-06",
        voice: "coral",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        instructions: systemPrompt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ OpenAI error:", data);
      return res.status(response.status).json(data);
    }

    console.log("✅ Realtime session created");
    res.json(data);
  } catch (err) {
    console.error("❌ Session creation error:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// ---------------------------------------------------------
// 🔍 /search → Gemini API (woonwijzerwebshop.nl focused)
// ---------------------------------------------------------
app.get("/search", async (req, res) => {
  let query = req.query.q?.toLowerCase();
  if (!query) return res.status(400).json({ error: "Missing query" });

  // ⛔ Handle internal services first (no need for Gemini)
  const serviceKeywords = [
    "installatie", "installateur", "montage",
    "advies", "adviesgesprek", "contact",
    "winkel", "showroom", "subsidie"
  ];
  if (serviceKeywords.some((kw) => query.includes(kw))) {
    console.log("⚡ Local service match:", query);
    let reply = "Bij Woonwijzerwinkel helpen we daarmee. ";
    if (query.includes("install"))
      reply += "We verzorgen de volledige installatie via onze eigen monteurs.";
    else if (query.includes("subsid"))
      reply += "We helpen met subsidieaanvragen en financieringsadvies.";
    else if (query.includes("advies"))
      reply += "Je kunt een gratis adviesgesprek plannen in de winkel of online.";
    else if (query.includes("contact") || query.includes("bezoek"))
      reply += "We nemen zelf contact met je op, of je kunt langskomen in Rotterdam, Den Haag of Eindhoven.";
    else if (query.includes("winkel") || query.includes("showroom"))
      reply += "Onze showrooms vind je in Rotterdam, Den Haag en Eindhoven.";
    return res.json({ result: reply });
  }

  // 🕵️‍♂️ Otherwise search woonwijzerwebshop.nl for product info
  if (!query.includes("woonwijzerwebshop.nl")) {
    query = `site:woonwijzerwebshop.nl ${query}`;
  }

  console.log("🌐 Gemini search query:", query);

  try {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
Gebruik actuele informatie van het internet om deze vraag te beantwoorden:
"${query}"

Geef een korte Nederlandse samenvatting (max 2 zinnen) met:
- productnaam of categorie
- prijs of prijsrange (met valuta)
- korte beschrijving

Vermijd Markdown, HTML of links. Spreek domeinnamen uit als "woonwijzerwebshop punt nl".
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
    res.json({
      result: `Informatie van woonwijzerwebshop.nl:\n${result}\nVat dit samen in natuurlijke spraak zonder URLs.`,
    });
  } catch (err) {
    console.error("❌ Gemini search error:", err);
    res.status(500).json({ error: "Gemini search failed" });
  }
});

// ---------------------------------------------------------
// 📞 /lead → Log contactgegevens in console (Render log)
// ---------------------------------------------------------
app.post("/lead", (req, res) => {
  const { postcode, huisnummer, telefoon } = req.body || {};
  console.log("📞 Nieuwe lead ontvangen:");
  console.log("   Postcode:", postcode || "—");
  console.log("   Huisnummer:", huisnummer || "—");
  console.log("   Telefoon:", telefoon || "—");

  if (!postcode || !huisnummer || !telefoon) {
    console.warn("⚠️ Incomplete lead data");
    return res.status(400).json({ error: "Incomplete lead data" });
  }

  console.log("✅ Lead volledig en opgeslagen in log");
  res.json({ success: true });
});

// ---------------------------------------------------------
app.listen(PORT, () =>
  console.log(`🚀 Verduurzaam Adviseur actief op poort ${PORT}`)
);
