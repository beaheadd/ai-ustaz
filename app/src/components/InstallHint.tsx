/**
 * БаннерУстановки — баннер «Установить AI Ustaz» вверху главной, над временем намаза.
 *
 * Решение владельца 26.11.2026: «Кнопку установить прям наверху времени намаза поставь, чтобы все, которые заходят,
 * устанавливали. В Play Market пока нет — пусть отсюда устанавливают. Для айфона — „добавить на экран“, покажи как.
 * Для андроида — „установить“. Кнопка ×: нажал — уходит. Если установил — тоже уходит. Внутри („Ещё“ → „Установить
 * приложение“) пусть остаётся». (Раньше, 19.11.2026, была одна узкая строка внизу главной — её заменяет баннер.)
 *
 * Контракт: <БаннерУстановки /> сам решает, показываться ли (useБаннерУстановки, install/useInstall.ts): телефон, сайт
 * aiustaz.pro или batr.kz, приложение не установлено, баннер не закрыт «×» (ключ aiustaz:install-banner.v1 — только
 * отметка «закрыт», без личных данных). На компьютере, в установленном приложении и в тестах на 127.0.0.1 его нет.
 * Что внутри — по сценарию (install/platform.ts):
 *   кнопка (Android, Chrome готов) — «Установить» → системное окно; принято → баннер уходит (и appinstalled);
 *   android-меню — «⋮ → „Установить приложение“» и «Как установить» → #/install;
 *   ios-safari / ios-поделиться — три шага со значками: «Поделиться» → «На экран „Домой“» → «Добавить»;
 *   ios-только-safari, встроенный (Instagram, WhatsApp…) — одна фраза и «Как установить» → #/install;
 *   batr — «Ставьте с aiustaz.pro» — ссылка на экран установки своего сайта (там проверка голосом, QML).
 * Без анимации, счётчиков и «наград». kk — черновик для редактора-носителя.
 * testID: главная-установка, главная-установка-установить, главная-установка-шаги, главная-установка-открыть,
 *   главная-установка-скрыть, главная-установка-сценарий-<сценарий>.
 */
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useНавигация } from '../engine/navigation';
import { создатьСловарь, useСловарь } from '../i18n';
import { АДРЕС_УСТАНОВКИ } from '../install/platform';
import { useБаннерУстановки, useУстановка } from '../install/useInstall';
import { useТема } from '../theme';
import { Кнопка } from './Button';
import { Значок, type ИмяЗначка } from './Icon';
import { Текст } from './Text';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Установите AI Ustaz на телефон',
    текст: 'Бесплатно и без рекламы. Значок появится на экране телефона.',
    установить: 'Установить',
    какУстановить: 'Как установить',
    androidМеню: 'Нажмите ⋮ вверху справа → «Установить приложение».',
    iosШаг1: 'Нажмите «Поделиться» внизу экрана',
    iosШаг2: 'Выберите «На экран „Домой“»',
    iosШаг3: 'Нажмите «Добавить»',
    iosДругойШаг1: 'Нажмите «Поделиться» в меню браузера',
    толькоSafari: 'На iPhone добавить на экран можно из Safari: откройте aiustaz.pro в Safari.',
    встроенный: 'Откройте эту страницу в Chrome или Safari — отсюда приложение не ставится.',
    batr: 'Приложение ставится с сайта aiustaz.pro — там работает проверка чтения голосом.',
    открытьСайт: 'Открыть aiustaz.pro',
    скрыть: 'Закрыть предложение установить',
  },
  kk: {
    заголовок: 'AI Ustaz-ты телефонға орнатыңыз',
    текст: 'Тегін және жарнамасыз. Белгіше телефон экранында пайда болады.',
    установить: 'Орнату',
    какУстановить: 'Қалай орнатуға болады',
    androidМеню: 'Жоғарғы оң жақтағы ⋮ түймесін басыңыз → «Қолданбаны орнату».',
    iosШаг1: 'Экранның төменгі жағындағы «Бөлісу» түймесін басыңыз',
    iosШаг2: '«„Үй“ экранына» таңдаңыз',
    iosШаг3: '«Қосу» түймесін басыңыз',
    iosДругойШаг1: 'Браузер мәзіріндегі «Бөлісу» түймесін басыңыз',
    толькоSafari: 'iPhone-да экранға Safari арқылы қосуға болады: aiustaz.pro-ны Safari-де ашыңыз.',
    встроенный: 'Бұл бетті Chrome немесе Safari-де ашыңыз — мұнда қолданба орнатылмайды.',
    batr: 'Қолданба aiustaz.pro сайтынан орнатылады — онда оқуды дауыспен тексеру жұмыс істейді.',
    открытьСайт: 'aiustaz.pro ашу',
    скрыть: 'Орнату ұсынысын жабу',
  },
  uz: {
    заголовок: 'AI Ustazni telefonga oʻrnating',
    текст: 'Bepul va reklamasiz. Belgi telefon ekranida paydo boʻladi.',
    установить: 'Oʻrnatish',
    какУстановить: 'Qanday oʻrnatiladi',
    androidМеню: 'Yuqori oʻng burchakdagi ⋮ ni bosing → «Ilovani oʻrnatish».',
    iosШаг1: 'Ekran pastidagi «Ulashish» tugmasini bosing',
    iosШаг2: '«Bosh ekranga» ni tanlang',
    iosШаг3: '«Qoʻshish» ni bosing',
    iosДругойШаг1: 'Brauzer menyusidagi «Ulashish» ni bosing',
    толькоSafari: 'iPhoneʼda ekranga Safari orqali qoʻshiladi: aiustaz.pro ni Safariʼda oching.',
    встроенный: 'Bu sahifani Chrome yoki Safariʼda oching — bu yerdan ilova oʻrnatilmaydi.',
    batr: 'Ilova aiustaz.pro saytidan oʻrnatiladi — u yerda oʻqishni ovoz bilan tekshirish ishlaydi.',
    открытьСайт: 'aiustaz.pro ni ochish',
    скрыть: 'Oʻrnatish taklifini yopish',
  },
  en: {
    заголовок: 'Install AI Ustaz on your phone',
    текст: "Free and without ads. The icon will appear on your phone's screen.",
    установить: 'Install',
    какУстановить: 'How to install',
    androidМеню: 'Tap ⋮ at the top right → “Install app”.',
    iosШаг1: 'Tap “Share” at the bottom of the screen',
    iosШаг2: 'Choose “Add to Home Screen”',
    iosШаг3: 'Tap “Add”',
    iosДругойШаг1: 'Tap “Share” in the browser menu',
    толькоSafari: 'On iPhone, add it from Safari: open aiustaz.pro in Safari.',
    встроенный: 'Open this page in Chrome or Safari — the app cannot be installed from here.',
    batr: 'The app is installed from aiustaz.pro — voice checking works there.',
    открытьСайт: 'Open aiustaz.pro',
    скрыть: 'Close the install suggestion',
  },
}, 'components/InstallHint');

