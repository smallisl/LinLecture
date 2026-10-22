import { router } from 'expo-router';
import { useRef, useState } from 'react';

import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL = 'http://192.168.0.29:3000';

// 4초마다 음성을 나누어 처리
const CHUNK_DURATION = 4000;

// 다음 녹음 시작 전 최소 대기 시간
const NEXT_CHUNK_DELAY = 50;

export default function LectureScreen() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [transcript, setTranscript] = useState('');

  const [statusMessage, setStatusMessage] =
    useState('강의 시작 준비 완료');

  const [errorMessage, setErrorMessage] = useState('');

  const [chunkCount, setChunkCount] = useState(0);

  // 전체 강의 세션 상태
  const sessionActiveRef = useRef(false);

  // 현재 녹음 타이머
  const chunkTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  // 현재 chunk 번호
  const chunkIndexRef = useRef(0);

  // 중복 start 방지
  const startingChunkRef = useRef(false);

  // 동시에 처리 중인 Whisper 요청 수
  const processingCountRef = useRef(0);

  // ==========================================
  // Processing 상태 관리
  // ==========================================

  const beginProcessing = () => {
    processingCountRef.current += 1;
    setProcessing(true);
  };

  const endProcessing = () => {
    processingCountRef.current = Math.max(
      0,
      processingCountRef.current - 1
    );

    if (processingCountRef.current === 0) {
      setProcessing(false);
    }
  };

  // ==========================================
  // WAV → Mac Whisper Server
  // ==========================================

  const sendChunkToServer = async (
    uri: string,
    chunkNumber: number
  ) => {
    const requestStartedAt = Date.now();

    try {
      beginProcessing();

      console.log('');
      console.log(
        `===== Chunk ${chunkNumber} =====`
      );

      console.log(
        `Chunk ${chunkNumber} 전송 시작`
      );

      const result = await FileSystem.uploadAsync(
        `${SERVER_URL}/transcribe`,
        uri,
        {
          httpMethod: 'POST',

          uploadType:
            FileSystem.FileSystemUploadType.MULTIPART,

          fieldName: 'audio',

          mimeType: 'audio/wav',
        }
      );

      const totalTime =
        (Date.now() - requestStartedAt) / 1000;

      console.log(
        `Chunk ${chunkNumber} 전체 요청 시간: ${totalTime.toFixed(
          2
        )}초`
      );

      console.log(
        `Chunk ${chunkNumber} HTTP 상태:`,
        result.status
      );

      let data: any;

      try {
        data = JSON.parse(result.body);
      } catch {
        throw new Error(
          `서버 응답을 읽을 수 없습니다. HTTP ${result.status}`
        );
      }

      if (
        result.status < 200 ||
        result.status >= 300
      ) {
        throw new Error(
          data.detail ||
            data.error ||
            `서버 오류: HTTP ${result.status}`
        );
      }

      // Whisper 결과가 있는 경우
      if (
        data.text &&
        typeof data.text === 'string' &&
        data.text.trim()
      ) {
        const newText = data.text.trim();

        console.log(
          `Chunk ${chunkNumber} 한국어:`,
          newText
        );

        // 기존 텍스트를 지우지 않고 계속 추가
        setTranscript((previous) => {
          if (!previous) {
            return newText;
          }

          return `${previous}\n${newText}`;
        });

        setChunkCount(
          (previous) => previous + 1
        );
      }

      if (sessionActiveRef.current) {
        setStatusMessage(
          '강의를 녹음하면서 한국어를 인식하고 있습니다'
        );
      } else if (
        processingCountRef.current <= 1
      ) {
        setStatusMessage(
          '강의 음성 인식 완료'
        );
      }
    } catch (error: any) {
      console.log(
        `Chunk ${chunkNumber} STT 오류:`,
        error
      );

      setErrorMessage(
        error?.message ??
          '음성 인식 중 오류가 발생했습니다.'
      );

      if (sessionActiveRef.current) {
        setStatusMessage(
          '녹음은 계속 진행 중입니다'
        );
      } else {
        setStatusMessage(
          '음성 인식 중 오류 발생'
        );
      }
    } finally {
      endProcessing();
    }
  };

  // ==========================================
  // 다음 녹음 chunk 시작
  // ==========================================

  const startNextChunk = () => {
    if (!sessionActiveRef.current) {
      return;
    }

    if (startingChunkRef.current) {
      return;
    }

    try {
      startingChunkRef.current = true;

      chunkIndexRef.current += 1;

      const chunkNumber =
        chunkIndexRef.current;

      console.log('');
      console.log(
        `🎙️ Chunk ${chunkNumber} 녹음 시작`
      );

      ExpoSpeechRecognitionModule.start({
        lang: 'ko-KR',

        interimResults: false,

        recordingOptions: {
          persist: true,

          outputFileName:
            `linlecture_chunk_${chunkNumber}.wav`,

          outputSampleRate: 16000,

          outputEncoding:
            'pcmFormatInt16',
        },
      });

      // 4초 후 현재 chunk 종료
      chunkTimerRef.current = setTimeout(
        () => {
          if (
            sessionActiveRef.current
          ) {
            console.log(
              `■ Chunk ${chunkNumber} 녹음 종료`
            );

            ExpoSpeechRecognitionModule.stop();
          }
        },
        CHUNK_DURATION
      );
    } catch (error: any) {
      startingChunkRef.current = false;

      console.log(
        'Chunk 녹음 시작 오류:',
        error
      );

      setErrorMessage(
        error?.message ??
          '녹음을 시작할 수 없습니다.'
      );
    }
  };

  // ==========================================
  // 실제 녹음 시작 이벤트
  // ==========================================

  useSpeechRecognitionEvent(
    'audiostart',
    () => {
      startingChunkRef.current = false;

      setRecording(true);

      setErrorMessage('');

      if (sessionActiveRef.current) {
        setStatusMessage(
          '강의를 녹음하면서 한국어를 인식하고 있습니다'
        );
      }
    }
  );

  // ==========================================
  // 한 chunk WAV 생성 완료
  // ==========================================

  useSpeechRecognitionEvent(
    'audioend',
    (event) => {
      console.log(
        'WAV 파일 생성:',
        event.uri
      );

      if (chunkTimerRef.current) {
        clearTimeout(
          chunkTimerRef.current
        );

        chunkTimerRef.current = null;
      }

      const finishedChunk =
        chunkIndexRef.current;

      // WAV가 생성되었으면
      // Whisper 처리를 비동기로 시작
      if (event.uri) {
        void sendChunkToServer(
          event.uri,
          finishedChunk
        );
      }

      // 전체 강의가 계속 진행 중이면
      // 거의 바로 다음 녹음 시작
      if (sessionActiveRef.current) {
        setTimeout(() => {
          if (
            sessionActiveRef.current
          ) {
            startNextChunk();
          }
        }, NEXT_CHUNK_DELAY);
      } else {
        setRecording(false);
      }
    }
  );

  // ==========================================
  // Apple Speech Recognition 오류
  // ==========================================

  useSpeechRecognitionEvent(
    'error',
    (event) => {
      console.log(
        'Speech Recognition:',
        event.error,
        event.message
      );

      // Apple STT는 사용하지 않기 때문에
      // no-speech 오류는 무시
      if (
        event.error !== 'no-speech' &&
        sessionActiveRef.current
      ) {
        setErrorMessage(
          `${event.error}: ${
            event.message ?? ''
          }`
        );
      }
    }
  );

  // ==========================================
  // 전체 강의 시작
  // ==========================================

  const startLecture = async () => {
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '권한 필요',
          '마이크 사용 권한이 필요합니다.'
        );

        return;
      }

      // 새 강의 시작
      setTranscript('');
      setChunkCount(0);
      setErrorMessage('');

      chunkIndexRef.current = 0;
      processingCountRef.current = 0;

      sessionActiveRef.current = true;

      setRecording(true);

      setStatusMessage(
        '강의를 시작하고 있습니다'
      );

      startNextChunk();
    } catch (error: any) {
      sessionActiveRef.current = false;

      setRecording(false);

      setStatusMessage(
        '강의 시작 실패'
      );

      setErrorMessage(
        error?.message ??
          '강의를 시작할 수 없습니다.'
      );
    }
  };

  // ==========================================
  // 전체 강의 종료
  // ==========================================

  const stopLecture = () => {
    console.log('');
    console.log(
      '===== 전체 강의 종료 ====='
    );

    // 먼저 false로 변경
    // audioend 이후 새 chunk가 시작되지 않게 함
    sessionActiveRef.current = false;

    if (chunkTimerRef.current) {
      clearTimeout(
        chunkTimerRef.current
      );

      chunkTimerRef.current = null;
    }

    setStatusMessage(
      '마지막 음성을 처리하고 있습니다'
    );

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.log(
        '강의 종료 오류:',
        error
      );

      setRecording(false);
    }
  };

  // ==========================================
  // 화면 닫기
  // ==========================================

  const closeLecture = () => {
    sessionActiveRef.current = false;

    if (chunkTimerRef.current) {
      clearTimeout(
        chunkTimerRef.current
      );

      chunkTimerRef.current = null;
    }

    if (recording) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    }

    router.back();
  };

  // ==========================================
  // UI
  // ==========================================

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

            recording &&
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

          recording &&
            styles.stopButton,
        ]}
        onPress={
          recording
            ? stopLecture
            : startLecture
        }
      >
        <Text
          style={
            styles.recordButtonText
          }
        >
          {recording
            ? '■ 강의 종료'
            : '🎙️ 강의 시작'}
        </Text>
      </Pressable>

      {recording && (
        <Text
          style={styles.liveInfo}
        >
          실시간 음성 인식 중 · 처리된
          구간 {chunkCount}개
        </Text>
      )}

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
              styles.placeholderText
            }
          >
            한국어 원문이 인식되면 베트남어 번역이 표시됩니다.
          </Text>
        </ScrollView>
      </View>

      {processing && (
        <View
          style={styles.fileBox}
        >
          <Text
            style={styles.fileTitle}
          >
            한국어 음성 처리 중
          </Text>

          <Text
            style={styles.fileText}
          >
            Whisper가 녹음된 구간을 분석하고 있습니다.
          </Text>
        </View>
      )}

      {errorMessage !== '' && (
        <View
          style={styles.errorBox}
        >
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
    minHeight: 130,
    maxHeight: 170,
    backgroundColor: '#f4f4f4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },

  translationBox: {
    minHeight: 110,
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