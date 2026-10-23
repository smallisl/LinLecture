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

// 전공 용어 (서버 glossary.js)
export type Term = { ko: string; vi: string; en: string };

// 강의 화면에 카드로 표시되는 한 구간 (한국어 + 베트남어 + 전공 용어)
export type Segment = { id: number; seconds: number; korean: string; vietnamese: string; terms?: Term[] };

export type LectureRecord = {
  id: string;
  subject: string;
  startedAt: string;
  endedAt: string;
  korean: string;
  vietnamese: string;
  bookmarks?: Segment[]; // 강의 중 ♥ 표시한 구간
  terms?: (Term & { count: number })[]; // 이 강의에 나온 전공 용어와 횟수 (단어장용)
  segments?: Segment[]; // 모든 카드 (원문·번역을 짝지어 다시 보기)
  title?: string; // 사용자가 붙인 강의 제목 (예: 3주차 인터럽트)
  memo?: string; // 사용자 메모
  stats?: LectureStats;
};

export async function loadLectures(): Promise<LectureRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const data: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data)) throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
  return data as LectureRecord[];
}

// 강의 하나를 지우고 남은 목록을 돌려준다. (서버의 usage.csv 기록은 그대로 남는다)
export async function deleteLecture(id: string): Promise<LectureRecord[]> {
  const remaining = (await loadLectures()).filter(item => item.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  return remaining;
}

// 제목·메모 등 일부만 바꿔 저장하고 바뀐 목록을 돌려준다.
export async function updateLecture(id: string, patch: Partial<Pick<LectureRecord, 'title' | 'memo'>>): Promise<LectureRecord[]> {
  const list = (await loadLectures()).map(item => item.id === id ? { ...item, ...patch } : item);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// 강의 노트(텍스트): 메모장, 카카오톡, 메일로 보내거나 인쇄해서 복습용으로 쓴다.
export function lectureNotesText(item: LectureRecord): string {
  const d = new Date(item.startedAt);
  const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR');
  const out: string[] = [];
  out.push(`[LinLecture 강의 노트] ${item.title || item.subject || '강의'}`);
  out.push(`${item.subject || '과목 미지정'} · ${date}${item.stats ? ` · ${Math.round(item.stats.durationSec / 60)}분` : ''}`);
  if (item.memo?.trim()) out.push('', '■ 메모', item.memo.trim());
  if (item.bookmarks?.length) {
    out.push('', `■ 북마크 (${item.bookmarks.length})`);
    for (const b of item.bookmarks) out.push(`[${formatClock(b.seconds)}] ${b.korean}`, `   → ${b.vietnamese}`);
  }
  if (item.terms?.length) {
    out.push('', `■ 전공 용어 (${item.terms.length})`);
    for (const t of item.terms) out.push(`${t.ko} → ${t.vi}${t.en && t.en !== t.vi ? ` (${t.en})` : ''}`);
  }
  out.push('', '■ 강의 내용');
  if (item.segments?.length) {
    for (const s of item.segments) out.push(`[${formatClock(s.seconds)}] ${s.korean}`, `   → ${s.vietnamese}`);
  } else {
    out.push(item.korean || '(원문 없음)', '', item.vietnamese || '(번역 없음)');
  }
  return out.join('\n');
}

// 모든 강의의 북마크를 최신 강의부터 모은다.
export function allBookmarks(items: LectureRecord[]) {
  return items
    .filter(item => item.bookmarks?.length)
    .map(item => ({ item, marks: item.bookmarks! }));
}

export async function addLecture(item: LectureRecord) {
  const previous = await loadLectures();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...previous]));
}

// 구간들에 나온 전공 용어를 합쳐 횟수와 함께 돌려준다.
export function collectTerms(segments: Segment[]): (Term & { count: number })[] {
  const map = new Map<string, Term & { count: number }>();
  for (const segment of segments) {
    for (const term of segment.terms ?? []) {
      const entry = map.get(term.ko);
      if (entry) entry.count += 1;
      else map.set(term.ko, { ...term, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// 단어장: 모든 강의의 전공 용어를 하나로 모은다.
export type VocabEntry = Term & { count: number; lectures: number; subjects: string[]; lastSeen: string };

export function buildVocab(items: LectureRecord[]): VocabEntry[] {
  const map = new Map<string, VocabEntry>();
  for (const item of items) {
    for (const term of item.terms ?? []) {
      const subject = item.subject || '과목 미지정';
      const entry = map.get(term.ko);
      if (!entry) {
        map.set(term.ko, { ko: term.ko, vi: term.vi, en: term.en, count: term.count, lectures: 1, subjects: [subject], lastSeen: item.startedAt });
        continue;
      }
      entry.count += term.count;
      entry.lectures += 1;
      if (!entry.subjects.includes(subject)) entry.subjects.push(subject);
      if (item.startedAt > entry.lastSeen) entry.lastSeen = item.startedAt;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.ko.localeCompare(b.ko, 'ko'));
}

// 검색: 과목, 원문, 번역에 검색어가 들어 있는 강의와, 원문에서 찾은 부분의 앞뒤 문장 조각
export function searchLectures(items: LectureRecord[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items.map(item => ({ item, snippet: '' }));
  const result: { item: LectureRecord; snippet: string }[] = [];
  for (const item of items) {
    const fields = [item.title ?? '', item.memo ?? '', item.korean ?? '', item.vietnamese ?? '', item.subject ?? ''];
    const hit = fields.find(text => text.toLowerCase().includes(q));
    if (hit === undefined) continue;
    const index = hit.toLowerCase().indexOf(q);
    const start = Math.max(0, index - 20);
    const end = Math.min(hit.length, index + q.length + 30);
    const snippet = (start > 0 ? '…' : '') + hit.slice(start, end).replace(/\s+/g, ' ') + (end < hit.length ? '…' : '');
    result.push({ item, snippet });
  }
  return result;
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

// 단어장 퀴즈: 한국어 용어를 보고 베트남어 뜻 4개 중 하나를 고른다.
export type QuizQuestion = { ko: string; en: string; answer: string; choices: string[] };

export function makeQuiz(vocab: VocabEntry[], count = 10, random: () => number = Math.random): QuizQuestion[] {
  const meanings = [...new Set(vocab.map(v => v.vi))];
  if (meanings.length < 4) return [];
  const shuffle = <T,>(list: T[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return shuffle(vocab).slice(0, Math.min(count, vocab.length)).map(v => {
    const wrong = shuffle(meanings.filter(m => m !== v.vi)).slice(0, 3);
    return { ko: v.ko, en: v.en, answer: v.vi, choices: shuffle([v.vi, ...wrong]) };
  });
}
