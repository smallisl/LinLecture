// ==========================================
// 전공 용어집 (한국어 → 베트남어 + 영어)
//
// LibreTranslate 의 ko→vi 번역은 전공 용어를 일상어로 번역하는 경우가 많다.
// (예: 마이크로컨트롤러 → "vi điều khiển"이 아니라 엉뚱한 단어)
// 그래서 문장 번역은 그대로 두고, 인식된 한국어 문장에 들어 있는 전공 용어를 찾아
// 올바른 베트남어 용어를 카드 아래에 따로 보여 준다.
//
// 용어 추가: 아래 목록에 { ko: [...], vi, en } 한 줄을 넣고 서버를 다시 실행하면 된다.
// ko 에는 Whisper 가 띄어쓰기/표기를 다르게 내는 경우를 함께 적는다.
// ==========================================

const GLOSSARY = [
  { ko: ["임베디드시스템", "임베디드 시스템"], vi: "hệ thống nhúng", en: "embedded system" },
  { ko: ["마이크로컨트롤러", "마이크로 컨트롤러", "마이컴"], vi: "vi điều khiển", en: "microcontroller" },
  { ko: ["마이크로프로세서", "마이크로 프로세서"], vi: "vi xử lý", en: "microprocessor" },
  { ko: ["프로세서"], vi: "bộ xử lý", en: "processor" },
  { ko: ["아두이노"], vi: "Arduino", en: "Arduino" },
  { ko: ["라즈베리파이", "라즈베리 파이"], vi: "Raspberry Pi", en: "Raspberry Pi" },
  { ko: ["센서"], vi: "cảm biến", en: "sensor" },
  { ko: ["액추에이터", "액츄에이터"], vi: "cơ cấu chấp hành", en: "actuator" },
  { ko: ["인터럽트"], vi: "ngắt", en: "interrupt" },
  { ko: ["운영체제"], vi: "hệ điều hành", en: "operating system" },
  { ko: ["프로세스"], vi: "tiến trình", en: "process" },
  { ko: ["스레드", "쓰레드"], vi: "luồng", en: "thread" },
  { ko: ["메모리"], vi: "bộ nhớ", en: "memory" },
  { ko: ["레지스터"], vi: "thanh ghi", en: "register" },
  { ko: ["캐시"], vi: "bộ nhớ đệm", en: "cache" },
  { ko: ["펌웨어"], vi: "phần sụn", en: "firmware" },
  { ko: ["실시간시스템", "실시간 시스템"], vi: "hệ thống thời gian thực", en: "real-time system" },
  { ko: ["스케줄링", "스케쥴링"], vi: "lập lịch", en: "scheduling" },
  { ko: ["타이머"], vi: "bộ định thời", en: "timer" },
  { ko: ["클럭", "클록"], vi: "xung nhịp", en: "clock" },
  { ko: ["회로"], vi: "mạch điện", en: "circuit" },
  { ko: ["전압"], vi: "điện áp", en: "voltage" },
  { ko: ["전류"], vi: "dòng điện", en: "current" },
  { ko: ["저항"], vi: "điện trở", en: "resistor" },
  { ko: ["신호"], vi: "tín hiệu", en: "signal" },
  { ko: ["디지털"], vi: "số (kỹ thuật số)", en: "digital" },
  { ko: ["아날로그"], vi: "tương tự", en: "analog" },
  { ko: ["통신"], vi: "truyền thông", en: "communication" },
  { ko: ["프로토콜"], vi: "giao thức", en: "protocol" },
  { ko: ["시리얼통신", "시리얼 통신", "직렬통신", "직렬 통신"], vi: "truyền thông nối tiếp", en: "serial communication" },
  { ko: ["유아트", "UART"], vi: "UART", en: "UART" },
  { ko: ["GPIO", "지피아이오"], vi: "GPIO (chân vào/ra đa dụng)", en: "general-purpose I/O" },
  { ko: ["PWM", "피더블유엠"], vi: "PWM (điều chế độ rộng xung)", en: "pulse-width modulation" },
  { ko: ["I2C", "아이투씨"], vi: "I2C", en: "I2C" },
  { ko: ["SPI"], vi: "SPI", en: "SPI" },
  { ko: ["CPU", "씨피유"], vi: "CPU (bộ xử lý trung tâm)", en: "CPU" },
  { ko: ["컴파일러"], vi: "trình biên dịch", en: "compiler" },
  { ko: ["컴파일"], vi: "biên dịch", en: "compile" },
  { ko: ["디버깅"], vi: "gỡ lỗi", en: "debugging" },
  { ko: ["변수"], vi: "biến", en: "variable" },
  { ko: ["함수"], vi: "hàm", en: "function" },
  { ko: ["배열"], vi: "mảng", en: "array" },
  { ko: ["포인터"], vi: "con trỏ", en: "pointer" },
  { ko: ["알고리즘"], vi: "thuật toán", en: "algorithm" },
  { ko: ["자료구조"], vi: "cấu trúc dữ liệu", en: "data structure" },
  { ko: ["데이터베이스"], vi: "cơ sở dữ liệu", en: "database" },
];

const squash = (text) => text.replace(/\s+/g, "").toUpperCase();

// 문장에 나온 용어를 등장 순서대로 돌려준다. 긴 용어가 짧은 용어를 포함하면 긴 것만 쓴다.
// (예: "마이크로프로세서"가 있으면 "프로세서"는 따로 보여 주지 않음)
function findTerms(koreanText) {
  if (!koreanText) return [];
  const text = squash(koreanText);
  const found = [];
  for (const entry of GLOSSARY) {
    for (const variant of entry.ko) {
      const key = squash(variant);
      const index = text.indexOf(key);
      if (index >= 0) {
        found.push({ start: index, end: index + key.length, ko: variant.replace(/\s+/g, ""), vi: entry.vi, en: entry.en });
        break;
      }
    }
  }
  const kept = found.filter(
    (a) => !found.some((b) => b !== a && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start)
  );
  kept.sort((a, b) => a.start - b.start);
  return kept.map(({ ko, vi, en }) => ({ ko, vi, en }));
}

module.exports = { findTerms, GLOSSARY };
