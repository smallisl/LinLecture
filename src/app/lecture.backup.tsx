import { router } from 'expo-router';
import { useState } from 'react';
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

export default function LectureScreen() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [recordingUri, setRecordingUri] =
    useState<string | null>(null);

  const [transcript, setTranscript] = useState('');

  const [statusMessage, setStatusMessage] =
    useState('녹음 준비 완료');

  const [errorMessage, setErrorMessage] = useState('');

  // 녹음 시작 이벤트
  useSpeechRecognitionEvent('audiostart', () => {
    setRecording(true);
    setStatusMessage('강의 음성을 녹음하고 있습니다');
    setErrorMessage('');
  });

  // WAV 파일 생성 완료
  useSpeechRecognitionEvent('audioend', (event) => {
    console.log('WAV 파일:', event.uri);

    setRecording(false);

    if (event.uri) {
      setRecordingUri(event.uri);
      setStatusMessage('녹음 파일 생성 완료');
    } else {
      setStatusMessage('녹음 파일 생성 실패');
    }
  });

  // Apple STT의 no-speech 오류는 무시
  useSpeechRecognitionEvent('error', (event) => {
    console.log(
      'Speech Recognition:',
      event.error,
      event.message
    );

    if (event.error !== 'no-speech') {
      setErrorMessage(
        `${event.error}: ${event.message ?? ''}`
      );
    }
  });

  // 녹음 시작
  const startRecording = async () => {
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

      setTranscript('');
      setRecordingUri(null);
      setErrorMessage('');
      setStatusMessage('녹음을 시작하고 있습니다');

      ExpoSpeechRecognitionModule.start({
        lang: 'ko-KR',
        interimResults: false,

        recordingOptions: {
          persist: true,
          outputFileName: 'linlecture_recording.wav',
          outputSampleRate: 16000,
          outputEncoding: 'pcmFormatInt16',
        },
      });
    } catch (error: any) {
      console.log('녹음 시작 오류:', error);

      setStatusMessage('녹음 시작 실패');

      setErrorMessage(
        error?.message ?? '녹음을 시작할 수 없습니다.'
      );
    }
  };

  // 녹음 종료
  const stopRecording = () => {
    setStatusMessage('녹음을 종료하고 있습니다');

    ExpoSpeechRecognitionModule.stop();
  };

  // WAV → Mac Server → OpenAI STT
  const sendAudioToServer = async () => {
    if (!recordingUri) {
      Alert.alert(
        '녹음 파일 없음',
        '먼저 강의 음성을 녹음해 주세요.'
      );
      return;
    }

    try {
      setProcessing(true);
      setTranscript('');
      setErrorMessage('');

      setStatusMessage(
        '한국어 음성을 텍스트로 변환하고 있습니다'
      );

      console.log('WAV URI:', recordingUri);
      console.log(
        '전송 주소:',
        `${SERVER_URL}/transcribe`
      );

      const result = await FileSystem.uploadAsync(
        `${SERVER_URL}/transcribe`,
        recordingUri,
        {
          httpMethod: 'POST',

          uploadType:
            FileSystem.FileSystemUploadType.MULTIPART,

          // server.js의 upload.single("audio")와 동일해야 함
          fieldName: 'audio',

          mimeType: 'audio/wav',
        }
      );

      console.log('HTTP 상태:', result.status);
      console.log('서버 응답:', result.body);

      let data: any;

      try {
        data = JSON.parse(result.body);
      } catch {
        throw new Error(
          `서버 응답을 읽을 수 없습니다. HTTP ${result.status}`
        );
      }

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          data.detail ||
            data.error ||
            `서버 오류: HTTP ${result.status}`
        );
      }

      if (!data.text) {
        throw new Error(
          '한국어 인식 결과가 없습니다.'
        );
      }

      setTranscript(data.text);

      setStatusMessage('한국어 음성 인식 완료');

    } catch (error: any) {
      console.log('업로드/STT 오류:', error);

      setStatusMessage('음성 인식 실패');

      setErrorMessage(
        error?.message ??
          '음성 인식 중 오류가 발생했습니다.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const closeLecture = () => {
    if (recording) {
      ExpoSpeechRecognitionModule.abort();
    }

    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={closeLecture}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          실시간 강의
        </Text>

        <View style={styles.headerSpace} />
      </View>

      <View style={styles.statusBox}>
        <View
          style={[
            styles.statusDot,
            recording && styles.recordingDot,
            processing && styles.processingDot,
          ]}
        />

        <Text style={styles.statusText}>
          {statusMessage}
        </Text>
      </View>

      <Pressable
        style={[
          styles.recordButton,
          recording && styles.stopButton,
          processing && styles.disabledButton,
        ]}
        onPress={
          recording
            ? stopRecording
            : startRecording
        }
        disabled={processing}
      >
        <Text style={styles.recordButtonText}>
          {recording
            ? '■ 녹음 종료'
            : '🎙️ 녹음 시작'}
        </Text>
      </Pressable>

      {recordingUri && !recording && (
        <Pressable
          style={[
            styles.convertButton,
            processing && styles.disabledButton,
          ]}
          onPress={sendAudioToServer}
          disabled={processing}
        >
          <Text style={styles.convertButtonText}>
            {processing
              ? '음성 변환 중...'
              : '📝 한국어 텍스트 변환'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>
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
              '강의 음성을 녹음한 후 텍스트로 변환해 주세요.'}
          </Text>
        </ScrollView>
      </View>

      <Text style={styles.sectionTitle}>
        베트남어 번역
      </Text>

      <View style={styles.translationBox}>
        <Text style={styles.placeholderText}>
          한국어 원문 인식이 완료되면 베트남어 번역이 표시됩니다.
        </Text>
      </View>

      {recordingUri && (
        <View style={styles.fileBox}>
          <Text style={styles.fileTitle}>
            ✓ 녹음 파일 생성 완료
          </Text>

          <Text style={styles.fileText}>
            linlecture_recording.wav
          </Text>
        </View>
      )}

      {errorMessage !== '' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>
            오류
          </Text>

          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      )}

      <Pressable
        style={styles.closeButton}
        onPress={closeLecture}
      >
        <Text style={styles.closeButtonText}>
          강의 화면 닫기
        </Text>
      </Pressable>
    </View>
  );
}

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
    justifyContent: 'space-between',
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
    marginBottom: 12,
  },

  stopButton: {
    backgroundColor: '#d32f2f',
  },

  disabledButton: {
    opacity: 0.55,
  },

  recordButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  convertButton: {
    backgroundColor: '#eeeeee',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 24,
  },

  convertButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  textBox: {
    minHeight: 130,
    maxHeight: 170,
    backgroundColor: '#f4f4f4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },

  translationBox: {
    minHeight: 110,
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
  },

  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});