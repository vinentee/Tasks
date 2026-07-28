import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { RootApp } from './src/RootApp';

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <>
      <RootApp />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}
