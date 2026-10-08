const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const app = express();

const PORT = 3000;

const WHISPER_PATH = "/opt/homebrew/bin/whisper-cli";

const MODEL_PATH = path.join(
  __dirname,
  "models",
  "ggml-base.bin"
);

const uploadDir = path.join(
  __dirname,
  "uploads"
);

// LibreTranslate local
const TRANSLATE_URL =
  "http://127.0.0.1:5000/translate";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

app.use(
  express.json({
    limit: "25mb",
  })
);

app.use(cors());

// ==========================================
// Test server
// ==========================================

app.get("/", (req, res) => {
  res.json({
    message:
      "LinLecture STT + Translation Server",
  });
});

// ==========================================
// PCM Int16 → WAV
// ==========================================

function createWavBuffer(
  pcmBuffer,
  sampleRate,
  channels
) {
  const bitsPerSample = 16;

  const byteRate =
    sampleRate *
    channels *
    (bitsPerSample / 8);

  const blockAlign =
    channels *
    (bitsPerSample / 8);

  const wavBuffer = Buffer.alloc(
    44 + pcmBuffer.length
  );

  wavBuffer.write("RIFF", 0);

  wavBuffer.writeUInt32LE(
    36 + pcmBuffer.length,
    4
  );

  wavBuffer.write("WAVE", 8);

  wavBuffer.write("fmt ", 12);

  wavBuffer.writeUInt32LE(16, 16);

  // PCM format = 1
  wavBuffer.writeUInt16LE(1, 20);

  wavBuffer.writeUInt16LE(
    channels,
    22
  );

  wavBuffer.writeUInt32LE(
    sampleRate,
    24
  );

  wavBuffer.writeUInt32LE(
    byteRate,
    28
  );

  wavBuffer.writeUInt16LE(
    blockAlign,
    32
  );

  wavBuffer.writeUInt16LE(
    bitsPerSample,
    34
  );

  wavBuffer.write("data", 36);

  wavBuffer.writeUInt32LE(
    pcmBuffer.length,
    40
  );

  pcmBuffer.copy(
    wavBuffer,
    44
  );

  return wavBuffer;
}

// ==========================================
// Korean → Vietnamese
// ==========================================

async function translateToVietnamese(
  koreanText
) {
  if (!koreanText?.trim()) {
    return "";
  }

  const startedAt = Date.now();

  try {
    console.log(
      "🌐 베트남어 번역 시작..."
    );

    const response = await fetch(
      TRANSLATE_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          q: koreanText,
          source: "ko",
          target: "vi",
          format: "text",
        }),
      }
    );

    if (!response.ok) {
      const detail =
        await response.text();

      throw new Error(
        `LibreTranslate HTTP ${response.status}: ${detail}`
      );
    }

    const data =
      await response.json();

    const translatedText =
      data.translatedText || "";

    const elapsed =
      (Date.now() - startedAt) /
      1000;

    console.log(
      `🌐 번역 시간: ${elapsed.toFixed(
        2
      )}초`
    );

    console.log(
      "🇻🇳 베트남어:",
      translatedText ||
        "(번역 결과 없음)"
    );

    return translatedText;
  } catch (error) {
    console.error(
      "❌ 번역 오류:",
      error.message
    );

    // Translation fail thì STT vẫn tiếp tục
    return "";
  }
}

// ==========================================
// Base64 PCM → Whisper → Translation
// ==========================================

app.post(
  "/transcribe-base64",
  (req, res) => {
    console.log("");
    console.log(
      "=============================="
    );

    console.log(
      "📥 /transcribe-base64 요청 도착"
    );

    const {
      audioBase64,
      sampleRate,
      channels,
      chunkNumber,
    } = req.body || {};

    if (!audioBase64) {
      console.log(
        "❌ Base64 데이터 없음"
      );

      return res
        .status(400)
        .json({
          error:
            "Base64 음성 데이터가 없습니다.",
        });
    }

    const actualSampleRate =
      Number(sampleRate) || 16000;

    const actualChannels =
      Number(channels) || 1;

    let pcmBuffer;

    try {
      pcmBuffer = Buffer.from(
        audioBase64,
        "base64"
      );
    } catch (error) {
      console.error(
        "❌ Base64 변환 오류:",
        error
      );

      return res
        .status(400)
        .json({
          error:
            "Base64 변환 실패",
        });
    }

    console.log(
      `🎙️ Chunk: ${
        chunkNumber ?? "?"
      }`
    );

    console.log(
      "PCM bytes:",
      pcmBuffer.length
    );

    console.log(
      "sampleRate:",
      actualSampleRate
    );

    console.log(
      "channels:",
      actualChannels
    );

    const wavBuffer =
      createWavBuffer(
        pcmBuffer,
        actualSampleRate,
        actualChannels
      );

    const fileName =
      `linlecture_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.wav`;

    const wavPath =
      path.join(
        uploadDir,
        fileName
      );

    fs.writeFileSync(
      wavPath,
      wavBuffer
    );

    console.log(
      "✓ WAV 생성:",
      fileName
    );

    const startedAt =
      Date.now();

    const args = [
      "-m",
      MODEL_PATH,

      "-f",
      wavPath,

      "-l",
      "ko",

      "--no-timestamps",
    ];

    execFile(
      WHISPER_PATH,
      args,
      {
        maxBuffer:
          1024 * 1024 * 10,
      },

      async (
        error,
        stdout,
        stderr
      ) => {
        const elapsed =
          (Date.now() -
            startedAt) /
          1000;

        try {
          if (error) {
            console.error(
              "❌ Whisper 오류:",
              error.message
            );

            return res
              .status(500)
              .json({
                error:
                  "Whisper 음성 인식 실패",

                detail:
                  error.message,
              });
          }

          const transcript =
            stdout.trim();

          console.log(
            `⚡ Whisper 처리 시간: ${elapsed.toFixed(
              2
            )}초`
          );

          console.log(
            "📝 한국어:",
            transcript ||
              "(인식 결과 없음)"
          );

          // ==========================
          // Korean → Vietnamese
          // ==========================

          let translation = "";

          if (transcript) {
            translation =
              await translateToVietnamese(
                transcript
              );
          }

          return res.json({
            text: transcript,

            translation:
              translation,

            processingTime:
              elapsed,

            chunkNumber:
              chunkNumber ??
              null,
          });
        } finally {
          try {
            if (
              fs.existsSync(
                wavPath
              )
            ) {
              fs.unlinkSync(
                wavPath
              );
            }
          } catch {}
        }
      }
    );
  }
);

// ==========================================
// Start
// ==========================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "================================="
    );

    console.log(
      "🚀 LinLecture STT + Translation Server"
    );

    console.log(
      `PORT: ${PORT}`
    );

    console.log(
      "STT: Whisper Base"
    );

    console.log(
      "TRANSLATION: LibreTranslate"
    );

    console.log(
      "KO → VI"
    );

    console.log(
      "API 비용: 0원"
    );

    console.log(
      "================================="
    );
  }
);