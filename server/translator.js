// ==========================================
// 번역기 선택: Ollama(로컬 LLM) → 실패하면 LibreTranslate
//
// 실사용 중 발견 (2026-10-23, 10-28): LibreTranslate 의 ko→vi 번역은
// 긴 문장의 뒷부분을 빠뜨리고, 6초 구간이 문장 중간에서 잘리면 앞뒤가 따로 번역된다.
// 그래서 MacBook 에서 돌아가는 LLM(Ollama)으로 번역하고,
//  - 바로 앞 구간의 한국어를 함께 줘서 문장이 이어지게 하고
//  - 전공 용어집(glossary.js)의 정답 용어를 지시문에 넣는다.
// 인터넷·API 비용은 여전히 필요 없다.
//
// 설정 (환경변수)
//   TRANSLATOR=ollama | libre      기본 ollama (Ollama 가 없으면 자동으로 libre)
//   OLLAMA_MODEL=qwen2.5:7b        다른 모델로 바꿀 때
//   OLLAMA_URL=http://127.0.0.1:11434
// ==========================================

const LIBRE_URL = "http://127.0.0.1:5000/translate";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const MODE = (process.env.TRANSLATOR || "ollama").toLowerCase();

// 강의(세션)마다 바로 앞 구간의 한국어를 기억 (문맥용)
const lastKorean = new Map();

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateLibre(koreanText) {
  const response = await fetchWithTimeout(LIBRE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: koreanText, source: "ko", target: "vi", format: "text" }),
  }, 15000);
  if (!response.ok) throw new Error(`LibreTranslate HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.translatedText || "";
}

function buildPrompt(koreanText, previous, terms) {
  const glossary = terms.length
    ? "Dùng đúng các thuật ngữ sau:\n" + terms.map((t) => `- ${t.ko} = ${t.vi}`).join("\n") + "\n"
    : "";
  const context = previous
    ? `Câu trước đó (chỉ để hiểu ngữ cảnh, KHÔNG dịch lại): ${previous}\n`
    : "";
  return (
    `${context}${glossary}` +
    `Dịch đoạn tiếng Hàn sau sang tiếng Việt tự nhiên, đầy đủ ý, đúng thuật ngữ công nghệ thông tin. ` +
    `Đoạn này là lời giảng được nhận dạng giọng nói nên có thể bị cắt giữa câu hoặc sai chính tả; hãy dịch theo ý hợp lý nhất. ` +
    `Chỉ trả về bản dịch, không giải thích, không thêm ngoặc kép.\n\n${koreanText}`
  );
}

async function translateOllama(koreanText, previous, terms) {
  const response = await fetchWithTimeout(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: "Bạn là phiên dịch viên Hàn–Việt cho bài giảng đại học ngành Kỹ thuật máy tính." },
        { role: "user", content: buildPrompt(koreanText, previous, terms) },
      ],
    }),
  }, 20000);
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return (data.message?.content || "").trim().replace(/^["“]|["”]$/g, "");
}

// 반환: { text, engine } — engine 은 usage.csv 와 로그에 남긴다.
async function translate(koreanText, { sessionId = "", terms = [] } = {}) {
  if (!koreanText?.trim()) return { text: "", engine: "" };
  const previous = lastKorean.get(sessionId) || "";
  lastKorean.set(sessionId, koreanText);
  if (lastKorean.size > 50) lastKorean.delete(lastKorean.keys().next().value);

  if (MODE !== "libre") {
    try {
      const text = await translateOllama(koreanText, previous, terms);
      if (text) return { text, engine: "ollama" };
    } catch (error) {
      console.error("⚠️ Ollama 번역 실패 → LibreTranslate 사용:", error.message);
    }
  }
  try {
    return { text: await translateLibre(koreanText), engine: "libre" };
  } catch (error) {
    console.error("❌ 번역 오류:", error.message);
    return { text: "", engine: "none" };
  }
}

// 서버 시작 시 Ollama 사용 가능 여부 확인
async function describeTranslator() {
  if (MODE === "libre") return "LibreTranslate (TRANSLATOR=libre)";
  try {
    const response = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, {}, 2000);
    const data = await response.json();
    const names = (data.models || []).map((m) => m.name);
    if (names.includes(OLLAMA_MODEL)) return `Ollama ${OLLAMA_MODEL} (+ 문맥 · 용어집), 실패 시 LibreTranslate`;
    return `⚠️ Ollama 에 ${OLLAMA_MODEL} 모델이 없음 → 'ollama pull ${OLLAMA_MODEL}' 필요. 지금은 LibreTranslate 사용`;
  } catch {
    return "⚠️ Ollama 가 실행 중이 아님 → LibreTranslate 사용";
  }
}

module.exports = { translate, describeTranslator, buildPrompt };
