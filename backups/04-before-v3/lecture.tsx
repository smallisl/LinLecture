import AsyncStorage from '@react-native-async-storage/async-storage';
import { fromByteArray } from 'base64-js';
import type { AudioStreamBuffer } from 'expo-audio';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const SERVER_URL = "http://192.168.219.46:3000";
const STORAGE_KEY = '@LinLecture:lectures';
const DEFAULT_SUBJECT = '임베디드시스템및실습';
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const CHUNK_SECONDS = 3;

type AudioChunk = { number: number; data: Uint8Array; sampleRate: number; channels: number };
type LectureRecord = {
  id: string;
  subject: string;
  startedAt: string;
  endedAt: string;
  korean: string;
  vietnamese: string;
};

export default function LectureScreen() {
  const { subject } = useLocalSearchParams<{ subject?: string | string[] }>();
  const selectedSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : DEFAULT_SUBJECT;

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
  const subjectRef = useRef(selectedSubject);
  subjectRef.current = selectedSubject;

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
      const item: LectureRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        subject: subjectRef.current,
        startedAt: startedAtRef.current || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        korean,
        vietnamese,
      };
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const previous: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(previous)) throw new Error('저장 데이터 형식이 올바르지 않습니다.');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...previous]));
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
    try {
      const response = await fetch(`${SERVER_URL}/transcribe-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: fromByteArray(chunk.data),
          sampleRate: chunk.sampleRate,
          channels: chunk.channels,
          chunkNumber: chunk.number,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
      const data: { text?: string; translation?: string } = JSON.parse(body);
      if (closedRef.current) return;
      if (data.text?.trim()) {
        const value = data.text.trim();
        transcriptRef.current = transcriptRef.current ? transcriptRef.current + '\n' + value : value;
        setTranscript(transcriptRef.current);
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
      hadChunkErrorRef.current = false;
      setTranscript('');
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

  const stopLecture = () => {
    if (stopping || savingRef.current) return;
    setStopping(true);
    sessionActiveRef.current = false;
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
    if (isStreaming || sendingRef.current || savingRef.current || queueRef.current.length > 0) return;
    setErrorMessage('');
    setSaveFailed(false);
    stopPendingRef.current = true;
    void saveLecture();
  };

  const closeLecture = () => {
    if (isStreaming || processing || saving || stopping && !saveFinished) {
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={closeLecture}><Text style={styles.backButton}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>실시간 강의</Text>
        <View style={{ width: 30 }} />
      </View>
      <Text style={styles.subject}>{selectedSubject}</Text>
      <View style={styles.statusBox}>
        <View style={[styles.statusDot, isStreaming && styles.recordingDot, busy && styles.processingDot]} />
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>
      <Pressable
        style={[styles.recordButton, isStreaming && styles.stopButton, (!isStreaming && busy) && styles.disabledButton]}
        disabled={!isStreaming && busy}
        onPress={isStreaming ? stopLecture : startLecture}
      >
        <Text style={styles.recordButtonText}>
          {isStreaming ? '■ 강의 종료' : busy ? '처리 중...' : '🎙️ 강의 시작'}
        </Text>
      </Pressable>
      <Text style={styles.liveInfo}>처리된 구간 {chunkCount}개</Text>
      <Text style={styles.sectionTitle}>한국어 원문</Text>
      <View style={styles.textBox}>
        <ScrollView><Text style={transcript ? styles.bodyText : styles.placeholder}>
          {transcript || '강의를 시작하면 한국어 음성이 자동으로 텍스트로 변환됩니다.'}
        </Text></ScrollView>
      </View>
      <Text style={styles.sectionTitle}>베트남어 번역</Text>
      <View style={styles.textBox}>
        <ScrollView><Text style={translation ? styles.bodyText : styles.placeholder}>
          {translation || '한국어 원문이 인식되면 베트남어 번역이 표시됩니다.'}
        </Text></ScrollView>
      </View>
      {busy && <Text style={styles.info}>음성 인식 및 번역 처리 중입니다. 잠시 기다려 주세요.</Text>}
      {saveFinished && <Text style={styles.saved}>✓ 강의가 저장되었습니다</Text>}
      {!!errorMessage && <View style={styles.errorBox}><Text style={styles.errorTitle}>오류</Text><Text style={styles.errorText}>{errorMessage}</Text></View>}
      {saveFailed && !busy && (
        <Pressable style={styles.retryButton} onPress={retrySave}>
          <Text style={styles.retryText}>강의 저장 다시 시도</Text>
        </Pressable>
      )}
      <Pressable style={styles.closeButton} onPress={closeLecture}>
        <Text style={styles.closeButtonText}>강의 화면 닫기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backButton: { fontSize: 40, fontWeight: '300' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  subject: { fontSize: 15, textAlign: 'center', color: '#555', marginBottom: 15 },
  statusBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#999', marginRight: 8 },
  recordingDot: { backgroundColor: '#ff3b30' },
  processingDot: { backgroundColor: '#ff9500' },
  statusText: { fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  recordButton: { backgroundColor: '#111', paddingVertical: 17, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
  stopButton: { backgroundColor: '#d32f2f' },
  disabledButton: { backgroundColor: '#888' },
  recordButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  liveInfo: { textAlign: 'center', fontSize: 13, color: '#777', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, marginTop: 10 },
  textBox: { flex: 1, minHeight: 110, backgroundColor: '#f4f4f4', borderRadius: 14, padding: 16, marginBottom: 10 },
  bodyText: { fontSize: 17, lineHeight: 27, color: '#111' },
  placeholder: { fontSize: 15, lineHeight: 23, color: '#888' },
  info: { fontSize: 13, color: '#777', textAlign: 'center', marginBottom: 8 },
  saved: { fontSize: 15, color: '#267a37', textAlign: 'center', marginBottom: 8, fontWeight: '700' },
  errorBox: { backgroundColor: '#fff1f0', padding: 12, borderRadius: 12, marginBottom: 8 },
  errorTitle: { fontWeight: '700', marginBottom: 4 },
  errorText: { fontSize: 12, lineHeight: 18 },
  retryButton: { backgroundColor: '#222', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  closeButton: { borderWidth: 1, borderColor: '#ddd', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 20 },
  closeButtonText: { fontSize: 16, fontWeight: '600' },
});
