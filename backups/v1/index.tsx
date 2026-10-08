
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SUBJECTS = [
  '임베디드시스템및실습',
  '인공지능',
  '데이터베이스',
  '소프트웨어공학',
  '네트워크프로그래밍및보안',
];

export default function HomeScreen() {
  const [selectedSubject, setSelectedSubject] =
    useState('임베디드시스템및실습');

  const [showSubjects, setShowSubjects] = useState(false);

  const selectSubject = (subject: string) => {
    setSelectedSubject(subject);
    setShowSubjects(false);
  };

  const openLecture = () => {
    router.push({
      pathname: '/lecture',
      params: { subject: selectedSubject },
    });
  };

  const openHistory = () => {
    console.log('📚 이전 강의 기록 화면 열기');
    router.push('/history');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
    >
      <Text style={styles.title}>LinLecture</Text>

      <Text style={styles.subtitle}>
        실시간 강의 번역 및 복습
      </Text>

      <Text style={styles.message}>
        외국인 유학생의 강의 이해와 복습을 도와드립니다.
      </Text>

      <Text style={styles.label}>과목 선택</Text>

      <Pressable
        style={styles.subjectBox}
        onPress={() => setShowSubjects(!showSubjects)}
      >
        <Text style={styles.subjectText}>
          {selectedSubject}
        </Text>

        <Text style={styles.arrow}>
          {showSubjects ? '▲' : '▼'}
        </Text>
      </Pressable>

      {showSubjects && (
        <View style={styles.subjectList}>
          {SUBJECTS.map((subject) => (
            <Pressable
              key={subject}
              style={styles.subjectItem}
              onPress={() => selectSubject(subject)}
            >
              <Text style={styles.subjectItemText}>
                {subject}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        style={styles.startButton}
        onPress={openLecture}
      >
        <Text style={styles.startButtonText}>
          🎙️ 강의 시작
        </Text>
      </Pressable>

      <Pressable
        style={styles.historyButton}
        onPress={openHistory}
      >
        <Text style={styles.historyButtonText}>
          📚 이전 강의 기록
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 40,
  },

  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111111',
  },

  subtitle: {
    fontSize: 18,
    marginTop: 8,
    textAlign: 'center',
    color: '#333333',
  },

  message: {
    fontSize: 16,
    marginTop: 30,
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 24,
    color: '#555555',
  },

  label: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
  },

  subjectBox: {
    width: '100%',
    padding: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  subjectText: {
    fontSize: 16,
    flexShrink: 1,
  },

  arrow: {
    fontSize: 14,
  },

  subjectList: {
    width: '100%',
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },

  subjectItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },

  subjectItemText: {
    fontSize: 15,
  },

  startButton: {
    width: '100%',
    marginTop: 30,
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#222222',
    alignItems: 'center',
  },

  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },

  historyButton: {
    width: '100%',
    marginTop: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  historyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
  },
});
