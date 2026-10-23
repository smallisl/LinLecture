import AsyncStorage from '@react-native-async-storage/async-storage';

// 과목 목록: 사용자가 추가·삭제할 수 있고 휴대폰에 저장된다.
const SUBJECTS_KEY = '@LinLecture:subjects';

export const DEFAULT_SUBJECTS = [
  '임베디드시스템및실습',
  '인공지능',
  '데이터베이스',
  '소프트웨어공학',
  '네트워크프로그래밍및보안',
];

export async function loadSubjects(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data) && data.every(s => typeof s === 'string') && data.length > 0) return data;
  } catch {
    // 저장된 값이 깨졌으면 기본 목록을 쓴다.
  }
  return DEFAULT_SUBJECTS;
}

async function saveSubjects(list: string[]) {
  await AsyncStorage.setItem(SUBJECTS_KEY, JSON.stringify(list));
  return list;
}

// 과목 추가. 빈 이름, 너무 긴 이름, 이미 있는 이름은 오류 메시지를 던진다.
export async function addSubject(name: string): Promise<string[]> {
  const value = name.trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('과목 이름을 입력해 주세요.');
  if (value.length > 30) throw new Error('과목 이름은 30자 이내로 입력해 주세요.');
  const list = await loadSubjects();
  if (list.includes(value)) throw new Error('이미 있는 과목입니다.');
  return saveSubjects([...list, value]);
}

// 과목 삭제. 마지막 하나는 지우지 않는다. (이미 저장된 강의 기록은 그대로 남는다)
export async function removeSubject(name: string): Promise<string[]> {
  const list = await loadSubjects();
  if (list.length <= 1) throw new Error('과목은 하나 이상 있어야 합니다.');
  return saveSubjects(list.filter(s => s !== name));
}
