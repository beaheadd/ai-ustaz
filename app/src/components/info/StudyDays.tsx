/**
 * Приватная отметка «дни занятий» (программа курса §3.5): «N из последних 30» и ряд из 30 нукт-ромбов.
 * Без серий, которые «сгорают», без очков, рейтингов и сравнения с другими. Только это устройство.
 *
 * Контракт: <ДниЗанятий testID?="главная-дни-занятий" /> — читает прогресс сам (engine/progress.ts);
 *   с 19.11.2026 стоит на экране «Таджвид» (testID карта-дни-занятий).
 *   последниеДни(дней, момент?) → ['ГГГГ-ММ-ДД', …] по Алматы, от старых к сегодняшнему — чистая функция.
 * Вид (дизайн-система §2.3): дни занятий — ромбы-нукты цвета «акцент» (не звёзды); день без занятий — контур;
 * сегодня — подпись под последним ромбом.
 */
import { View } from 'react-native';
import { датаАлматы, днейЗанятийЗа, useПрогресс } from '../../engine/progress';
import { создатьСловарь, useПеревод, useСловарь } from '../../i18n';
import { useТема } from '../../theme';
import { Карточка } from '../Card';
import { Значок } from '../Icon';
import { Текст } from '../Text';
import { Нукта } from './Path';

const ДЕНЬ_МС = 24 * 60 * 60 * 1000;

export function последниеДни(дней = 30, момент: Date = new Date()): string[] {
  return Array.from({ length: дней }, (_, i) => датаАлматы(new Date(момент.getTime() - (дней - 1 - i) * ДЕНЬ_МС)));
}

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Ваши дни занятий',
    пусто: 'Отметка появится в день, когда вы завершите урок.',
    приватно: 'Видно только вам и хранится только на этом устройстве. Без серий и рейтингов.',
    полоска: 'Последние 30 дней, сегодня — справа',
    давно: '30 дней назад',
    сегодня: 'сегодня',
  },
  kk: {
    заголовок: 'Сабақ күндеріңіз',
    пусто: 'Белгі сабақты аяқтаған күні пайда болады.',
    приватно: 'Тек сізге көрінеді және тек осы құрылғыда сақталады. Сериясыз және рейтингсіз.',
    полоска: 'Соңғы 30 күн, бүгін — оң жақта',
    давно: '30 күн бұрын',
    сегодня: 'бүгін',
  },
  uz: {
    заголовок: 'Mashgʻulot kunlaringiz',
    пусто: 'Belgi darsni tugatgan kuningiz paydo boʻladi.',
    приватно: 'Faqat sizga koʻrinadi va faqat shu qurilmada saqlanadi. Seriyalar va reytinglarsiz.',
    полоска: 'Oxirgi 30 kun, bugun — oʻngda',
    давно: '30 kun oldin',
    сегодня: 'bugun',
  },
  en: {
    заголовок: 'Your study days',
    пусто: 'A mark will appear on the day you finish a lesson.',
    приватно: 'Visible only to you and stored only on this device. No streaks or rankings.',
    полоска: 'Last 30 days, today on the right',
    давно: '30 days ago',
    сегодня: 'today',
  },
}, 'components/info/StudyDays');

export function ДниЗанятий({ testID = 'главная-дни-занятий' }: { testID?: string }) {
  const { t } = useПеревод();
  const т = useСловарь(СЛОВАРЬ);
  const { прогресс } = useПрогресс();
  const { цвет, отступ } = useТема();
  const дней = днейЗанятийЗа(прогресс, 30);
  const отмечено = new Set(прогресс.дниЗанятий);
  const дни = последниеДни(30);
  return (
    <Карточка testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s }}>
        <Значок имя="календарь" размер={22} цвет={цвет.акцент} />
        <Текст вид="подзаголовок" стиль={{ flex: 1 }}>
          {т('заголовок')}
        </Текст>
      </View>
      <Текст>{дней > 0 ? t('главная.дниЗанятий', { дней }) : т('пусто')}</Текст>
      <View accessibilityLabel={т('полоска') + ': ' + t('главная.дниЗанятий', { дней })} style={{ gap: отступ.xs, paddingTop: отступ.xs }}>
        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }}>
          {дни.map((д, i) => (
            <View key={д} style={{ flex: 1, height: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Нукта размер={i === дни.length - 1 ? 8 : 6} контур={!отмечено.has(д)} цвет={отмечено.has(д) ? цвет.акцент : цвет.границаЭлемента} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} aria-hidden>
          <Текст вид="мелкий">{т('давно')}</Текст>
          <Текст вид="мелкий">{т('сегодня')}</Текст>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: отступ.s, alignItems: 'flex-start' }}>
        <Значок имя="замок" размер={16} цвет={цвет.текстВторой} стиль={{ marginTop: 1 }} />
        <Текст вид="мелкий" стиль={{ flex: 1 }}>
          {т('приватно')}
        </Текст>
      </View>
    </Карточка>
  );
}
