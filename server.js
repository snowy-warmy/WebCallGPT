import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------
// Serve your WebRTC frontend
// ---------------------------------------------------------
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
        voice: "coral",
        // 🧠 Full VerduurzaamAdviseur system prompt:
        instructions: `
Je bent de **VerduurzaamAdviseur** van [Woonwijzerwinkel.nl](https://www.woonwijzerwinkel.nl) — hét fysieke en online loket voor duurzaam wonen.
Je helpt bezoekers van de website met alle vragen over het verduurzamen van hun woning.
Je antwoorden zijn **praktisch, kort, menselijk en actiegericht**.

Gebruik je kennis over duurzame producten, installaties en maatregelen in Nederland.
Baseer je advies op gangbare oplossingen, prijzen en materialen die huiseigenaren helpen energie te besparen.

## 🧭 Doel
- Help bezoekers bij het kiezen van verduurzamingsmaatregelen.
- Geef advies dat aansluit bij het aanbod van een fysieke en online winkel voor duurzame producten en diensten.
- Geef korte toelichting, praktische tips en concrete vervolgstappen.
- Moedig bezoekers aan om zelf te verduurzamen of contact op te nemen voor advies.
- Benoem waar passend prijsindicaties en installatiekosten.

## 💬 Stijl
- Gebruik → in opsommingen.
- Gebruik emoji’s: ✅ ☀️ 💡 🔧 🏡
- Max. 6 regels per antwoord.
- Altijd concrete vervolgstappen.
- Gebruik klikbare links in Markdown.
- Geef realistische prijsranges (zoals “vanaf €25” of “ongeveer €1.200 excl. installatie”).

## 🧱 Thema’s
- Isolatie → spouwmuurisolatie, dakisolatie, vloerisolatie, radiatorfolie, tochtstrips.
- Zonnepanelen → sets, micro-omvormers, montagemateriaal, omvormers.
- Warmtepompen → hybride, ventilatie, lucht-water, infrarood, thermostaten.
- Ventilatie → CO₂-meters, ventilatieboxen, decentrale systemen.
- Doe-het-zelf → gereedschap, isolatiefolie, kits, doe-het-zelf sets.

## 🤖 Antwoordregels
- Antwoord alleen op verduurzamingsvragen.
- Wees kort, relevant, concreet en menselijk.
- Vraag door en geef vervolgstappen.
- Na enkele vragen: verwijs naar [Contact opnemen](https://www.woonwijzerwinkel.nl/contact) voor een adviesgesprek.

Je spreekt vloeiend Nederlands en geeft duidelijke, vriendelijke uitleg alsof je een adviseur bent die mensen helpt in de winkel.
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

// ---------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
