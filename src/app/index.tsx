
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

import { C, R, SERIF } from '@/constants/theme';
import { checkServer, SERVER_HELP, serverHost, type ServerStatus } from '@/lib/server';
import { addSubject, DEFAULT_SUBJECTS, loadSubjects, removeSubject } from '@/lib/subjects';

export default function HomeScreen() {
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedSubject, setSelectedSubject] =
    useState('임베디드시스템및실습');

  const [showSubjects, setShowSubjects] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const refreshServer = useCallback(async () => {
    setChecking(true);
    setServer(await checkServer());
    setChecking(false);
  }, []);

  // 홈 화면에 올 때마다 서버 연결 확인
  useFocusEffect(useCallback(() => { void refreshServer(); }, [refreshServer]));

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
      <Text style={styles.kicker}>LIVE LECTURE TRANSLATOR</Text>
      <Text style={styles.title}>LinLecture</Text>
      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>실시간 강의 번역 및 복습</Text>
        <Text style={styles.seal}>KO→VI</Text>
      </View>

      <View style={styles.rule} />

      <Pressable
        style={styles.serverRow}
        onPress={() => server && !server.ok ? Alert.alert('서버 연결 확인 방법', SERVER_HELP) : void refreshServer()}
      >
        <View style={[styles.dot, server?.ok ? styles.dotOk : server ? styles.dotBad : null]} />
        <Text style={[styles.serverText, server && !server.ok && styles.serverBad]} numberOfLines={1}>
          {checking || !server ? '서버 확인 중…'
            : server.ok ? `서버 연결됨 · ${serverHost()}`
            : `${server.message} · 눌러서 해결 방법 보기`}
        </Text>
        {server && !server.ok && (
          <Pressable onPress={() => void refreshServer()} hitSlop={8}>
            <Text style={styles.retryText}>다시 확인</Text>
          </Pressable>
        )}
      </Pressable>

      <Text style={styles.label}>과목 선택</Text>
      <Pressable style={styles.subjectBox} onPress={() => setShowSubjects(!showSubjects)}>
        <Text style={styles.subjectText}>{selectedSubject}</Text>
        <Text style={styles.arrow}>{showSubjects ? '▴' : '▾'}</Text>
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
              placeholderTextColor={C.mute}
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

      <Pressable style={styles.startButton} onPress={openLecture}>
        <View>
          <Text style={styles.startText}>강의 시작</Text>
          <Text style={styles.startSub}>START LECTURE</Text>
        </View>
        <Text style={styles.startArrow}>→</Text>
      </Pressable>

      <View style={styles.grid}>
        <Tile title="이전 강의 기록" sub="HISTORY" onPress={openHistory} />
        <Tile title="전공 단어장" sub="VOCABULARY" onPress={() => router.push('/vocab')} />
        <Tile title="북마크" sub="BOOKMARKS" onPress={() => router.push('/bookmarks')} />
        <Tile title="용어 퀴즈" sub="QUIZ" onPress={() => router.push('/quiz')} />
      </View>
    </ScrollView>
  );
}

function Tile({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }: { pressed: boolean }) => [styles.tile, pressed && styles.tilePressed]} onPress={onPress}>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 84, paddingBottom: 40 },
  kicker: { fontSize: 11, letterSpacing: 3, color: C.mute },
  title: { fontFamily: SERIF, fontSize: 40, color: C.ink, marginTop: 6 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  subtitle: { fontSize: 14, color: C.ink2 },
  seal: { fontSize: 11, fontWeight: '700', color: C.seal, borderWidth: 1.5, borderColor: C.seal, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  rule: { height: 1, backgroundColor: C.line, marginVertical: 20 },
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.mute },
  dotOk: { backgroundColor: C.ok },
  dotBad: { backgroundColor: C.seal },
  serverText: { flex: 1, fontSize: 13, color: C.ink2 },
  serverBad: { color: C.seal, fontWeight: '600' },
  retryText: { fontSize: 13, fontWeight: '700', color: C.ink, textDecorationLine: 'underline' },
  label: { fontSize: 11, letterSpacing: 2, color: C.mute, marginTop: 24, marginBottom: 8 },
  subjectBox: { padding: 15, borderWidth: 1, borderColor: C.line, borderRadius: R.button, backgroundColor: C.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectText: { fontSize: 15, color: C.ink, flexShrink: 1 },
  arrow: { fontSize: 14, color: C.ink2 },
  subjectList: { marginTop: 6, borderWidth: 1, borderColor: C.line, borderRadius: R.button, overflow: 'hidden', backgroundColor: C.card },
  subjectItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.khakiSoft },
  subjectItemText: { fontSize: 15, color: C.ink2 },
  subjectItemSelected: { fontWeight: '700', color: C.ink },
  addRow: { flexDirection: 'row', gap: 8, padding: 10 },
  addInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, backgroundColor: C.paper },
  addButton: { paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.ink, justifyContent: 'center' },
  addButtonText: { color: C.onInk, fontWeight: '700' },
  hint: { fontSize: 12, color: C.mute, paddingHorizontal: 12, paddingBottom: 10 },
  startButton: { marginTop: 18, paddingVertical: 20, paddingHorizontal: 20, borderRadius: R.card, backgroundColor: C.ink, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  startText: { fontSize: 19, fontWeight: '700', color: C.onInk },
  startSub: { fontSize: 10, letterSpacing: 2, color: C.onInk, opacity: 0.7, marginTop: 4 },
  startArrow: { fontSize: 24, color: C.onInk },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  tile: { width: '48.5%', height: 92, borderRadius: R.card, backgroundColor: C.khaki, padding: 14, justifyContent: 'space-between' },
  tilePressed: { opacity: 0.75 },
  tileTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  tileSub: { fontSize: 9, letterSpacing: 2, color: C.ink2 },
});
