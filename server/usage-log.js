// ==========================================
// 실사용 기록 (usage log)
// 각 음성 구간(chunk) 처리 결과를 logs/usage.csv 에 한 줄씩 기록한다.
// 발표/보고서용 통계와 차트는 scripts/analyze_usage.py 로 만든다.
// ==========================================

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_PATH = path.join(LOG_DIR, "usage.csv");

const COLUMNS = [
  "timestamp", // ISO 시간
  "sessionId", // 한 번의 강의(시작~종료)
  "subject", // 과목
  "chunkNumber", // 구간 번호
  "audioSec", // 구간 길이(초)
  "whisperSec", // Whisper 인식 시간(초)
  "translateSec", // 번역 시간(초)
  "koChars", // 한국어 글자 수
  "viChars", // 베트남어 글자 수
  "status", // ok | empty | silence | filtered | stt_error | translate_error
  "error", // 오류 메시지
];

function csvCell(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, COLUMNS.join(",") + "\n");
}

function logUsage(row) {
  try {
    ensureLogFile();
    const line = COLUMNS.map((key) => csvCell(row[key])).join(",");
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch (error) {
    // 기록 실패가 강의 처리를 막으면 안 된다.
    console.error("❌ 사용 기록 저장 실패:", error.message);
  }
}

module.exports = { logUsage, LOG_PATH, ensureLogFile };
