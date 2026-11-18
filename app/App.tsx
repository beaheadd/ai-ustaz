/**
 * AI Ustaz — корень приложения (Expo, React Native + web).
 *
 * Порядок: шрифт Amiri Quran → прогресс (локально) → язык → навигация → верхний экран стека.
 * Пока шрифт и прогресс грузятся — спокойный экран загрузки (без логотипов и анимаций).
 * Решения владельца: 18.11.2026 — первая версия (честный прототип v0) на batr.kz/aiustaz,
 * без проверки голоса ИИ, без голоса кари, без сервера и аналитики.
 */
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran/400Regular';
import { useFonts } from 'expo-font';
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ПоставщикНавигации, useНавигация } from './src/engine/navigation';
import { ПоставщикПрогресса, useПрогресс } from './src/engine/progress';
import type { ПропсыЭкрана } from './src/engine/routes';
import { ПоставщикЯзыка } from './src/i18n';
import { ЭКРАНЫ } from './src/screens';
import { ШРИФТ_АРАБСКИЙ, useТема } from './src/theme';

/** Не ждать шрифт дольше этого: экран откроется с системным шрифтом, Amiri подтянется сам. */
const ТЕРПЕНИЕ_ШРИФТА_МС = 4000;

function ТекущийЭкран() {
  const { текущий } = useНавигация();
  const Компонент = ЭКРАНЫ[текущий.экран] as ComponentType<ПропсыЭкрана<typeof текущий.экран>>;
  return <Компонент key={текущий.ключ} параметры={текущий.параметры} />;
}

function Загрузка() {
  const { цвет } = useТема();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: цвет.фон }}>
      <ActivityIndicator color={цвет.акцент} />
    </View>
  );
}

function Содержимое({ шрифтГотов }: { шрифтГотов: boolean }) {
  const { загружен } = useПрогресс();
  if (!загружен || !шрифтГотов) return <Загрузка />;
  return (
    <ПоставщикЯзыка>
      <ПоставщикНавигации>
        <ТекущийЭкран />
      </ПоставщикНавигации>
    </ПоставщикЯзыка>
  );
}

export default function App() {
  const [шрифтЗагружен, ошибкаШрифта] = useFonts({ [ШРИФТ_АРАБСКИЙ]: AmiriQuran_400Regular });
  const [терпениеКончилось, установитьТерпение] = useState(false);
  useEffect(() => {
    const таймер = setTimeout(() => установитьТерпение(true), ТЕРПЕНИЕ_ШРИФТА_МС);
    return () => clearTimeout(таймер);
  }, []);

  return (
    <ПоставщикПрогресса>
      <Содержимое шрифтГотов={шрифтЗагружен || ошибкаШрифта != null || терпениеКончилось} />
    </ПоставщикПрогресса>
  );
}
