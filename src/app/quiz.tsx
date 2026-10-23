import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { buildVocab, loadLectures, makeQuiz, type QuizQuestion } from '@/lib/lectures';

// 전공 용어 퀴즈: 강의에서 모은 용어로 4지선다 10문제
export default function QuizScreen() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [vocabCount, setVocabCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<QuizQuestion[]>([]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const vocab = buildVocab(await loadLectures());
      setVocabCount(vocab.length);
      setQuestions(makeQuiz(vocab));
    } catch {
      setQuestions([]);
    }
    setIndex(0); setPicked(null); setScore(0); setWrong([]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void start(); }, [start]));

  const q = questions[index];
  const done = questions.length > 0 && index >= questions.length;

  const choose = (choice: string) => {
    if (picked || !q) return;
    setPicked(choice);
    if (choice === q.answer) setScore(s => s + 1);
    else setWrong(w => [...w, q]);
  };

  const next = () => { setPicked(null); setIndex(i => i + 1); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 뒤로</Text></Pressable>
        <Text style={styles.title}>전공 용어 퀴즈</Text>
      </View>

      {loading ? <ActivityIndicator size="large" /> : questions.length === 0 ? (
        <Text style={styles.empty}>
          퀴즈를 만들려면 뜻이 다른 전공 용어가 4개 이상 필요합니다.{'\n'}(지금 {vocabCount}개)
          {'\n\n'}전공 용어가 나오는 강의를 더 녹음해 주세요.
        </Text>
      ) : done ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <Text style={styles.result}>{score} / {questions.length}</Text>
          <Text style={styles.resultSub}>{score === questions.length ? '모두 맞았습니다! 🎉' : '틀린 용어를 다시 확인해 보세요.'}</Text>
          {wrong.map(w => (
            <View key={w.ko} style={styles.wrongCard}>
              <Text style={styles.wrongKo}>{w.ko}</Text>
              <Text style={styles.wrongVi}>{w.answer}{w.en && w.en !== w.answer ? ` · ${w.en}` : ''}</Text>
            </View>
          ))}
          <Pressable style={styles.primary} onPress={() => void start()}>
            <Text style={styles.primaryText}>다시 풀기</Text>
          </Pressable>
        </ScrollView>
      ) : q ? (
        <View>
          <Text style={styles.progress}>{index + 1} / {questions.length} · 점수 {score}</Text>
          <View style={styles.questionCard}>
            <Text style={styles.questionLabel}>이 용어의 베트남어 뜻은?</Text>
            <Text style={styles.questionKo}>{q.ko}</Text>
          </View>
          {q.choices.map(choice => {
            const isAnswer = choice === q.answer;
            const style = picked
              ? isAnswer ? styles.choiceRight : choice === picked ? styles.choiceWrong : styles.choice
              : styles.choice;
            return (
              <Pressable key={choice} style={style} onPress={() => choose(choice)}>
                <Text style={styles.choiceText}>{choice}</Text>
              </Pressable>
            );
          })}
          {picked && (
            <>
              <Text style={styles.feedback}>
                {picked === q.answer ? '정답입니다!' : `오답 · 정답: ${q.answer}`}{q.en && q.en !== q.answer ? `  (${q.en})` : ''}
              </Text>
              <Pressable style={styles.primary} onPress={next}>
                <Text style={styles.primaryText}>{index + 1 < questions.length ? '다음 문제' : '결과 보기'}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const choiceBase = { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 } as const;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 18 },
  back: { fontSize: 17, color: '#333' },
  title: { fontSize: 22, fontWeight: '700' },
  progress: { color: '#777', marginBottom: 12 },
  questionCard: { backgroundColor: '#f4f4f4', borderRadius: 16, padding: 22, marginBottom: 18, alignItems: 'center' },
  questionLabel: { color: '#777', fontSize: 14, marginBottom: 10 },
  questionKo: { fontSize: 28, fontWeight: '800', color: '#111', textAlign: 'center' },
  choice: { ...choiceBase, borderColor: '#ddd', backgroundColor: '#fff' },
  choiceRight: { ...choiceBase, borderColor: '#2E7D4F', backgroundColor: '#E8F5EC' },
  choiceWrong: { ...choiceBase, borderColor: '#C62828', backgroundColor: '#FDECEA' },
  choiceText: { fontSize: 16, color: '#111' },
  feedback: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 6, marginBottom: 12 },
  primary: { backgroundColor: '#222', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  result: { fontSize: 44, fontWeight: '800', textAlign: 'center', marginTop: 20 },
  resultSub: { fontSize: 16, color: '#555', textAlign: 'center', marginTop: 8, marginBottom: 20 },
  wrongCard: { backgroundColor: '#FDECEA', borderRadius: 12, padding: 14, marginBottom: 8 },
  wrongKo: { fontSize: 16, fontWeight: '700' },
  wrongVi: { fontSize: 15, color: '#183B73', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 60, color: '#888', fontSize: 15, lineHeight: 23 },
});
