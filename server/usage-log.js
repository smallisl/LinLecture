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
  "engine", // 번역기: ollama | libre (2026-10-28 추가, 그래서 맨 뒤)
];

function csvCell(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

let headerChecked = false; // 머리글 확인은 서버 실행 중 한 번만

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, COLUMNS.join(",") + "\n");
    return;
  }
  if (headerChecked) return;
  headerChecked = true;
  // 예전 파일(열이 적은 머리글)이면 머리글만 새 열 목록으로 바꾼다. 기존 줄은 그대로 둔다.
  const text = fs.readFileSync(LOG_PATH, "utf8");
  const firstLine = text.slice(0, text.indexOf("\n"));
  if (firstLine !== COLUMNS.join(",")) {
    fs.writeFileSync(LOG_PATH, COLUMNS.join(",") + text.slice(text.indexOf("\n")));
  }
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
