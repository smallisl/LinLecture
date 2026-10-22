import { fromByteArray } from 'base64-js';
import type { AudioStreamBuffer } from 'expo-audio';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TermList } from '@/components/term-list';
import { SERVER_URL } from '@/constants/config';
import { addLecture, type LectureRecord, type Segment, type Term } from '@/lib/lectures';

const DEFAULT_SUBJECT = '임베디드시스템및실습';
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const CHUNK_SECONDS = 6;

type AudioChunk = { number: number; data: Uint8Array; sampleRate: number; channels: number };

export default function LectureScreen() {
  const { subject } = useLocalSearchParams<{ subject?: string | string[] }>();
  const selectedSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : DEFAULT_SUBJECT;

  const [segments, setSegments] = useState<Segment[]>([]);
  const [fontSize, setFontSize] = useState(17);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [statusMessage, setStatusMessage] = useState('강의 시작 준비 완료');
  const [errorMessage, setErrorMessage] = useState('');
  const [chunkCount, setChunkCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFinished, setSaveFinished] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const sessionActiveRef = useRef(false);
  const startedAtRef = useRef('');
  const transcriptRef = useRef('');
  const translationRef = useRef('');
  const pcmPartsRef = useRef<Uint8Array[]>([]);
  const pcmBytesRef = useRef(0);
  const sampleRateRef = useRef(SAMPLE_RATE);
  const channelsRef = useRef(CHANNELS);
  const chunkNumberRef = useRef(0);
  const queueRef = useRef<AudioChunk[]>([]);
  const sendingRef = useRef(false);
  const stopPendingRef = useRef(false);
  const savingRef = useRef(false);
  const hadChunkErrorRef = useRef(false);
  const closedRef = useRef(false);
  // 실사용 기록용 통계 + 저장할 북마크
  const sessionIdRef = useRef('');
  const statsRef = useRef({ sent: 0, recognized: 0, errors: 0, latencyMs: 0 });
  const segmentsRef = useRef<Segment[]>([]);
  const bookmarksRef = useRef<number[]>([]);
  const subjectRef = useRef(selectedSubject);
  subjectRef.current = selectedSubject;

  useEffect(() => {
    const timer = setInterval(() => {
      if (sessionActiveRef.current && !pausedRef.current) {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const saveLecture = async () => {
    if (!stopPendingRef.current || sendingRef.current || queueRef.current.length || savingRef.current) return;
    stopPendingRef.current = false;
    savingRef.current = true;
    setSaving(true);
    setStatusMessage('강의 내용을 저장하고 있습니다');
    try {
      const korean = transcriptRef.current.trim();
      const vietnamese = translationRef.current.trim();
      if (!korean && !vietnamese) {
        setStatusMessage('저장할 강의 내용이 없습니다');
        Alert.alert('저장할 내용 없음', '인식된 강의 내용이 없어 저장하지 않았습니다.');
        return;
      }
      const stats = statsRef.current;
      const item: LectureRecord = {
        id: sessionIdRef.current || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        subject: subjectRef.current,
        startedAt: startedAtRef.current || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        korean,
        vietnamese,
        bookmarks: segmentsRef.current.filter(segment => bookmarksRef.current.includes(segment.id)),
        stats: {
          durationSec: elapsedRef.current, // 일시정지 시간을 뺀 실제 녹음 시간
          chunksSent: stats.sent,
          chunksRecognized: stats.recognized,
          chunkErrors: stats.errors,
          avgLatencySec: stats.sent ? Math.round(stats.latencyMs / stats.sent / 100) / 10 : 0,
        },
      };
      await addLecture(item);
      setSaveFailed(false);
      setSaveFinished(true);
      setStatusMessage('강의가 저장되었습니다');
      console.log('💾 강의 저장 완료:', item.subject, item.id);
      Alert.alert('강의가 저장되었습니다', hadChunkErrorRef.current
        ? '일부 구간 처리에 실패하여 인식된 내용만 저장했습니다.'
        : `${item.subject} 강의의 한국어 원문과 베트남어 번역을 저장했습니다.`);
    } catch (error: any) {
      console.log('❌ 강의 저장 오류:', error);
      setErrorMessage(error?.message || '강의를 저장하지 못했습니다.');
      setSaveFailed(true);
      setStatusMessage('강의 저장 실패');
      Alert.alert('저장 실패', '강의 저장에 실패했습니다. 화면을 닫지 말고 다시 시도해 주세요.');
      // Allow manual retry without losing the transcript.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const processQueue = async () => {
    if (sendingRef.current || closedRef.current) return;
    const chunk = queueRef.current.shift();
    if (!chunk) {
      setProcessing(false);
      if (stopPendingRef.current) void saveLecture();
      return;
    }
    sendingRef.current = true;
    setProcessing(true);
    const requestStartedAt = Date.now();
    statsRef.current.sent += 1;
    try {
      const response = await fetch(`${SERVER_URL}/transcribe-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: fromByteArray(chunk.data),
          sampleRate: chunk.sampleRate,
          channels: chunk.channels,
          chunkNumber: chunk.number,
          sessionId: sessionIdRef.current,
          subject: subjectRef.current,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
      const data: { text?: string; translation?: string; terms?: Term[] } = JSON.parse(body);
      statsRef.current.latencyMs += Date.now() - requestStartedAt;
      if (closedRef.current) return;
      if (data.text?.trim() || data.translation?.trim()) {
        const segment: Segment = {
          id: chunk.number,
          seconds: Math.max(0, (chunk.number - 1) * CHUNK_SECONDS),
          korean: data.text?.trim() || '',
          vietnamese: data.translation?.trim() || '',
          terms: data.terms ?? [],
        };
        segmentsRef.current = [...segmentsRef.current, segment];
        setSegments(segmentsRef.current);
      }
      if (data.text?.trim()) {
        const value = data.text.trim();
        transcriptRef.current = transcriptRef.current ? transcriptRef.current + '\n' + value : value;
        setTranscript(transcriptRef.current);
        statsRef.current.recognized += 1;
        setChunkCount(previous => previous + 1);
        console.log(`📝 Chunk ${chunk.number}: ${value}`);
      }
      if (data.translation?.trim()) {
        const value = data.translation.trim();
        translationRef.current = translationRef.current ? translationRef.current + '\n' + value : value;
        setTranslation(translationRef.current);
        console.log(`🇻🇳 Chunk ${chunk.number}: ${value}`);
      }
    } catch (error: any) {
      statsRef.current.latencyMs += Date.now() - requestStartedAt;
      statsRef.current.errors += 1;
      if (!closedRef.current) {
        hadChunkErrorRef.current = true;
        setErrorMessage(error?.message || '음성 인식 또는 번역 중 오류가 발생했습니다.');
        console.log('❌ STT/번역 오류:', error);
      }
    } finally {
      sendingRef.current = false;
      if (!closedRef.current && queueRef.current.length > 0) {
        void processQueue();
      } else {
        setProcessing(false);
        if (!closedRef.current && stopPendingRef.current) void saveLecture();
      }
    }
  };

  const createChunk = () => {
    if (pcmBytesRef.current <= 0) return;
    const merged = new Uint8Array(pcmBytesRef.current);
    let offset = 0;
    for (const part of pcmPartsRef.current) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    pcmPartsRef.current = [];
    pcmBytesRef.current = 0;
    chunkNumberRef.current += 1;
    queueRef.current.push({
      number: chunkNumberRef.current,
      data: merged,
      sampleRate: sampleRateRef.current,
      channels: channelsRef.current,
    });
    void processQueue();
  };

  const handleAudioBuffer = (buffer: AudioStreamBuffer) => {
    if (!sessionActiveRef.current || closedRef.current) return;
    sampleRateRef.current = buffer.sampleRate;
    channelsRef.current = buffer.channels;
    const source = new Uint8Array(buffer.data);
    const copy = new Uint8Array(source.length);
    copy.set(source);
    pcmPartsRef.current.push(copy);
    pcmBytesRef.current += copy.byteLength;
    if (pcmBytesRef.current >= buffer.sampleRate * buffer.channels * 2 * CHUNK_SECONDS) createChunk();
  };

  const { stream, isStreaming } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    encoding: 'int16',
    onBuffer: handleAudioBuffer,
  });

  const startLecture = async () => {
    if (sendingRef.current || savingRef.current || stopPendingRef.current || stopping) return;
    try {
      setErrorMessage('');
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('권한 필요', '마이크 사용 권한이 필요합니다.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      pcmPartsRef.current = [];
      pcmBytesRef.current = 0;
      queueRef.current = [];
      chunkNumberRef.current = 0;
      sampleRateRef.current = SAMPLE_RATE;
      channelsRef.current = CHANNELS;
      transcriptRef.current = '';
      translationRef.current = '';
      startedAtRef.current = new Date().toISOString();
      sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      statsRef.current = { sent: 0, recognized: 0, errors: 0, latencyMs: 0 };
      segmentsRef.current = [];
      bookmarksRef.current = [];
      hadChunkErrorRef.current = false;
      setTranscript('');
      setSegments([]);
      setBookmarks([]);
      elapsedRef.current = 0;
      setElapsed(0);
      pausedRef.current = false;
      setPaused(false);
      setTranslation('');
      setChunkCount(0);
      setProcessing(false);
      setSaveFinished(false);
      setSaveFailed(false);
      sessionActiveRef.current = true;
      setStatusMessage('연속 음성 수집을 시작하고 있습니다');
      await stream.start();
      setStatusMessage('강의 음성을 연속으로 듣고 있습니다');
    } catch (error: any) {
      sessionActiveRef.current = false;
      setErrorMessage(error?.message || '강의를 시작할 수 없습니다.');
      setStatusMessage('강의 시작 실패');
    }
  };

  const toggleBookmark = (id: number) => {
    const next = bookmarksRef.current.includes(id)
      ? bookmarksRef.current.filter(value => value !== id)
      : [...bookmarksRef.current, id];
    bookmarksRef.current = next;
    setBookmarks(next);
  };

  const togglePause = async () => {
    if (stopping || saving || saveFinished) return;
    try {
      if (pausedRef.current) {
        await stream.start();
        sessionActiveRef.current = true;
        pausedRef.current = false;
        setPaused(false);
        setStatusMessage('강의 음성을 듣고 있습니다');
      } else {
        sessionActiveRef.current = false;
        stream.stop();
        if (pcmBytesRef.current > 0) createChunk();
        pausedRef.current = true;
        setPaused(true);
        setStatusMessage('일시정지 중');
      }
    } catch (error: any) {
      setErrorMessage(error?.message || '일시정지 상태를 변경하지 못했습니다.');
    }
  };

  const stopLecture = () => {
    if (stopping || savingRef.current) return;
    setStopping(true);
    sessionActiveRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    try {
      stream.stop();
      stopPendingRef.current = true;
      if (pcmBytesRef.current > 0) createChunk();
      setStatusMessage('마지막 음성을 처리하고 있습니다');
      if (!sendingRef.current && queueRef.current.length === 0) void saveLecture();
    } catch (error: any) {
      setErrorMessage(error?.message || '강의를 종료할 수 없습니다.');
      setStatusMessage('강의 종료 실패');
      setStopping(false);
    }
  };

  const retrySave = () => {
    if (sessionActiveRef.current || pausedRef.current || sendingRef.current || savingRef.current || queueRef.current.length > 0) return;
    setErrorMessage('');
    setSaveFailed(false);
    stopPendingRef.current = true;
    void saveLecture();
  };

  const closeLecture = () => {
    if (sessionActiveRef.current || paused || processing || saving || (stopping && !saveFinished && !saveFailed)) {
      Alert.alert('강의 처리 중', '강의를 종료하고 저장이 완료된 후 화면을 닫아 주세요.');
      return;
    }
    closedRef.current = true;
    sessionActiveRef.current = false;
    try { stream.stop(); } catch {}
    router.back();
  };

  useEffect(() => () => {
    closedRef.current = true;
    sessionActiveRef.current = false;
    try { stream.stop(); } catch {}
  }, [stream]);

  const busy = processing || saving || (stopping && !saveFinished && !saveFailed);
  const sessionStarted = Boolean(startedAtRef.current) && !saveFinished && !saveFailed && (isStreaming || paused || stopping);
  const sessionDate = startedAtRef.current ? new Date(startedAtRef.current) : new Date();
  const titleDate = `${String(sessionDate.getMonth() + 1).padStart(2, '0')}/${String(sessionDate.getDate()).padStart(2, '0')} ${String(sessionDate.getHours()).padStart(2, '0')}:${String(sessionDate.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={closeLecture} style={styles.back} accessibilityLabel="뒤로 가기">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedSubject} · {titleDate}</Text>
          <Text style={styles.language}>KO → VI</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.timerGroup}>
          <View style={[styles.dot, sessionActiveRef.current && styles.dotActive]} />
          <Text style={styles.timer}>{formatTime(elapsed)}</Text>
          <Text style={styles.recordState}>{paused ? '일시정지' : isStreaming ? '녹음 중' : busy ? '처리 중' : '대기 중'}</Text>
        </View>
        <View style={styles.fontControls}>
          <Text style={styles.mic}>♩</Text>
          <Pressable onPress={() => setFontSize(value => Math.max(14, value - 1))} style={styles.fontButton}><Text style={styles.fontButtonText}>A−</Text></Pressable>
          <Text style={styles.fontValue}>{fontSize}</Text>
          <Pressable onPress={() => setFontSize(value => Math.min(24, value + 1))} style={styles.fontButton}><Text style={styles.fontButtonText}>A+</Text></Pressable>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {segments.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎙</Text>
            <Text style={styles.emptyTitle}>강의 음성을 기다리고 있어요</Text>
            <Text style={styles.emptyBody}>녹음을 시작하면 한국어 원문과 베트남어 번역이 순서대로 표시됩니다.</Text>
          </View>
        )}
        {segments.map(item => (
          <View key={item.id} style={styles.segmentCard}>
            <View style={styles.segmentTop}>
              <Text style={styles.timestamp}>{formatTime(item.seconds)}</Text>
              <Pressable onPress={() => toggleBookmark(item.id)} accessibilityLabel="북마크">
                <Text style={[styles.bookmark, bookmarks.includes(item.id) && styles.bookmarkActive]}>{bookmarks.includes(item.id) ? '♥' : '♡'}</Text>
              </Pressable>
            </View>
            <Text style={[styles.korean, { fontSize, lineHeight: fontSize * 1.55 }]}>{item.korean || '한국어 인식 결과 없음'}</Text>
            <Text style={[styles.vietnamese, { fontSize: fontSize + 1, lineHeight: (fontSize + 1) * 1.55 }]}>{item.vietnamese || '번역 대기 또는 번역 결과 없음'}</Text>
            <TermList terms={item.terms} fontSize={Math.max(13, fontSize - 3)} />
          </View>
        ))}
        {(isStreaming || paused || busy) && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingSmall}>● {paused ? '일시정지 중' : processing ? '음성 인식 및 번역 중...' : '다음 음성을 기다리는 중...'}</Text>
            <Text style={styles.pendingText}>{statusMessage}</Text>
          </View>
        )}
        {saveFinished && <Text style={styles.saved}>✓ 강의가 저장되었습니다</Text>}
        {!!errorMessage && <View style={styles.errorBox}><Text style={styles.errorTitle}>오류</Text><Text style={styles.errorText}>{errorMessage}</Text></View>}
        {saveFailed && !busy && <Pressable style={styles.retryButton} onPress={retrySave}><Text style={styles.retryText}>저장 다시 시도</Text></Pressable>}
      </ScrollView>

      <View style={styles.bottomBar}>
        {!sessionStarted && !busy && !saveFinished && (
          <Pressable style={styles.primaryButton} onPress={startLecture}>
            <Text style={styles.primaryButtonText}>🎙  강의 녹음 시작</Text>
          </Pressable>
        )}
        {(isStreaming || paused) && !stopping && (
          <View style={styles.actionRow}>
            <Pressable style={styles.pauseButton} onPress={() => void togglePause()}>
              <Text style={styles.pauseText}>{paused ? '▶  계속 녹음' : 'Ⅱ  일시정지'}</Text>
            </Pressable>
            <Pressable style={styles.stopButton} onPress={stopLecture}>
              <Text style={styles.stopText}>■  녹음 종료</Text>
            </Pressable>
          </View>
        )}
        {busy && <Text style={styles.bottomInfo}>마지막 음성을 처리하고 저장하고 있습니다...</Text>}
        {saveFinished && <Pressable style={styles.primaryButton} onPress={closeLecture}><Text style={styles.primaryButtonText}>✓  완료 · 돌아가기</Text></Pressable>}
        {saveFailed && !busy && <Pressable style={styles.primaryButton} onPress={retrySave}><Text style={styles.primaryButtonText}>저장 다시 시도</Text></Pressable>}
      </View>
    </View>
  );
}

const BLUE = '#183B73';
const PALE = '#F3F5FB';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALE, paddingTop: 55 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 20 },
  back: { width: 44, height: 44, backgroundColor: '#FFFFFF', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 38, color: BLUE, marginTop: -7 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  headerTitle: { color: BLUE, fontWeight: '800', fontSize: 15 },
  language: { color: '#7251C4', fontWeight: '800', fontSize: 17, marginTop: 5 },
  headerSpacer: { width: 44 },
  toolbar: { paddingHorizontal: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerGroup: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#A4B1C4', marginRight: 5 },
  dotActive: { backgroundColor: '#148563' },
  timer: { fontSize: 29, fontWeight: '900', color: BLUE, fontVariant: ['tabular-nums'] },
  recordState: { fontSize: 12, color: '#526987', fontWeight: '700', marginLeft: 5 },
  fontControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mic: { fontSize: 18, color: BLUE },
  fontButton: { padding: 4 },
  fontButtonText: { color: BLUE, fontSize: 19, fontWeight: '800' },
  fontValue: { fontSize: 16, color: '#526987', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 17, paddingTop: 5, paddingBottom: 30, gap: 13 },
  emptyCard: { backgroundColor: '#FFFFFF', padding: 30, borderRadius: 22, alignItems: 'center', marginTop: 12 },
  emptyIcon: { fontSize: 40, marginBottom: 15 },
  emptyTitle: { fontSize: 17, color: BLUE, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: '#7487A2', lineHeight: 22, textAlign: 'center' },
  segmentCard: { backgroundColor: '#FFFFFF', padding: 19, borderRadius: 22, shadowColor: '#15284D', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  segmentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  timestamp: { fontSize: 15, color: '#6C7F9D' },
  bookmark: { fontSize: 25, color: '#6C7F9D' },
  bookmarkActive: { color: '#356BD4' },
  korean: { color: '#657895', marginBottom: 11 },
  vietnamese: { color: '#142D53', fontWeight: '700' },
  pendingCard: { backgroundColor: '#E5ECFA', borderColor: '#99AED4', borderWidth: 1, borderStyle: 'dashed', borderRadius: 22, padding: 20, minHeight: 112 },
  pendingSmall: { color: '#5C79AA', fontSize: 13, marginBottom: 10 },
  pendingText: { color: '#7287AA', fontSize: 15, lineHeight: 23 },
  bottomBar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 27, backgroundColor: PALE },
  actionRow: { flexDirection: 'row', gap: 10 },
  pauseButton: { flex: 1, backgroundColor: '#E2EBFC', borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  pauseText: { fontSize: 16, color: '#2456A1', fontWeight: '800' },
  stopButton: { flex: 1, backgroundColor: '#2759B3', borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  stopText: { fontSize: 16, color: '#FFFFFF', fontWeight: '800' },
  primaryButton: { backgroundColor: '#2759B3', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  bottomInfo: { color: '#526987', textAlign: 'center', fontSize: 14, padding: 14 },
  saved: { color: '#148563', fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  errorBox: { backgroundColor: '#FFF0F0', padding: 14, borderRadius: 12 },
  errorTitle: { color: '#9E2530', fontWeight: '800', marginBottom: 4 },
  errorText: { color: '#9E2530', fontSize: 13 },
  retryButton: { padding: 12, borderRadius: 12, backgroundColor: BLUE, alignItems: 'center' },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