export function БаннерУстановки() {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const { перейти } = useНавигация();
  const { сценарий, предложить } = useУстановка();
  const { показать, скрыть } = useБаннерУстановки();
  const [ответ, установитьОтвет] = useState<'нет' | 'отклонено'>('нет');
  if (!показать) return null;

  const нажатьУстановить = () => {
    void предложить().then((р) => {
      if (р === 'принято') скрыть();
      else установитьОтвет('отклонено');
    });
  };
  const какУстановить = (
    <Кнопка вид="вторичная" надпись={т('какУстановить')} значок="вперёд" приНажатии={() => перейти('установка')} testID="главная-установка-открыть" />
  );
  const шаг = (номер: number, значок: ИмяЗначка, текст: string) => (
    <View key={номер} style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s }} testID={`главная-установка-шаг-${номер}`}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: цвет.акцентМягкий, alignItems: 'center', justifyContent: 'center' }}>
        <Текст вид="метка" цвет={цвет.акцент}>
          {String(номер)}
        </Текст>
      </View>
      <Значок имя={значок} размер={22} цвет={цвет.акцент} />
      <Текст вид="мелкий" стиль={{ flex: 1 }}>
        {текст}
      </Текст>
    </View>
  );

  let тело;
  switch (сценарий) {
    case 'кнопка':
      тело =
        ответ === 'отклонено' ? (
          <Текст вид="мелкий">{т('androidМеню')}</Текст>
        ) : (
          <Кнопка надпись={т('установить')} значок="установить" крупная приНажатии={нажатьУстановить} testID="главная-установка-установить" />
        );
      break;
    case 'android-меню':
      тело = (
        <>
          <Текст вид="мелкий">{т('androidМеню')}</Текст>
          {какУстановить}
        </>
      );
      break;
    case 'ios-safari':
    case 'ios-поделиться':
      тело = (
        <View style={{ gap: отступ.s }} testID="главная-установка-шаги">
          {шаг(1, 'поделиться', т(сценарий === 'ios-safari' ? 'iosШаг1' : 'iosДругойШаг1'))}
          {шаг(2, 'наЭкранДомой', т('iosШаг2'))}
          {шаг(3, 'галочка', т('iosШаг3'))}
        </View>
      );
      break;
    case 'ios-только-safari':
    case 'встроенный':
      тело = (
        <>
          <Текст вид="мелкий">{т(сценарий === 'встроенный' ? 'встроенный' : 'толькоSafari')}</Текст>
          {какУстановить}
        </>
      );
      break;
    case 'batr': {
      const ссылка = Platform.OS === 'web' ? ({ href: АДРЕС_УСТАНОВКИ } as object) : {};
      тело = (
        <>
          <Текст вид="мелкий">{т('batr')}</Текст>
          <Текст {...ссылка} accessibilityRole="link" вид="кнопка" цвет={цвет.акцент} стиль={{ textDecorationLine: 'underline', paddingVertical: отступ.xs }} testID="главная-установка-открыть-сайт">
            {т('открытьСайт')}
          </Текст>
        </>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <View
      testID="главная-установка"
      style={{ borderRadius: радиус.l, borderWidth: 1, borderColor: цвет.акцент, backgroundColor: цвет.поверхность, padding: отступ.m, gap: отступ.s }}
    >
      <View testID={`главная-установка-сценарий-${сценарий}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: отступ.s }}>
        <Значок имя="телефон" размер={24} цвет={цвет.акцент} />
        <View style={{ flex: 1, gap: 2 }}>
          <Текст вид="подзаголовок" accessibilityRole="header">
            {т('заголовок')}
          </Текст>
          <Текст вид="мелкий" цвет={цвет.текстВторой}>
            {т('текст')}
          </Текст>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={т('скрыть')}
          onPress={скрыть}
          testID="главная-установка-скрыть"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            marginTop: -8,
            marginEnd: -8,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? цвет.акцентМягкий : 'transparent',
          })}
        >
          <Значок имя="закрыть" размер={20} цвет={цвет.текстВторой} />
        </Pressable>
      </View>
      {тело}
    </View>
  );
}
