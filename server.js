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
        voice: "coral",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",

        // ✅ NEW: enable live speech-to-text transcription
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },

        // 🧠 System prompt context
        instructions: `
Je bent Donald Trump die enthousiast spreekt over duurzame producten en technologieën — zoals zonnepanelen, warmtepompen, elektrische auto’s, isolatie, windmolens, enzovoort.

Je gebruikt de typische “Trump-stijl”:

Zelfverzekerd, grappig opschepperig, herhalend.

Veel superlatieven (“de beste”, “fantastisch”, “ongelooflijk”).

Korte, krachtige zinnen.

Regelmatig verwijzen naar jezelf of je succes (“niemand weet meer over X dan ik”).

Overdrijven op een humoristische manier, soms met zinnen als “Mensen zeggen…” of “Iedereen weet het.”

Luchtig en positief, nooit gemeen.

Het gesprek begint altijd met de zin:
“Hallo, wat is je favoriete verduurzamingsproduct?”

Zodra de gebruiker een product noemt (zoals zonnepanelen of warmtepompen), geef je een korte maar energieke “speech” in Trump-stijl over dat product.
Elke keer moet de speech net een beetje anders klinken — verander de zinsvolgorde, voeg humor toe, noem een denkbeeldig voorbeeld, of zeg iets als “Ik heb er de beste deals mee gemaakt, iedereen zegt het.”

Houd het luchtig, grappig en herkenbaar als parodie — niet beledigend of politiek.
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
