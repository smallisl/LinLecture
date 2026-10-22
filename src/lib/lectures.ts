import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEY } from '@/constants/config';

// 강의 한 번(시작~종료)의 저장 기록.
// stats 는 2026-10 실사용 기록 기능 추가 이후에 저장된 강의에만 있다.
export type LectureStats = {
  durationSec: number; // 강의 시작~종료 시간
  chunksSent: number; // 서버로 보낸 음성 구간 수
  chunksRecognized: number; // 한국어가 인식된 구간 수
  chunkErrors: number; // 처리에 실패한 구간 수
  avgLatencySec: number; // 구간당 평균 응답 시간(인식+번역 왕복)
};

// 강의 화면에 카드로 표시되는 한 구간 (한국어 + 베트남어)
export type Segment = { id: number; seconds: number; korean: string; vietnamese: string };

export type LectureRecord = {
  id: string;
  subject: string;
  startedAt: string;
  endedAt: string;
  korean: string;
  vietnamese: string;
  bookmarks?: Segment[]; // 강의 중 ♥ 표시한 구간
  stats?: LectureStats;
};

export async function loadLectures(): Promise<LectureRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const data: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data)) throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
  return data as LectureRecord[];
}

export async function addLecture(item: LectureRecord) {
  const previous = await loadLectures();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...previous]));
}

const durationOf = (item: LectureRecord) => {
  if (item.stats) return item.stats.durationSec;
  const ms = new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
};

export type UsageSummary = {
  lectures: number;
  totalMinutes: number;
  days: number;
  koreanChars: number;
  bySubject: { subject: string; count: number; minutes: number }[];
};

export function summarize(items: LectureRecord[]): UsageSummary {
  const subjects = new Map<string, { count: number; minutes: number }>();
  const days = new Set<string>();
  let totalSec = 0;
  let koreanChars = 0;

  for (const item of items) {
    const sec = durationOf(item);
    totalSec += sec;
    koreanChars += item.korean?.length ?? 0;
    const day = new Date(item.startedAt);
    if (!Number.isNaN(day.getTime())) days.add(day.toLocaleDateString('ko-KR'));
    const key = item.subject || '과목 미지정';
    const entry = subjects.get(key) ?? { count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += sec / 60;
    subjects.set(key, entry);
  }

  return {
    lectures: items.length,
    totalMinutes: totalSec / 60,
    days: days.size,
    koreanChars,
    bySubject: [...subjects.entries()]
      .map(([subject, v]) => ({ subject, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}
