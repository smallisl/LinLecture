import { StyleSheet, Text, View } from 'react-native';

import type { Term } from '@/lib/lectures';

// 카드 아래에 보여 주는 전공 용어 (서버 glossary.js 에서 찾은 것)
export function TermList({ terms, fontSize = 14 }: { terms?: Term[]; fontSize?: number }) {
  if (!terms?.length) return null;
  return (
    <View style={styles.box}>
      {terms.map(term => (
        <Text key={term.ko} style={[styles.row, { fontSize, lineHeight: fontSize * 1.45 }]}>
          <Text style={styles.ko}>{term.ko}</Text>
          {'  →  '}
          <Text style={styles.vi}>{term.vi}</Text>
          {term.en && term.en !== term.vi ? <Text style={styles.en}>{`  ·  ${term.en}`}</Text> : null}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E3E8F2', gap: 4 },
  row: { color: '#526987' },
  ko: { color: '#657895' },
  vi: { color: '#183B73', fontWeight: '700' },
  en: { color: '#8A99B0' },
});
