import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { buildVocab, loadLectures, type LectureRecord } from '@/lib/lectures';
import { C } from '@/constants/theme';

const ALL = '전체';

// 전공 단어장: 강의 중 나온 전공 용어를 모아서 복습한다.
export default function VocabScreen() {
  const [items, setItems] = useState<LectureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState(ALL);
  const [query, setQuery] = useState('');
  const [hideMeaning, setHideMeaning] = useState(false); // 뜻 가리기 (스스로 외워 보기)
  const [revealed, setRevealed] = useState<string[]>([]);

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

  const subjects = useMemo(
    () => [ALL, ...new Set(items.filter(i => i.terms?.length).map(i => i.subject || '과목 미지정'))],
    [items],
  );

  const vocab = useMemo(() => {
    const scoped = subject === ALL ? items : items.filter(i => (i.subject || '과목 미지정') === subject);
    const q = query.trim().toLowerCase();
    return buildVocab(scoped).filter(v =>
      !q || v.ko.toLowerCase().includes(q) || v.vi.toLowerCase().includes(q) || v.en.toLowerCase().includes(q));
  }, [items, subject, query]);

  const toggleReveal = (ko: string) =>
    setRevealed(prev => prev.includes(ko) ? prev.filter(k => k !== ko) : [...prev, ko]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 뒤로</Text></Pressable>
        <Text style={styles.title}>전공 단어장</Text>
      </View>

      {loading ? <ActivityIndicator size="large" /> : error ? <Text style={styles.error}>{error}</Text> : (
        <>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="용어 검색 (한국어 · 베트남어 · 영어)"
            placeholderTextColor={C.mute}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
            {subjects.map(s => (
              <Pressable key={s} onPress={() => setSubject(s)} style={[styles.chip, subject === s && styles.chipOn]}>
                <Text style={[styles.chipText, subject === s && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.toolbar}>
            <Text style={styles.count}>용어 {vocab.length}개</Text>
            <View style={styles.tools}>
              <Pressable onPress={() => { setHideMeaning(v => !v); setRevealed([]); }} style={styles.toggle}>
                <Text style={styles.toggleText}>{hideMeaning ? '뜻 보기' : '뜻 가리기'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/quiz')} style={[styles.toggle, styles.quiz]}>
                <Text style={[styles.toggleText, styles.quizText]}>퀴즈</Text>
              </Pressable>
            </View>
          </View>

          {vocab.length === 0 ? (
            <Text style={styles.empty}>
              {items.some(i => i.terms?.length)
                ? '검색 결과가 없습니다.'
                : '아직 모은 전공 용어가 없습니다.\n강의를 녹음하면 카드에 나온 전공 용어가 여기에 모입니다.'}
            </Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {vocab.map(v => {
                const show = !hideMeaning || revealed.includes(v.ko);
                return (
                  <Pressable key={v.ko} style={styles.card} onPress={() => hideMeaning && toggleReveal(v.ko)}>
                    <View style={styles.cardTop}>
                      <Text style={styles.ko}>{v.ko}</Text>
                      <Text style={styles.badge}>{v.count}회</Text>
                    </View>
                    {show ? (
                      <>
                        <Text style={styles.vi}>{v.vi}</Text>
                        {v.en && v.en !== v.vi ? <Text style={styles.en}>{v.en}</Text> : null}
                      </>
                    ) : (
                      <Text style={styles.hidden}>눌러서 뜻 보기</Text>
                    )}
                    <Text style={styles.meta}>{v.subjects.join(' · ')} · 강의 {v.lectures}개</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
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
  search: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  chips: { flexGrow: 0, marginTop: 12 },
  chipsContent: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: C.khakiSoft },
  chipOn: { backgroundColor: C.ink },
  chipText: { fontSize: 14, color: C.ink2 },
  chipTextOn: { color: C.paper, fontWeight: '700' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 },
  count: { color: C.mute },
  toggle: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  toggleText: { fontSize: 13, fontWeight: '600', color: C.ink2 },
  tools: { flexDirection: 'row', gap: 8 },
  quiz: { backgroundColor: C.ink, borderColor: C.ink },
  quizText: { color: C.paper },
  list: { paddingBottom: 48, gap: 12 },
  card: { padding: 16, borderRadius: 14, backgroundColor: C.card },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ko: { fontSize: 19, fontWeight: '700', color: C.ink, flexShrink: 1 },
  badge: { fontSize: 12, color: C.ink2, backgroundColor: C.khakiSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  vi: { fontSize: 17, fontWeight: '600', color: C.ink },
  en: { fontSize: 14, color: C.ink2, marginTop: 2 },
  hidden: { fontSize: 15, color: C.mute, fontStyle: 'italic' },
  meta: { fontSize: 12, color: C.mute, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 60, color: C.mute, fontSize: 15, lineHeight: 23 },
  error: { color: C.seal, marginTop: 24 },
});
