import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { TermList } from '@/components/term-list';
import { loadLectures, summarize, type LectureRecord } from '@/lib/lectures';

export default function HistoryScreen() {
  const [items, setItems] = useState<LectureRecord[]>([]);
  const [selected, setSelected] = useState<LectureRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await loadLectures();
        if (active) { setItems(data); setError(''); }
      } catch (e: any) {
        if (active) setError(e?.message || '기록을 불러오지 못했습니다.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

  const summary = useMemo(() => summarize(items), [items]);

  const dateText = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '날짜 정보 없음' : d.toLocaleString('ko-KR');
  };

  // 실사용 기록 내보내기: 전체 기록을 JSON 으로 공유(파일 앱 저장, AirDrop, 메일 등)
  const exportRecords = async () => {
    try {
      const payload = {
        app: 'LinLecture',
        exportedAt: new Date().toISOString(),
        summary,
        lectures: items,
      };
      await Share.share({
        title: 'LinLecture 실사용 기록',
        message: JSON.stringify(payload, null, 2),
      });
    } catch (e: any) {
      Alert.alert('내보내기 실패', e?.message || '기록을 내보내지 못했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => selected ? setSelected(null) : router.back()}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.title}>{selected ? '강의 상세 내용' : '이전 강의 기록'}</Text>
      </View>
      {loading ? <ActivityIndicator size="large" /> : error ? <Text style={styles.error}>{error}</Text> : selected ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subject}>{selected.subject || '과목 미지정'}</Text>
          <Text style={styles.date}>{dateText(selected.startedAt)}</Text>
          {selected.stats && (
            <Text style={styles.statsLine}>
              {Math.round(selected.stats.durationSec / 60)}분 · 구간 {selected.stats.chunksSent}개
              (인식 {selected.stats.chunksRecognized}, 실패 {selected.stats.chunkErrors}) ·
              평균 응답 {selected.stats.avgLatencySec}초
            </Text>
          )}
          {!!selected.bookmarks?.length && (
            <>
              <Text style={styles.section}>♥ 북마크 {selected.bookmarks.length}개</Text>
              {selected.bookmarks.map(mark => (
                <View key={mark.id} style={[styles.panel, styles.bookmarkPanel]}>
                  <Text style={styles.date}>{String(Math.floor(mark.seconds / 60)).padStart(2, '0')}:{String(mark.seconds % 60).padStart(2, '0')}</Text>
                  <Text style={styles.body}>{mark.korean}</Text>
                  <Text style={[styles.body, styles.bookmarkVi]}>{mark.vietnamese}</Text>
                  <TermList terms={mark.terms} />
                </View>
              ))}
            </>
          )}
          <Text style={styles.section}>한국어 원문</Text>
          <View style={styles.panel}><Text style={styles.body}>{selected.korean || '내용 없음'}</Text></View>
          <Text style={styles.section}>베트남어 번역</Text>
          <View style={styles.panel}><Text style={styles.body}>{selected.vietnamese || '내용 없음'}</Text></View>
        </ScrollView>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>저장된 강의가 없습니다.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>사용 통계</Text>
            <View style={styles.tiles}>
              <Tile label="강의" value={`${summary.lectures}회`} />
              <Tile label="총 시간" value={`${Math.round(summary.totalMinutes)}분`} />
              <Tile label="사용한 날" value={`${summary.days}일`} />
            </View>
            {summary.bySubject.map(s => (
              <Text key={s.subject} style={styles.subjectRow}>
                {s.subject} · {s.count}회 · {Math.round(s.minutes)}분
              </Text>
            ))}
            <Pressable style={styles.exportButton} onPress={exportRecords}>
              <Text style={styles.exportText}>📤 기록 내보내기 (JSON)</Text>
            </Pressable>
          </View>
          <Text style={styles.count}>저장된 강의 {items.length}개</Text>
          {items.map(item => (
            <Pressable key={item.id} style={styles.card} onPress={() => setSelected(item)}>
              <Text style={styles.subject}>{item.subject || '과목 미지정'}</Text>
              <Text style={styles.date}>{dateText(item.startedAt)}</Text>
              <Text numberOfLines={2} style={styles.preview}>{item.korean || '한국어 원문 없음'}</Text>
              <Text style={styles.more}>자세히 보기 ›</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 18 },
  back: { fontSize: 17, color: '#333' },
  title: { fontSize: 22, fontWeight: '700' },
  content: { paddingBottom: 48 },
  summary: { borderWidth: 1, borderColor: '#e2e2e2', borderRadius: 14, padding: 16, marginBottom: 20 },
  summaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: '#f4f4f4', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  tileValue: { fontSize: 20, fontWeight: '700', color: '#111' },
  tileLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  subjectRow: { fontSize: 14, color: '#444', marginBottom: 4 },
  exportButton: { marginTop: 12, backgroundColor: '#222', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  exportText: { color: '#fff', fontWeight: '700' },
  count: { color: '#777', marginBottom: 14 },
  card: { padding: 18, borderRadius: 14, backgroundColor: '#f4f4f4', marginBottom: 14 },
  subject: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  date: { color: '#777', fontSize: 13, marginBottom: 10 },
  statsLine: { color: '#555', fontSize: 13, lineHeight: 19 },
  preview: { fontSize: 15, lineHeight: 23 },
  more: { marginTop: 12, textAlign: 'right', color: '#555', fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  panel: { backgroundColor: '#f4f4f4', borderRadius: 14, padding: 16 },
  body: { fontSize: 16, lineHeight: 26 },
  bookmarkPanel: { marginBottom: 10 },
  bookmarkVi: { fontWeight: '700', marginTop: 6 },
  empty: { textAlign: 'center', marginTop: 80, color: '#888', fontSize: 16 },
  error: { color: '#d32f2f', marginTop: 24 },
});
