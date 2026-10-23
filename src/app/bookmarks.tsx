import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TermList } from '@/components/term-list';
import { allBookmarks, formatClock, loadLectures, type LectureRecord } from '@/lib/lectures';
import { C } from '@/constants/theme';

const ALL = '전체';

// 북마크 모아보기: 모든 강의에서 ♥ 표시한 부분만 모아 시험 전에 빠르게 복습
export default function BookmarksScreen() {
  const [items, setItems] = useState<LectureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState(ALL);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const data = await loadLectures();
        if (active) { setItems(data); setError(''); }
      } catch (e: any) {
        if (active) setError(e?.message || '기록을 불러오지 못했습니다.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []));

  const groups = useMemo(() => allBookmarks(items), [items]);
  const subjects = useMemo(() => [ALL, ...new Set(groups.map(g => g.item.subject || '과목 미지정'))], [groups]);
  const shown = subject === ALL ? groups : groups.filter(g => (g.item.subject || '과목 미지정') === subject);
  const total = shown.reduce((n, g) => n + g.marks.length, 0);

  const dateText = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 뒤로</Text></Pressable>
        <Text style={styles.title}>북마크 모아보기</Text>
      </View>
      {loading ? <ActivityIndicator size="large" /> : error ? <Text style={styles.error}>{error}</Text> : groups.length === 0 ? (
        <Text style={styles.empty}>아직 북마크가 없습니다.{'\n'}강의 중 카드의 ♡를 누르면 여기에 모입니다.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
            {subjects.map(s => (
              <Pressable key={s} onPress={() => setSubject(s)} style={[styles.chip, subject === s && styles.chipOn]}>
                <Text style={[styles.chipText, subject === s && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.count}>북마크 {total}개 · 강의 {shown.length}개</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {shown.map(({ item, marks }) => (
              <View key={item.id} style={styles.group}>
                <Text style={styles.groupTitle}>{item.title || item.subject || '과목 미지정'}</Text>
                <Text style={styles.groupSub}>{item.title ? `${item.subject} · ` : ''}{dateText(item.startedAt)}</Text>
                {marks.map(mark => (
                  <View key={mark.id} style={styles.card}>
                    <Text style={styles.time}>♥ {formatClock(mark.seconds)}</Text>
                    <Text style={styles.ko}>{mark.korean}</Text>
                    <Text style={styles.vi}>{mark.vietnamese}</Text>
                    <TermList terms={mark.terms} fontSize={13} />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper, paddingTop: 60, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 18 },
  back: { fontSize: 17, color: C.ink2 },
  title: { fontSize: 22, fontWeight: '700' },
  chips: { flexGrow: 0 },
  chipsContent: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: C.khakiSoft },
  chipOn: { backgroundColor: C.ink },
  chipText: { fontSize: 14, color: C.ink2 },
  chipTextOn: { color: C.paper, fontWeight: '700' },
  count: { color: C.mute, marginTop: 14, marginBottom: 8 },
  list: { paddingBottom: 48 },
  group: { marginBottom: 22 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  groupSub: { fontSize: 13, color: C.mute, marginTop: 2, marginBottom: 10 },
  card: { padding: 14, borderRadius: 14, backgroundColor: C.card, marginBottom: 10 },
  time: { fontSize: 12, color: C.seal, marginBottom: 6, fontWeight: '700' },
  ko: { fontSize: 15, lineHeight: 23, color: C.ink2 },
  vi: { fontSize: 16, lineHeight: 24, color: C.ink, fontWeight: '700', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 60, color: C.mute, fontSize: 15, lineHeight: 23 },
  error: { color: C.seal, marginTop: 24 },
});
