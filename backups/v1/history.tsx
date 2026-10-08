import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const STORAGE_KEY = '@LinLecture:lectures';
type Lecture = { id: string; subject: string; startedAt: string; endedAt: string; korean: string; vietnamese: string };

export default function HistoryScreen() {
  const [items, setItems] = useState<Lecture[]>([]);
  const [selected, setSelected] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        console.log('📚 STORAGE RAW:', raw);
        const data: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(data)) throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
        if (active) { setItems(data as Lecture[]); setError(''); }
      } catch (e: any) {
        if (active) setError(e?.message || '기록을 불러오지 못했습니다.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

  const dateText = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '날짜 정보 없음' : d.toLocaleString('ko-KR');
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
          <Text style={styles.section}>한국어 원문</Text>
          <View style={styles.panel}><Text style={styles.body}>{selected.korean || '내용 없음'}</Text></View>
          <Text style={styles.section}>베트남어 번역</Text>
          <View style={styles.panel}><Text style={styles.body}>{selected.vietnamese || '내용 없음'}</Text></View>
        </ScrollView>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>저장된 강의가 없습니다.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 18 },
  back: { fontSize: 17, color: '#333' },
  title: { fontSize: 22, fontWeight: '700' },
  content: { paddingBottom: 48 },
  count: { color: '#777', marginBottom: 14 },
  card: { padding: 18, borderRadius: 14, backgroundColor: '#f4f4f4', marginBottom: 14 },
  subject: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  date: { color: '#777', fontSize: 13, marginBottom: 10 },
  preview: { fontSize: 15, lineHeight: 23 },
  more: { marginTop: 12, textAlign: 'right', color: '#555', fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  panel: { backgroundColor: '#f4f4f4', borderRadius: 14, padding: 16 },
  body: { fontSize: 16, lineHeight: 26 },
  empty: { textAlign: 'center', marginTop: 80, color: '#888', fontSize: 16 },
  error: { color: '#d32f2f', marginTop: 24 },
});
