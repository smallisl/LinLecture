import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { TermList } from '@/components/term-list';
import { formatClock, lectureNotesText, type LectureRecord } from '@/lib/lectures';
import { loadViewMode, nextViewMode, saveViewMode, VIEW_NAME, type ViewMode } from '@/lib/view-mode';
import { C } from '@/constants/theme';

type Props = {
  item: LectureRecord;
  onSave: (patch: { title?: string; memo?: string }) => void;
  onDelete: () => void;
};

// 이전 강의 상세 화면: 제목·메모 편집, 노트 내보내기, 북마크·용어, 카드 다시 보기
export function LectureDetail({ item, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(item.title ?? '');
  const [memo, setMemo] = useState(item.memo ?? '');
  const [mode, setMode] = useState<ViewMode>('both');

  useEffect(() => { void loadViewMode().then(setMode); }, []);
  useEffect(() => { setTitle(item.title ?? ''); setMemo(item.memo ?? ''); }, [item.id]);

  const changeMode = () => {
    const next = nextViewMode(mode);
    setMode(next);
    void saveViewMode(next);
  };

  // 입력이 멈추면 0.6초 뒤 자동 저장, 화면을 나갈 때도 저장
  const latest = useRef({ title, memo, item, onSave });
  latest.current = { title, memo, item, onSave };
  const saveIfChanged = () => {
    const { title: t, memo: m, item: it, onSave: save } = latest.current;
    if (t.trim() !== (it.title ?? '') || m !== (it.memo ?? '')) save({ title: t.trim(), memo: m });
  };
  useEffect(() => {
    const timer = setTimeout(saveIfChanged, 600);
    return () => clearTimeout(timer);
  }, [title, memo]);
  useEffect(() => () => saveIfChanged(), []);

  const shareNotes = async () => {
    try {
      await Share.share({ title: item.title || item.subject, message: lectureNotesText({ ...item, title: title.trim(), memo }) });
    } catch (e: any) {
      Alert.alert('내보내기 실패', e?.message || '노트를 내보내지 못했습니다.');
    }
  };

  const date = new Date(item.startedAt);
  const dateText = Number.isNaN(date.getTime()) ? '날짜 정보 없음' : date.toLocaleString('ko-KR');
  const showKo = mode !== 'vi';
  const showVi = mode !== 'ko';

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        onBlur={saveIfChanged}
        placeholder="강의 제목 (예: 3주차 인터럽트)"
        placeholderTextColor={C.mute}
        maxLength={40}
        returnKeyType="done"
      />
      <Text style={styles.subject}>{item.subject || '과목 미지정'} · {dateText}</Text>
      {item.stats && (
        <Text style={styles.statsLine}>
          {Math.round(item.stats.durationSec / 60)}분 · 구간 {item.stats.chunksSent}개 (인식 {item.stats.chunksRecognized}, 실패 {item.stats.chunkErrors}) · 평균 응답 {item.stats.avgLatencySec}초
        </Text>
      )}

      <TextInput
        style={styles.memo}
        value={memo}
        onChangeText={setMemo}
        onBlur={saveIfChanged}
        placeholder="메모 (질문할 내용, 과제, 시험 범위 등)"
        placeholderTextColor={C.mute}
        multiline
        maxLength={1000}
      />

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={shareNotes}>
          <Text style={styles.actionText}>노트 내보내기</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={changeMode}>
          <Text style={styles.actionText}>보기: {VIEW_NAME[mode]}</Text>
        </Pressable>
      </View>

      {!!item.bookmarks?.length && (
        <>
          <Text style={styles.section}>♥ 북마크 {item.bookmarks.length}개</Text>
          {item.bookmarks.map(mark => (
            <View key={`b${mark.id}`} style={[styles.panel, styles.gap]}>
              <Text style={styles.time}>{formatClock(mark.seconds)}</Text>
              {showKo && <Text style={styles.ko}>{mark.korean}</Text>}
              {showVi && <Text style={styles.vi}>{mark.vietnamese}</Text>}
              <TermList terms={mark.terms} />
            </View>
          ))}
        </>
      )}

      {!!item.terms?.length && (
        <>
          <Text style={styles.section}>이 강의의 전공 용어 {item.terms.length}개</Text>
          <View style={styles.panel}><TermList terms={item.terms} /></View>
        </>
      )}

      <Text style={styles.section}>강의 내용</Text>
      {item.segments?.length ? (
        item.segments.map(seg => (
          <View key={`s${seg.id}`} style={[styles.panel, styles.gap]}>
            <Text style={styles.time}>{formatClock(seg.seconds)}{item.bookmarks?.some(b => b.id === seg.id) ? '  ♥' : ''}</Text>
            {showKo && <Text style={styles.ko}>{seg.korean || '—'}</Text>}
            {showVi && <Text style={styles.vi}>{seg.vietnamese || '—'}</Text>}
          </View>
        ))
      ) : (
        <>
          {showKo && <View style={[styles.panel, styles.gap]}><Text style={styles.body}>{item.korean || '한국어 원문 없음'}</Text></View>}
          {showVi && <View style={styles.panel}><Text style={[styles.body, styles.bold]}>{item.vietnamese || '베트남어 번역 없음'}</Text></View>}
        </>
      )}

      <Pressable style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteText}>이 강의 기록 삭제</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  titleInput: { fontSize: 20, fontWeight: '700', color: C.ink, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  subject: { color: C.ink2, fontSize: 14, marginTop: 10 },
  statsLine: { color: C.mute, fontSize: 13, lineHeight: 19, marginTop: 4 },
  memo: { marginTop: 14, minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, fontSize: 15, color: C.ink, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center' },
  actionText: { color: C.paper, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  panel: { backgroundColor: C.card, borderRadius: 14, padding: 14 },
  gap: { marginBottom: 10 },
  time: { color: C.mute, fontSize: 12, marginBottom: 6 },
  ko: { fontSize: 15, lineHeight: 23, color: C.ink2 },
  vi: { fontSize: 16, lineHeight: 24, color: C.ink, fontWeight: '700', marginTop: 4 },
  body: { fontSize: 16, lineHeight: 26 },
  bold: { fontWeight: '700' },
  deleteButton: { marginTop: 28, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.seal, alignItems: 'center' },
  deleteText: { color: C.seal, fontWeight: '700', fontSize: 15 },
});
