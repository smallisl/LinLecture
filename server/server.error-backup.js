
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = 3000;
const WHISPER_PATH = '/opt/homebrew/bin/whisper-cli';
const MODEL_PATH = path.join(__dirname, 'models', 'ggml-small.bin');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TRANSLATE_URL = 'http://127.0.0.1:5000/translate';

const WHISPER_PROMPT =
  '임베디드 시스템, 마이크로컨트롤러, 아두이노, 라즈베리파이, 센서, 인터럽트, 운영체제, 프로세스, 스레드, CPU, 메모리, 네트워크, 프로토콜.';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '25mb' }));
app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    message: 'LinLecture STT + Translation Server',
    model: 'Whisper Small',
  });
});

function createWavBuffer(pcmBuffer, sampleRate, channels) {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wavBuffer.writeUInt16LE(channels * bytesPerSample, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}

async function translateToVietnamese(koreanText) {
  if (!koreanText.trim()) return '';

  const startedAt = Date.now();

  try {
    const response = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: koreanText,
        source: 'ko',
        target: 'vi',
        format: 'text',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(
        `LibreTranslate HTTP ${response.status}: ${await response.text()}`
      );
    }

    const data = await response.json();
    const translation =
      typeof data.translatedText === 'string'
        ? data.translatedText.trim()
        : '';

    console.log(
      `🌐 Dịch: ${((Date.now() - startedAt) / 1000).toFixed(2)}s`
    );
    console.log('🇻🇳 Tiếng Việt:', translation || '(không có kết quả)');

    return translation;
  } catch (error) {
    console.error('❌ Lỗi dịch:', error.message);
    return '';
  }
}

app.post('/transcribe-base64', (req, res) => {
  const { audioBase64, sampleRate, channels, chunkNumber } =
    req.body || {};

  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    return res.status(400).json({
      error: 'Thiếu dữ liệu âm thanh Base64.',
    });
  }

  const actualSampleRate = Number(sampleRate) || 16000;
  const actualChannels = Number(channels) || 1;

  if (
    !Number.isInteger(actualSampleRate) ||
    actualSampleRate < 8000 ||
    actualSampleRate > 192000 ||
    ![1, 2].includes(actualChannels)
  ) {
    return res.status(400).json({
      error: 'sampleRate hoặc channels không hợp lệ.',
    });
  }

  if (!fs.existsSync(MODEL_PATH)) {
    return res.status(500).json({
      error: `Không tìm thấy model: ${MODEL_PATH}`,
    });
  }

  let wavPath;

  try {
    const pcmBuffer = Buffer.from(audioBase64, 'base64');

    if (pcmBuffer.length === 0 || pcmBuffer.length % 2 !== 0) {
      return res.status(400).json({
        error: 'Dữ liệu PCM Int16 không hợp lệ.',
      });
    }

    const wavBuffer = createWavBuffer(
      pcmBuffer,
      actualSampleRate,
      actualChannels
    );

    wavPath = path.join(
      UPLOAD_DIR,
      `linlecture_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.wav`
    );

    fs.writeFileSync(wavPath, wavBuffer);
  } catch (error) {
    console.error('❌ Lỗi tạo WAV:', error);
    return res.status(500).json({
      error: 'Không thể tạo file WAV.',
    });
  }

  console.log(
    `\n🎙️ Chunk ${chunkNumber ?? '?'} | ${actualSampleRate} Hz | ${actualChannels} channel(s)`
  );

  const startedAt = Date.now();

  const args = [
    '-m', MODEL_PATH,
    '-f', wavPath,
    '-l', 'ko',
    '-p', WHISPER_PROMPT,
    '--no-timestamps',
  ];

  execFile(
    WHISPER_PATH,
    args,
    {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    },
    async (error, stdout, stderr) => {
      try {
        if (error) {
          console.error('❌ Whisper:', error.message);

          if (stderr) {
            console.error(stderr.slice(-1500));
          }

          return res.status(500).json({
            error: 'Whisper nhận diện thất bại.',
            detail: error.message,
          });
        }

        const transcript = stdout.trim();

        console.log(
          `⚡ Whisper: ${((Date.now() - startedAt) / 1000).toFixed(2)}s`
        );
        console.log(
          '📝 Tiếng Hàn:',
          transcript || '(không nhận diện được)'
        );

        const translation = transcript
          ? await translateToVietnamese(transcript)
          : '';

        return res.json({
          text: transcript,
          translation,
          processingTime: (Date.now() - startedAt) / 1000,
          chunkNumber: chunkNumber ?? null,
        });
      } catch (err) {
        console.error('❌ Lỗi xử lý:', err);

        if (!res.headersSent) {
          res.status(500).json({
            error: 'Lỗi xử lý âm thanh.',
          });
        }
      } finally {
        try {
          fs.unlinkSync(wavPath);
        } catch (err) {
          console.error('Không thể xóa WAV tạm:', err.message);
        }
      }
    }
  );
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 LinLecture STT + Translation Server');
  console.log(`PORT: ${PORT}`);
  console.log('STT: Whisper Small (Korean)');
  console.log('TRANSLATION: LibreTranslate (KO → VI)');
  console.log('=================================');
});
