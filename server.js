// server.js — Vonage ↔️ OpenAI Realtime
// (Hybrid PCM bridge: Vonage 8k big-endian ↔ OpenAI 24k little-endian)
// Full console diagnostics restored (+ OpenAI-ready gating)

import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import resampler from "wave-resampler";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const voice = process.env.VOICE || "verse";

app.set("trust proxy", true);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl} from ${req.ip} ua=${req.headers["user-agent"] || "-"}`);
  next();
});

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

// --- resample helper ---
function resampleInt16(int16, srcHz, dstHz, channels = 1) {
  let monoF32;
  if (channels === 2) {
    monoF32 = new Float32Array(int16.length / 2);
    for (let i = 0, j = 0; i < int16.length; i += 2, j++) {
      monoF32[j] = (int16[i] + int16[i + 1]) / (2 * 32768);
    }
  } else {
    monoF32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) monoF32[i] = int16[i] / 32768;
  }
  const outF32 = resampler.resample(monoF32, srcHz, dstHz);
  const outI16 = new Int16Array(outF32.length);
  for (let i = 0; i < outF32.length; i++) {
    const s = Math.max(-1, Math.min(1, outF32[i]));
    outI16[i] = (s * 32767) | 0;
  }
  return outI16;
}

let pstnAnswered = false;

wss.on("connection", async (vonageWs, req) => {
  console.log("🔗 Vonage connected to media stream from", req.socket.remoteAddress);
  vonageWs.binaryType = "nodebuffer";

  // send initial silence
  const silence = Buffer.alloc(320).toString("base64");
  vonageWs.send(JSON.stringify({ event: "media", media: { payload: silence } }));
  console.log("🕊️ Sent initial silence to Vonage");

  // 🧪 Test tone
  {
    console.log("🎵 Sending 1-second 440Hz test tone @8 kHz big-endian");
    const toneHz = 440;
    const sampleRate = 8000;
    const samples = new Int16Array(sampleRate);
    for (let i = 0; i < samples.length; i++)
      samples[i] = Math.sin((2 * Math.PI * toneHz * i) / sampleRate) * 32767;
    const buf = Buffer.from(samples.buffer);
    const frameSize = 320; // 40ms @8 kHz
    let frameCounter = 0;
    for (let i = 0; i + frameSize <= buf.length; i += frameSize) {
      const frame = buf.slice(i, i + frameSize);
      frame.swap16();
      vonageWs.send(JSON.stringify({ event: "media", media: { payload: frame.toString("base64") } }));
      frameCounter++;
      await new Promise((r) => setTimeout(r, 40));
    }
    console.log(`✅ Test tone complete (${frameCounter} frames)`);
  }

  // keepalive every 2 s
  const keepAlive = JSON.stringify({ event: "media", media: { payload: silence } });
  const keepInterval = setInterval(() => {
    if (vonageWs.readyState === WebSocket.OPEN) vonageWs.send(keepAlive);
    else clearInterval(keepInterval);
  }, 2000);

  // 🧠 Connect to OpenAI
  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  // === NEW: strong gating + helpers ===
  const WS_OPEN = WebSocket.OPEN;
  let openaiReady = false;          // WebSocket OPEN
  let sessionConfigured = false;    // session.updated received

  function safeSend(ws, label, payloadObj) {
    if (!ws) { console.warn(`⚠️ ${label}: ws is null`); return false; }
    if (ws.readyState !== WS_OPEN) {
      console.warn(`⚠️ ${label}: ws not OPEN (state=${ws.readyState})`);
      return false;
    }
    try {
      ws.send(JSON.stringify(payloadObj));
      return true;
    } catch (e) {
      console.error(`❌ ${label}: send failed`, e);
      return false;
    }
  }

  let samplesAppended24k = 0;
  let totalRxFrames = 0;
  let firstFrameBytes = 0;
  let inferredSrcHz = 8000;
  let inferredChannels = 1;
  let responseInProgress = false;
  let commitTimer = null;
  let sentGreeting = false;
  let greetingFallbackTimer = null;

  openaiWs.on("open", () => {
    openaiReady = true;
    console.log("🧠 Connected to OpenAI — readyState OPEN");
  });

  openaiWs.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
  });

  openaiWs.on("close", (code, reason) => {
    openaiReady = false;
    console.log("🧠 OpenAI Realtime closed", { code, reason: reason?.toString() });
  });

  openaiWs.on("message", async (raw) => {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      console.warn("⚠️ Failed to parse OpenAI WS message");
      return;
    }

    console.log("🧩 OpenAI event:", evt.type);

    if (evt.type === "session.created") {
      console.log("🧠 OpenAI session created, sending session.update");
      safeSend(openaiWs, "session.update", {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          voice,
          instructions: "You are a natural-sounding AI assistant talking with a human caller."
        },
      });
      greetingFallbackTimer = setTimeout(() => {
        if (!sentGreeting && pstnAnswered) {
          console.log("⏱️ No session.updated yet; PSTN answered — sending greeting manually");
          safeSend(openaiWs, "response.create(greeting/fallback)", {
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              output_audio_format: "pcm16",
              conversation: "auto",
              instructions: "Say hello and introduce yourself to the caller.",
            },
          });
          sentGreeting = true;
        }
      }, 800);
    }

    if (evt.type === "session.updated") {
      sessionConfigured = true;
      console.log("🧠 OpenAI session updated successfully");
      if (!sentGreeting && pstnAnswered) {
        console.log("📞 PSTN answered, sending greeting after session.update");
        safeSend(openaiWs, "response.create(greeting)", {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            output_audio_format: "pcm16",
            conversation: "auto",
            instructions: "Say hello and introduce yourself to the caller.",
          },
        });
        sentGreeting = true;
      }
    }

    if (evt.type === "response.created" || evt.type === "response.started") {
      responseInProgress = true;
      console.log("🗣️ GPT response started");
    }
    if (evt.type === "response.completed") {
      responseInProgress = false;
      console.log("✅ GPT finished response");
    }

    // 🔊 GPT → Vonage audio
    if (
      (evt.type === "response.output_audio.delta" && evt.delta) ||
      (evt.type === "response.audio.delta" && evt.delta)
    ) {
      console.log(`🎧 GPT audio delta: ${evt.delta.length} bytes`);
      const b = Buffer.from(evt.delta, "base64");
      const i16_24k = new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
      const i16_8k = resampleInt16(i16_24k, 24000, 8000, 1);
      const out = Buffer.from(i16_8k.buffer);
      const frameSize = 320; // 40 ms @8 kHz

      if (vonageWs.readyState === WS_OPEN) {
        vonageWs.send(JSON.stringify({ event: "start_talk" }));
        console.log("📣 Sent start_talk to Vonage");
      } else {
        console.warn("⚠️ Vonage WS not OPEN when trying to send audio");
      }

      let frames = 0;
      for (let i = 0; i + frameSize <= out.length; i += frameSize) {
        const frame = out.slice(i, i + frameSize);
        frame.swap16();
        if (vonageWs.readyState === WS_OPEN) {
          vonageWs.send(JSON.stringify({ event: "media", media: { payload: frame.toString("base64") } }));
          frames++;
          if (frames % 5 === 0) console.log(`🔊 Sent frame ${frames}`);
          await new Promise((r) => setTimeout(r, 40));
        } else {
          console.warn("⚠️ Vonage WS closed mid-stream; aborting remaining frames");
          break;
        }
      }

      if (frames > 0 && vonageWs.readyState === WS_OPEN) {
        await new Promise((r) => setTimeout(r, 150));
        vonageWs.send(JSON.stringify({ event: "stop_talk" }));
        console.log(`🔊 TX → Vonage: ${frames} frames sent`);
      }
    }

    if (
      evt.type === "response.output_text.delta" ||
      evt.type === "response.output_text" ||
      (evt.output && evt.output[0]?.content?.[0]?.text)
    ) {
      const text =
        evt.delta?.content?.[0]?.text ||
        evt.output?.[0]?.content?.[0]?.text ||
        evt.text;
      if (text) console.log(`💬 GPT text: ${text}`);
    }

    if (evt.type === "error") console.error("❌ OpenAI error:", evt.error);
  });

  // 🎧 Vonage → OpenAI
  vonageWs.on("message", (msg, isBinary) => {
    if (!isBinary && !Buffer.isBuffer(msg)) return;

    const buf = Buffer.from(msg);
    if (buf.length === 0) return;

    totalRxFrames++;
    if (totalRxFrames === 1) {
      firstFrameBytes = buf.length;
      inferredSrcHz = firstFrameBytes === 640 ? 16000 : 8000;
      console.log(`🎚️ Inferred input: ${firstFrameBytes} bytes/frame → ${inferredSrcHz} Hz`);
    }
    if (totalRxFrames % 25 === 0) console.log(`🎧 RX binary frames: ${totalRxFrames}`);

    // === NEW: guard OpenAI readiness to avoid "readyState 0 (CONNECTING)" ===
    if (!openaiReady || openaiWs.readyState !== WS_OPEN) {
      console.warn(`⚠️ OpenAI WS not ready (openaiReady=${openaiReady}, state=${openaiWs.readyState}) — dropping inbound frame`);
      return;
    }

    const inI16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    const out24k = resampleInt16(inI16, inferredSrcHz, 24000, inferredChannels);
    const base64Audio = Buffer.from(out24k.buffer).toString("base64");

    if (!safeSend(openaiWs, "input_audio_buffer.append", {
      type: "input_audio_buffer.append",
      audio: base64Audio
    })) return;

    samplesAppended24k += out24k.length;

    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      if (samplesAppended24k < 2400) return;
      if (responseInProgress) return;
      console.log(`🎤 Committing ${samplesAppended24k} samples to GPT`);
      if (!safeSend(openaiWs, "input_audio_buffer.commit", { type: "input_audio_buffer.commit" })) return;
      safeSend(openaiWs, "response.create(auto)", {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          output_audio_format: "pcm16",
          conversation: "auto",
          instructions: "Reply naturally and briefly to what the caller just said."
        }
      });
      samplesAppended24k = 0;
      responseInProgress = true;
    }, 250);
  });

  const closeAll = () => {
    console.log("🧹 Closing all connections");
    clearInterval(keepInterval);
    if (greetingFallbackTimer) clearTimeout(greetingFallbackTimer);
    if (commitTimer) clearTimeout(commitTimer);
    try {
      if (openaiWs.readyState === WS_OPEN) openaiWs.close();
      if (vonageWs.readyState === WS_OPEN) vonageWs.close();
    } catch (err) {
      console.error("⚠️ Error closing sockets:", err);
    }
  };

  vonageWs.on("close", () => {
    console.log("❌ Vonage stream closed");
    closeAll();
  });

  // openaiWs 'close' handler already above (to set openaiReady=false)
});

// --- PSTN call events ---
app.post("/voice/event", (req, res) => {
  console.log("📡 (POST) Event:", req.body.status || "unknown", req.body);
  if (req.body.status === "answered" && req.body.direction === "inbound") {
    pstnAnswered = true;
    console.log("📞 PSTN leg answered ✅");
  }
  res.sendStatus(200);
});

// --- NCCO ---
function nccoForHost(host) {
  return [{
    action: "connect",
    endpoint: [{
      type: "websocket",
      uri: `wss://${host}/media-stream`,
      contentType: "audio/l16;rate=8000",
      headers: { connection: "keep-alive" },
    }],
  }];
}

