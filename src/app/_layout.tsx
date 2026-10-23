
import { Stack } from 'expo-router';

import { C } from '@/constants/theme';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="lecture" />
      <Stack.Screen name="history" />
      <Stack.Screen name="vocab" />
      <Stack.Screen name="bookmarks" />
      <Stack.Screen name="quiz" />
    </Stack>
  );
}
