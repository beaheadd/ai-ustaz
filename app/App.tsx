import { Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran/400Regular';
import версия from '@content/version.json';
export default function App() {
  const [ok] = useFonts({ AmiriQuran_400Regular });
  return <View><Text>test {String(ok)} {версия.версия}</Text></View>;
}