// --- Routes ---
app.get("/voice/answer", (req, res) => {
  console.log(`📞 (GET) Incoming call from ${req.query.from || "unknown"}`);
  res.type("application/json").send(JSON.stringify(nccoForHost(req.headers.host)));
});
app.post("/voice/answer", (req, res) => {
  console.log(`📞 (POST) Incoming call from ${req.body.from || "unknown"}`);
  res.type("application/json").send(JSON.stringify(nccoForHost(req.headers.host)));
});
app.get("/voice/event", (req, res) => {
  console.log("📡 (GET) Event:", req.query.status || "unknown", req.query);
  res.sendStatus(200);
});
app.get("/", (_req, res) =>
  res.send(`<h2>✅ Vonage ↔️ ChatGPT (Hybrid PCM, Full Debug) Active</h2>`)
);

// --- Server startup ---
const server = app.listen(port, () =>
  console.log(`🚀 Server running on port ${port}`)
);
server.on("upgrade", (req, socket, head) => {
  console.log("🚦 Incoming WS upgrade:", {
    url: req.url,
    origin: req.headers.origin,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    "user-agent": req.headers["user-agent"],
  });
  if (req.url.replace(/\/$/, "") === "/media-stream") {
    console.log("🛰️ Vonage is connecting to /media-stream");
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    console.warn("❌ Rejected WS upgrade path", req.url);
    socket.destroy();
  }
});
