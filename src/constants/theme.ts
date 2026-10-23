// LinLecture 색상 · 글꼴 (모든 화면 공통)
// 콘셉트: 크라프트지(종이) + 먹색(잉크) + 빨간 도장 한 가지 강조색
export const C = {
  paper: '#ECE8DC', // 화면 배경
  card: '#F8F6F0', // 카드 · 입력창
  khaki: '#C9BFA7', // 타일 · 보조 버튼
  khakiSoft: '#DCD5C4', // 칩 · 약한 배경
  line: '#D3CAB6', // 테두리 · 구분선
  ink: '#2E2C2A', // 본문 · 주 버튼
  ink2: '#5E5A52', // 보조 글자 (한국어 원문 등)
  mute: '#8C8577', // 날짜 · 안내 글자
  seal: '#A33A2C', // 강조: 녹음 중, ♥, 오류, 삭제
  sealSoft: '#F3E3DE', // 강조 배경
  ok: '#5E7A4F', // 서버 연결됨 · 정답
  okSoft: '#E4EADC',
  onInk: '#ECE8DC', // 먹색 버튼 위 글자
} as const;

// 영문 앱 이름에만 세리프체 (iOS 기본 글꼴 Georgia, 설치 필요 없음)
export const SERIF = 'Georgia';

export const R = { card: 16, button: 14, chip: 18 } as const;
