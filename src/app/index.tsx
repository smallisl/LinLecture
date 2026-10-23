
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addSubject, DEFAULT_SUBJECTS, loadSubjects, removeSubject } from '@/lib/subjects';

export default function HomeScreen() {
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedSubject, setSelectedSubject] =
    useState('임베디드시스템및실습');

  const [showSubjects, setShowSubjects] = useState(false);
  const [newSubject, setNewSubject] = useState('');

  // 저장된 과목 목록 불러오기
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadSubjects().then(list => {
      if (!active) return;
      setSubjects(list);
      setSelectedSubject(current => list.includes(current) ? current : list[0]);
    });
    return () => { active = false; };
  }, []));

  const createSubject = async () => {
    try {
      const list = await addSubject(newSubject);
      const added = list[list.length - 1];
      setSubjects(list);
      setSelectedSubject(added);
      setNewSubject('');
      setShowSubjects(false);
    } catch (e: any) {
      Alert.alert('과목 추가', e?.message || '과목을 추가하지 못했습니다.');
    }
  };

  // 길게 눌러 과목 삭제 (저장된 강의 기록은 지워지지 않음)
  const confirmRemoveSubject = (subject: string) => {
    Alert.alert('과목 삭제', `'${subject}' 과목을 목록에서 삭제할까요?\n이미 저장된 강의 기록은 그대로 남습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            const list = await removeSubject(subject);
            setSubjects(list);
            if (selectedSubject === subject) setSelectedSubject(list[0]);
          } catch (e: any) {
            Alert.alert('과목 삭제', e?.message || '과목을 삭제하지 못했습니다.');
          }
        },
      },
    ]);
  };

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
          {subjects.map((subject) => (
            <Pressable
              key={subject}
              style={styles.subjectItem}
              onPress={() => selectSubject(subject)}
              onLongPress={() => confirmRemoveSubject(subject)}
            >
              <Text style={[styles.subjectItemText, subject === selectedSubject && styles.subjectItemSelected]}>
                {subject}
              </Text>
            </Pressable>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newSubject}
              onChangeText={setNewSubject}
              placeholder="새 과목 이름"
              placeholderTextColor="#999"
              returnKeyType="done"
              onSubmitEditing={createSubject}
              maxLength={30}
            />
            <Pressable style={styles.addButton} onPress={createSubject}>
              <Text style={styles.addButtonText}>추가</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>과목을 길게 누르면 삭제할 수 있습니다.</Text>
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

      <Pressable
        style={styles.historyButton}
        onPress={() => router.push('/vocab')}
      >
        <Text style={styles.historyButtonText}>
          📘 전공 단어장
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

  subjectItemSelected: {
    fontWeight: '700',
  },

  addRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },

  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111111',
  },

  addButton: {
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#222222',
    justifyContent: 'center',
  },

  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  hint: {
    fontSize: 12,
    color: '#888888',
    paddingHorizontal: 12,
    paddingBottom: 10,
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
