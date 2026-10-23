import { SERVER_URL } from '@/constants/config';

// 서버 연결 확인: GET / 가 3초 안에 응답하면 연결된 것으로 본다.
// (2026-10-22 집 공유기 문제처럼, 녹음 전에 연결 문제를 미리 알려 주기 위함)
export type ServerStatus = { ok: boolean; ms?: number; message: string };

export async function checkServer(timeoutMs = 3000): Promise<ServerStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${SERVER_URL}/`, { signal: controller.signal });
    if (!response.ok) return { ok: false, message: `서버 응답 오류 (HTTP ${response.status})` };
    return { ok: true, ms: Date.now() - started, message: '서버 연결됨' };
  } catch (e: any) {
    return {
      ok: false,
      message: e?.name === 'AbortError' ? '서버 응답 없음 (시간 초과)' : '서버에 연결할 수 없음',
    };
  } finally {
    clearTimeout(timer);
  }
}

export const SERVER_HELP = [
  '1. MacBook에서 node server.js 와 LibreTranslate 가 실행 중인지 확인',
  '2. iPhone과 MacBook이 같은 Wi-Fi인지 확인',
  '3. Mac 터미널에서 ipconfig getifaddr en0 → .env 의 IP와 같은지 확인',
  '4. 집 공유기가 기기 간 통신을 막으면 학교 Wi-Fi 사용',
].join('\n');

export const serverHost = () => SERVER_URL.replace(/^https?:\/\//, '');
