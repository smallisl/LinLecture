
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="lecture" />
      <Stack.Screen name="history" />
      <Stack.Screen name="vocab" />
    </Stack>
  );
}
