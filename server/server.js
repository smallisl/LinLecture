
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { logUsage, LOG_PATH, ensureLogFile } = require("./usage-log");
const { isSilent, isPromptEcho } = require("./speech-filter");
const { findTerms } = require("./glossary");
const { translate, describeTranslator } = require("./translator");

const app = express();
const PORT = 3000;

const WHISPER_PATH =
  process.env.WHISPER_PATH || "/opt/homebrew/bin/whisper-cli";

const MODEL_PATH = path.join(
  __dirname,
  "models",
  "ggml-small.bin"
);

const uploadDir = path.join(__dirname, "uploads");


// Whisper 에 주는 전공 용어 힌트 (환각 필터에서도 사용)
const WHISPER_PROMPT =
  "임베디드 시스템, 마이크로컨트롤러, 아두이노, 라즈베리파이, 센서, 액추에이터, 인터럽트, 운영체제, 프로세스, 스레드, 메모리, CPU, GPIO, UART, SPI, I2C, PWM, 실시간 시스템, 회로, 데이터베이스, 알고리즘, 자료구조";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.json({ limit: "25mb" }));
app.use(cors());

app.get("/", (req, res) => {
  res.json({
    message: "LinLecture STT + Translation Server",
  });
});

function createWavBuffer(pcmBuffer, sampleRate, channels) {
  const bitsPerSample = 16;

  const byteRate =
    sampleRate * channels * (bitsPerSample / 8);

  const blockAlign =
    channels * (bitsPerSample / 8);

  const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write("WAVE", 8);
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}


app.post("/transcribe-base64", (req, res) => {
  console.log("");
  console.log("==============================");
  console.log("📥 /transcribe-base64 요청 도착");

  const {
    audioBase64,
    sampleRate,
    channels,
    chunkNumber,
    sessionId,
    subject,
  } = req.body || {};

  // 실사용 기록용 공통 정보
  const usage = {
    timestamp: new Date().toISOString(),
    sessionId: sessionId || "",
    subject: subject || "",
    chunkNumber: chunkNumber ?? "",
  };

  if (!audioBase64) {
    return res.status(400).json({
      error: "Base64 음성 데이터가 없습니다.",
    });
  }

  const actualSampleRate = Number(sampleRate) || 16000;
  const actualChannels = Number(channels) || 1;

  let pcmBuffer;

  try {
    pcmBuffer = Buffer.from(audioBase64, "base64");
  } catch (error) {
    console.error("❌ Base64 변환 오류:", error);
    return res.status(400).json({
      error: "Base64 변환 실패",
    });
  }

  console.log(`🎙️ Chunk: ${chunkNumber ?? "?"}`);
  console.log("PCM bytes:", pcmBuffer.length);
  console.log("sampleRate:", actualSampleRate);
  console.log("channels:", actualChannels);

  usage.audioSec = (
    pcmBuffer.length / (actualSampleRate * actualChannels * 2)
  ).toFixed(2);

  // 무음 구간은 Whisper 를 거치지 않는다.
  const { silent, rms } = isSilent(pcmBuffer);
  console.log("volume(RMS):", rms.toFixed(0));
  if (silent) {
    console.log("🔇 무음 구간 - 건너뜀");
    logUsage({ ...usage, status: "silence" });
    return res.json({
      text: "",
      translation: "",
      terms: [],
      skipped: "silence",
      chunkNumber: chunkNumber ?? null,
    });
  }

  const wavBuffer = createWavBuffer(
    pcmBuffer,
    actualSampleRate,
    actualChannels
  );

  const fileName =
    `linlecture_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.wav`;

  const wavPath = path.join(uploadDir, fileName);

  fs.writeFileSync(wavPath, wavBuffer);

  console.log("✓ WAV 생성:", fileName);

  const startedAt = Date.now();

  const args = [
    "-m",
    MODEL_PATH,
    "-f",
    wavPath,
    "-l",
    "ko",
    "--prompt",
    WHISPER_PROMPT,
    "--no-timestamps",
  ];

  execFile(
    WHISPER_PATH,
    args,
    { maxBuffer: 1024 * 1024 * 10 },
    async (error, stdout, stderr) => {
      const elapsed = (Date.now() - startedAt) / 1000;

      try {
        if (error) {
          console.error("❌ Whisper 오류:", error.message);

          logUsage({
            ...usage,
            whisperSec: elapsed.toFixed(2),
            status: "stt_error",
            error: error.message,
          });

          return res.status(500).json({
            error: "Whisper 음성 인식 실패",
            detail: error.message,
          });
        }

        const transcript = stdout.trim();

        // 프롬프트 단어 나열(환각)이면 버린다.
        if (transcript && isPromptEcho(transcript, WHISPER_PROMPT)) {
          console.log("🚫 프롬프트 반복으로 판단해 버림:", transcript);
          logUsage({
            ...usage,
            whisperSec: elapsed.toFixed(2),
            koChars: transcript.length,
            status: "filtered",
          });
          return res.json({
            text: "",
            translation: "",
            terms: [],
            skipped: "prompt_echo",
            chunkNumber: chunkNumber ?? null,
          });
        }

        console.log(
          `⚡ Whisper 처리 시간: ${elapsed.toFixed(2)}초`
        );
        console.log(
          "📝 한국어:",
          transcript || "(인식 결과 없음)"
        );

        const terms = findTerms(transcript);
        let translation = "";
        let translateSec = 0;
        let engine = "";

        if (transcript) {
          const translateStartedAt = Date.now();
          ({ text: translation, engine } = await translate(transcript, { sessionId, terms }));
          translateSec = (Date.now() - translateStartedAt) / 1000;
          console.log(`🌐 번역(${engine}) ${translateSec.toFixed(2)}초:`, translation || "(번역 결과 없음)");
        }

        logUsage({
          ...usage,
          whisperSec: elapsed.toFixed(2),
          translateSec: translateSec.toFixed(2),
          koChars: transcript.length,
          viChars: translation.length,
          engine,
          status: !transcript
            ? "empty"
            : translation
              ? "ok"
              : "translate_error",
        });

        if (terms.length) {
          console.log("📘 전공 용어:", terms.map((t) => `${t.ko}=${t.vi}`).join(", "));
        }

        return res.json({
          text: transcript,
          translation: translation,
          terms,
          processingTime: elapsed,
          chunkNumber: chunkNumber ?? null,
        });
      } finally {
        try {
          if (fs.existsSync(wavPath)) {
            fs.unlinkSync(wavPath);
          }
        } catch {}
      }
    }
  );
});

// 실사용 기록 다운로드 (브라우저에서 http://<IP>:3000/usage.csv)
app.get("/usage.csv", (req, res) => {
  ensureLogFile();
  res.download(LOG_PATH, "usage.csv");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("=================================");
  console.log("🚀 LinLecture STT + Translation Server");
  console.log(`PORT: ${PORT}`);
  console.log("STT: Whisper Small");
  void describeTranslator().then((d) => console.log("TRANSLATION:", d));
  console.log("KO → VI");
  console.log("API 비용: 0원");
  console.log("=================================");
});
