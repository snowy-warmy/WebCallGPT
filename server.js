import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/session", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "nova",
        modalities: ["audio", "text"], // 🧩 both voice + text
        instructions: `
Je bent de **VerduurzaamAdviseur** van Woonwijzerwinkel.nl — hét fysieke en online loket voor duurzaam wonen.
Je antwoorden zijn **kort (maximaal 1 zin)**, praktisch, vriendelijk en actiegericht.
Je spreekt vloeiend Nederlands en helpt mensen met verduurzamingsadvies over isolatie, zonnepanelen, warmtepompen en meer.
        `,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(response.status).json(data);
    }

    console.log("✅ Realtime session created");
    res.json(data);
  } catch (err) {
    console.error("❌ Session creation error:", err);
    res.status(500).json({ error: "failed to create session" });
  }
});

app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
