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
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: "nova",
        instructions: "Je bent een vriendelijke Nederlandse verduurzamingsassistent."
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("❌ OpenAI error:", data);
      return res.status(r.status).json(data);
    }

    console.log("✅ Session created");
    res.json(data);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "failed to create session" });
  }
});

app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
