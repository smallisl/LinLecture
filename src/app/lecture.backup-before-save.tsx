import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioStream,
} from 'expo-audio';

import { fromByteArray } from 'base64-js';
import type { AudioStreamBuffer } from 'expo-audio';

// ==========================================
// 설정
// ==========================================

const SERVER_URL = 'http://192.168.219.47:3000';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const CHUNK_SECONDS = 3;

// ==========================================
// Types
// ==========================================

type AudioChunk = {
  number: number;
  data: Uint8Array;
  sampleRate: number;
  channels: number;
};

// ==========================================
// Screen
// ==========================================

export default function LectureScreen() {
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');

  const [statusMessage, setStatusMessage] =
    useState('강의 시작 준비 완료');

  const [errorMessage, setErrorMessage] = useState('');
  const [chunkCount, setChunkCount] = useState(0);
  const [processing, setProcessing] = useState(false);

  // ========================================
  // refs
  // ========================================

  const sessionActiveRef = useRef(false);

  const pcmPartsRef = useRef<Uint8Array[]>([]);
  const pcmBytesRef = useRef(0);

  const sampleRateRef = useRef(SAMPLE_RATE);
  const channelsRef = useRef(CHANNELS);

  const chunkNumberRef = useRef(0);

  const queueRef = useRef<AudioChunk[]>([]);
  const sendingRef = useRef(false);

  // ========================================
  // Queue
  // ========================================

  const processQueue = async () => {
    if (sendingRef.current) {
      return;
    }

    const chunk = queueRef.current.shift();

    if (!chunk) {
      setProcessing(false);
      return;
    }

    sendingRef.current = true;
    setProcessing(true);

    try {
      console.log('');
      console.log(
        `⬆️ Chunk ${chunk.number} Base64 변환 시작`
      );

      const audioBase64 = fromByteArray(chunk.data);

      console.log(
        `Base64 length: ${audioBase64.length}`
      );

      console.log(
        `⬆️ Chunk ${chunk.number} 서버 전송`
      );

      const startedAt = Date.now();

      const response = await fetch(
        `${SERVER_URL}/transcribe-base64`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            audioBase64,
            sampleRate: chunk.sampleRate,
            channels: chunk.channels,
            chunkNumber: chunk.number,
          }),
        }
      );

      const responseText = await response.text();

      console.log(`📥 HTTP ${response.status}`);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${responseText}`
        );
      }

      let data: {
        text?: string;
        translation?: string;
        processingTime?: number;
        chunkNumber?: number;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `JSON 응답 오류: ${responseText}`
        );
      }

      const totalTime =
        (Date.now() - startedAt) / 1000;

      console.log(
        `⚡ Chunk ${chunk.number} 전체 처리 시간: ${totalTime.toFixed(
          2
        )}초`
      );

      // ==================================
      // 한국어 원문
      // ==================================

      if (data.text && data.text.trim()) {
        const newText = data.text.trim();

        console.log(
          `📝 Chunk ${chunk.number}: ${newText}`
        );

        setTranscript((previous) => {
          if (!previous) {
            return newText;
          }

          return previous + '\n' + newText;
        });

        setChunkCount(
          (previous) => previous + 1
        );
      }

      // ==================================
      // 베트남어 번역
      // ==================================

      if (
        data.translation &&
        data.translation.trim()
      ) {
        const newTranslation =
          data.translation.trim();

        console.log(
          `🇻🇳 Chunk ${chunk.number}: ${newTranslation}`
        );

        setTranslation((previous) => {
          if (!previous) {
            return newTranslation;
          }

          return (
            previous +
            '\n' +
            newTranslation
          );
        });
      }
    } catch (error: any) {
      console.log(
        '❌ STT/번역 오류:',
        error
      );

      setErrorMessage(
        error?.message ||
          '음성 인식 또는 번역 중 오류가 발생했습니다.'
      );
    } finally {
      sendingRef.current = false;

      if (queueRef.current.length > 0) {
        void processQueue();
      } else {
        setProcessing(false);
      }
    }
  };

  // ========================================
  // PCM → Chunk
  // ========================================

  const createChunk = () => {
    if (pcmBytesRef.current <= 0) {
      return;
    }

    const merged = new Uint8Array(
      pcmBytesRef.current
    );

    let offset = 0;

    for (const part of pcmPartsRef.current) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    pcmPartsRef.current = [];
    pcmBytesRef.current = 0;

    chunkNumberRef.current += 1;

    const chunk: AudioChunk = {
      number: chunkNumberRef.current,
      data: merged,
      sampleRate: sampleRateRef.current,
      channels: channelsRef.current,
    };

    console.log('');
    console.log(
      `🎙️ PCM Chunk ${chunk.number} 생성`
    );

    console.log(
      `PCM bytes: ${chunk.data.byteLength}`
    );

    console.log(
      `sampleRate: ${chunk.sampleRate}`
    );

    console.log(
      `channels: ${chunk.channels}`
    );

    queueRef.current.push(chunk);

    void processQueue();
  };

  // ========================================
  // Audio buffer
  // ========================================

  const handleAudioBuffer = (
    buffer: AudioStreamBuffer
  ) => {
    if (!sessionActiveRef.current) {
      return;
    }

    sampleRateRef.current = buffer.sampleRate;
    channelsRef.current = buffer.channels;

    const nativeData = new Uint8Array(
      buffer.data
    );

    const copiedData = new Uint8Array(
      nativeData.length
    );

    copiedData.set(nativeData);

    pcmPartsRef.current.push(copiedData);

    pcmBytesRef.current +=
      copiedData.byteLength;

    // int16 = 2 bytes/sample
    const bytesPerSecond =
      buffer.sampleRate *
      buffer.channels *
      2;

    const targetBytes =
      bytesPerSecond * CHUNK_SECONDS;

    if (
      pcmBytesRef.current >= targetBytes
    ) {
      createChunk();
    }
  };

  // ========================================
  // Continuous AudioStream
  // ========================================

  const {
    stream,
    isStreaming,
  } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    encoding: 'int16',
    onBuffer: handleAudioBuffer,
  });

  // ========================================
  // 강의 시작
  // ========================================

  const startLecture = async () => {
    try {
      setErrorMessage('');

      const permission =
        await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '권한 필요',
          '마이크 사용 권한이 필요합니다.'
        );

        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // 새 세션 초기화
      pcmPartsRef.current = [];
      pcmBytesRef.current = 0;

      queueRef.current = [];
      chunkNumberRef.current = 0;

      sendingRef.current = false;

      sampleRateRef.current =
        SAMPLE_RATE;

      channelsRef.current =
        CHANNELS;

      // 이전 결과 초기화
      setTranscript('');
      setTranslation('');
      setChunkCount(0);
      setProcessing(false);

      sessionActiveRef.current = true;

      setStatusMessage(
        '연속 음성 수집을 시작하고 있습니다'
      );

      await stream.start();

      setStatusMessage(
        '강의 음성을 연속으로 듣고 있습니다'
      );

      console.log('');
      console.log(
        '================================'
      );

      console.log(
        '🎙️ Continuous AudioStream 시작'
      );

      console.log(
        'sampleRate:',
        stream.sampleRate
      );

      console.log(
        'channels:',
        stream.channels
      );

      console.log(
        '================================'
      );
    } catch (error: any) {
      sessionActiveRef.current = false;

      console.log(
        '❌ AudioStream 시작 오류:',
        error
      );

      setStatusMessage(
        '강의 시작 실패'
      );

      setErrorMessage(
        error?.message ||
          '강의를 시작할 수 없습니다.'
      );
    }
  };

  // ========================================
  // 강의 종료
  // ========================================

  const stopLecture = () => {
    try {
      sessionActiveRef.current = false;

      stream.stop();

      console.log(
        '■ Continuous AudioStream 종료'
      );

      // 마지막 남은 음성도 처리
      if (pcmBytesRef.current > 0) {
        createChunk();
      }

      if (
        sendingRef.current ||
        queueRef.current.length > 0
      ) {
        setStatusMessage(
          '마지막 음성을 처리하고 있습니다'
        );
      } else {
        setStatusMessage(
          '강의 음성 인식 및 번역 완료'
        );
      }
    } catch (error: any) {
      console.log(
        '❌ AudioStream 종료 오류:',
        error
      );

      setErrorMessage(
        error?.message ||
          '강의를 종료할 수 없습니다.'
      );
    }
  };

  // ========================================
  // Close
  // ========================================

  const closeLecture = () => {
    sessionActiveRef.current = false;

    try {
      stream.stop();
    } catch {}

    router.back();
  };

  // ========================================
  // Cleanup
  // ========================================

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;

      try {
        stream.stop();
      } catch {}
    };
  }, [stream]);

  // ========================================
  // UI
  // ========================================

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={closeLecture}
        >
          <Text
            style={styles.backButton}
          >
            ‹
          </Text>
        </Pressable>

        <Text
          style={styles.headerTitle}
        >
          실시간 강의
        </Text>

        <View
          style={styles.headerSpace}
        />
      </View>

      <View style={styles.statusBox}>
        <View
          style={[
            styles.statusDot,

            isStreaming &&
              styles.recordingDot,

            processing &&
              styles.processingDot,
          ]}
        />

        <Text
          style={styles.statusText}
        >
          {statusMessage}
        </Text>
      </View>

      <Pressable
        style={[
          styles.recordButton,

          isStreaming &&
            styles.stopButton,
        ]}
        onPress={
          isStreaming
            ? stopLecture
            : startLecture
        }
      >
        <Text
          style={
            styles.recordButtonText
          }
        >
          {isStreaming
            ? '■ 강의 종료'
            : '🎙️ 강의 시작'}
        </Text>
      </Pressable>

      {isStreaming && (
        <Text
          style={styles.liveInfo}
        >
          연속 음성 수집 중 · 처리된 구간{' '}
          {chunkCount}개
        </Text>
      )}

      {/* 한국어 원문 */}

      <Text
        style={styles.sectionTitle}
      >
        한국어 원문
      </Text>

      <View style={styles.textBox}>
        <ScrollView>
          <Text
            style={
              transcript
                ? styles.transcriptText
                : styles.placeholderText
            }
          >
            {transcript ||
              '강의를 시작하면 한국어 음성이 자동으로 텍스트로 변환됩니다.'}
          </Text>
        </ScrollView>
      </View>

      {/* 베트남어 번역 */}

      <Text
        style={styles.sectionTitle}
      >
        베트남어 번역
      </Text>

      <View
        style={styles.translationBox}
      >
        <ScrollView>
          <Text
            style={
              translation
                ? styles.transcriptText
                : styles.placeholderText
            }
          >
            {translation ||
              '한국어 원문이 인식되면 베트남어 번역이 표시됩니다.'}
          </Text>
        </ScrollView>
      </View>

      {processing && (
        <View style={styles.fileBox}>
          <Text
            style={styles.fileTitle}
          >
            음성 인식 및 번역 처리 중
          </Text>

          <Text
            style={styles.fileText}
          >
            Whisper와 번역 엔진이 음성을 처리하고 있습니다.
          </Text>
        </View>
      )}

      {errorMessage !== '' && (
        <View style={styles.errorBox}>
          <Text
            style={styles.errorTitle}
          >
            오류
          </Text>

          <Text
            style={styles.errorText}
          >
            {errorMessage}
          </Text>
        </View>
      )}

      <Pressable
        style={styles.closeButton}
        onPress={closeLecture}
      >
        <Text
          style={
            styles.closeButtonText
          }
        >
          강의 화면 닫기
        </Text>
      </Pressable>
    </View>
  );
}

// ==========================================
// Styles
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 60,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom: 25,
  },

  backButton: {
    fontSize: 40,
    fontWeight: '300',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },

  headerSpace: {
    width: 30,
  },

  statusBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#999999',
    marginRight: 8,
  },

  recordingDot: {
    backgroundColor: '#ff3b30',
  },

  processingDot: {
    backgroundColor: '#ff9500',
  },

  statusText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  recordButton: {
    backgroundColor: '#111111',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
  },

  stopButton: {
    backgroundColor: '#d32f2f',
  },

  recordButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  liveInfo: {
    textAlign: 'center',
    fontSize: 13,
    color: '#777777',
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },

  textBox: {
    minHeight: 140,
    maxHeight: 190,
    backgroundColor: '#f4f4f4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },

  translationBox: {
    minHeight: 105,
    maxHeight: 150,
    backgroundColor: '#f4f4f4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },

  transcriptText: {
    fontSize: 17,
    lineHeight: 27,
    color: '#111111',
  },

  placeholderText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#888888',
  },

  fileBox: {
    backgroundColor: '#f4f4f4',
    padding: 13,
    borderRadius: 12,
    marginBottom: 12,
  },

  fileTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  fileText: {
    fontSize: 12,
    color: '#777777',
    marginTop: 4,
  },

  errorBox: {
    backgroundColor: '#fff1f0',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },

  errorTitle: {
    fontWeight: '700',
    marginBottom: 5,
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },

  closeButton: {
    borderWidth: 1,
    borderColor: '#dddddd',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 25,
  },

  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});