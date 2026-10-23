import AsyncStorage from '@react-native-async-storage/async-storage';

// 카드 보기 방식: 원문+번역 / 번역만 / 원문만. 마지막 선택을 기억한다.
export type ViewMode = 'both' | 'vi' | 'ko';
const KEY = '@LinLecture:viewMode';

export const VIEW_LABEL: Record<ViewMode, string> = { both: 'KO+VI', vi: 'VI', ko: 'KO' };

export const nextViewMode = (mode: ViewMode): ViewMode => (mode === 'both' ? 'vi' : mode === 'vi' ? 'ko' : 'both');

export async function loadViewMode(): Promise<ViewMode> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'vi' || v === 'ko' || v === 'both' ? v : 'both';
  } catch {
    return 'both';
  }
}

export async function saveViewMode(mode: ViewMode) {
  try { await AsyncStorage.setItem(KEY, mode); } catch { /* 보기 설정 저장 실패는 무시 */ }
}
