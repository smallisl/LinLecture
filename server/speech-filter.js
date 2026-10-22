// ==========================================
// 음성 인식 품질 필터
//
// 1) 무음 구간 건너뛰기: 소리가 거의 없는 구간은 Whisper 에 보내지 않는다.
//    (처리 시간 절약 + 무음에서 생기는 헛인식 방지)
// 2) 프롬프트 반복(환각) 걸러내기: Whisper 는 --prompt 를 주면, 소리가 없거나
//    불분명할 때 프롬프트 단어 목록을 그대로 출력하는 경우가 있다.
//    (2026-10-23 실사용 중 발견: "스테이터, 마이크로컨트롤러, 아두이노, ..." 출력)
// ==========================================

// 16-bit PCM 의 RMS 음량 (0 ~ 32767)
function pcmRms(pcmBuffer) {
  const samples = Math.floor(pcmBuffer.length / 2);
  if (!samples) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const value = pcmBuffer.readInt16LE(i * 2);
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

// 이 값보다 작으면 무음으로 본다. 강의실에서 너무 많이 건너뛰면
// SILENCE_RMS=50 node server.js 처럼 낮춰서 실행한다.
const SILENCE_RMS = Number(process.env.SILENCE_RMS) || 100;

function isSilent(pcmBuffer) {
  const rms = pcmRms(pcmBuffer);
  return { silent: rms < SILENCE_RMS, rms };
}

const normalize = (text) => text.replace(/\s+/g, "").toLowerCase();

// Whisper 결과가 프롬프트 단어 나열인지 판단한다.
// 쉼표로 나눈 항목 3개 이상이 프롬프트 단어이고, 전체 항목의 절반 이상이면 환각으로 본다.
function isPromptEcho(transcript, prompt) {
  const promptTerms = prompt
    .split(",")
    .map((term) => normalize(term))
    .filter(Boolean);
  const items = transcript
    .split(/[,，、]/)
    .map((item) => normalize(item.replace(/[.?!]/g, "")))
    .filter(Boolean);
  if (items.length < 3) return false;
  const hits = items.filter((item) =>
    promptTerms.some((term) => item === term || (item.length >= 2 && term.includes(item)))
  ).length;
  return hits >= 3 && hits / items.length >= 0.5;
}

module.exports = { pcmRms, isSilent, isPromptEcho, SILENCE_RMS };
