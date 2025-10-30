import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import systemPrompt from "./systemPrompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // ✅ parse JSON bodies
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
// 🎧 /session → Create OpenAI Realtime session
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
        model: "gpt-4o-realtime-mini",
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
// 🔍 /search → Gemini API (woonwijzerwebshop.nl focused)
// ---------------------------------------------------------
app.get("/search", async (req, res) => {
  let query = req.query.q?.toLowerCase();
  if (!query) return res.status(400).json({ error: "Missing query" });

  const serviceKeywords = [
    "installateur",
    "installatie",
    "montage",
    "subsidie",
    "advies",
    "adviesgesprek",
    "contact",
    "bezoek",
    "winkel",
    "showroom",
  ];

  if (serviceKeywords.some((kw) => query.includes(kw))) {
    console.log("⚡ Local response triggered — no Gemini search:", query);
    let reply = "Bij Woonwijzerwinkel helpen we hiermee. ";
    if (query.includes("install"))
      reply +=
        "Wij regelen complete installatie en montage via onze eigen monteurs en partners.";
    else if (query.includes("subsid"))
      reply +=
        "We helpen je gratis bij het aanvragen van subsidies en financieringsadvies.";
    else if (query.includes("advies"))
      reply +=
        "Je kunt bij ons terecht voor een gratis adviesgesprek, online of in de showroom.";
    else if (query.includes("contact") || query.includes("bezoek"))
      reply +=
        "Je kunt contact opnemen via woonwijzerwinkel punt nl slash contact of langskomen in onze showroom in Rotterdam, Den Haag of Eindhoven.";
    else if (query.includes("winkel") || query.includes("showroom"))
      reply +=
        "We hebben fysieke showrooms in Rotterdam, Eindhoven en Den Haag waar je onze producten kunt bekijken.";
    return res.json({ result: reply });
  }

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
    res.json({
      result: `Informatie van woonwijzerwebshop.nl:\n${result}\nVat dit samen in natuurlijke spraak zonder URLs.`,
    });
  } catch (err) {
    console.error("❌ Gemini search error:", err);
    res.status(500).json({ error: "Gemini search failed" });
  }
});

// ---------------------------------------------------------
// 📞 /lead → Receive lead data from the assistant
// ---------------------------------------------------------
app.post("/lead", (req, res) => {
  const { postcode, huisnummer, telefoon } = req.body || {};
  console.log("📞 Nieuwe lead ontvangen:");
  console.log("   Postcode:", postcode);
  console.log("   Huisnummer:", huisnummer);
  console.log("   Telefoon:", telefoon);
  if (!postcode || !huisnummer || !telefoon) {
    console.warn("⚠️ Incomplete lead data");
    return res.status(400).json({ error: "Incomplete lead data" });
  }
  res.json({ success: true });
});

// ---------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
