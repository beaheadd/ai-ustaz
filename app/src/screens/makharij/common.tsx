/**
 * Общее для экранов «Как произносить буквы» (#/makharij) и карточки буквы (#/makharij/letter?n=): строки, арабский
 * текст из данных, схема махраджа на светлой карточке, состояния загрузки.
 *
 * Решения владельца: 19.11.2026 — «добавить картинку произношения каждой буквы»; «рисуй как реальный рот человека»;
 * 26.11.2026 — «Почему их нету в нашем приложении? Не выкатывал?». Данные — src/makharij/data.ts.
 * Контракт:
 *   СЛОВАРЬ_МАХРАДЖЕЙ — общие строки (kk, uz, en — черновики для редактора-носителя);
 *   <АрабскийМахраджа текст размер? /> — арабский только из данных (буквы, названия, бейты), lang="ar", dir="rtl";
 *   <СхемаМахраджа файл подпись описаниеПодсветки? testID? /> — <img> со своего сервера (CSP img-src 'self') на своей
 *     светлой подложке #FBF7EE в обеих темах (docs/дизайн/06 §4.2); alt = подпись + «выделено: …» (§4.1); подпись видна;
 *   описаниеПодсветки(махрадж, язык, т) → «выделено: №N — что → куда»;
 *   <МахраджиНедоступны состояние /> — «Нет связи» + «Повторить» | «Файл не найден» | «не прошло сверку».
 * testID: махраджи-нет-связи, махраджи-повторить, махраджи-нет-файла, махраджи-нет-сверки.
 */
import { createElement } from 'react';
import { Platform, Text, View } from 'react-native';
import { Кнопка, Текст } from '../../components';
import { создатьСловарь, useСловарь, type Язык } from '../../i18n';
import { адресСхемы, текстМахраджа, type Махрадж } from '../../makharij/data';
import type { ПричинаОтказа } from '../../quran/data';
import { useТема } from '../../theme';

export const ВЕБ = Platform.OS === 'web';
/** Подложка схемы — та же, что в самом рисунке (makharij_common.ЦВЕТА_СХЕМ['карточка']), в обеих темах. */
const ФОН_СХЕМЫ = '#FBF7EE';
const РАМКА_СХЕМЫ = '#D9CFBC';
const ТЕКСТ_НА_СХЕМЕ = '#3E4A46';

export const СЛОВАРЬ_МАХРАДЖЕЙ = создатьСловарь({
  ru: {
    черновик: 'Черновик: описания и схемы проверяет устаз',
    поРусски: 'Описание пока на русском языке.',
    выделено: 'выделено: № {n} — {что}',
    выделеноКуда: 'выделено: № {n} — {что} → {куда}',
    нетСвязи: 'Нет связи — не загрузилось. Проверьте интернет и нажмите «Повторить».',
    повторить: 'Повторить',
    нетФайла: 'Файл не найден — возможно, вышла новая версия. Обновите страницу.',
    обновить: 'Обновить страницу',
    нетСверки: 'Файл махраджей не прошёл сверку — не показываем.',
  },
  kk: {
    черновик: 'Жоба: сипаттамалар мен сызбаларды ұстаз тексеріп жатыр',
    поРусски: 'Сипаттама әзірге орыс тілінде.',
    выделено: 'белгіленген: № {n} — {что}',
    выделеноКуда: 'белгіленген: № {n} — {что} → {куда}',
    нетСвязи: 'Байланыс жоқ — жүктелмеді. Интернетті тексеріп, «Қайталау» түймесін басыңыз.',
    повторить: 'Қайталау',
    нетФайла: 'Файл табылмады — жаңа нұсқа шыққан болуы мүмкін. Бетті жаңартыңыз.',
    обновить: 'Бетті жаңарту',
    нетСверки: 'Махраждар файлы салыстырудан өтпеді — көрсетпейміз.',
  },
  uz: {
    черновик: 'Qoralama: tavsif va chizmalarni ustoz tekshiryapti',
    поРусски: 'Tavsif hozircha rus tilida.',
    выделено: 'belgilangan: № {n} — {что}',
    выделеноКуда: 'belgilangan: № {n} — {что} → {куда}',
    нетСвязи: 'Aloqa yoʻq — yuklanmadi. Internetni tekshirib, «Qayta urinish» tugmasini bosing.',
    повторить: 'Qayta urinish',
    нетФайла: 'Fayl topilmadi — ehtimol, yangi versiya chiqqan. Sahifani yangilang.',
    обновить: 'Sahifani yangilash',
    нетСверки: 'Maxrajlar fayli solishtiruvdan oʻtmadi — koʻrsatmaymiz.',
  },
  en: {
    черновик: 'Draft: descriptions and diagrams are being reviewed by an ustaz',
    поРусски: 'The description is in Russian for now.',
    выделено: 'highlighted: No. {n} — {что}',
    выделеноКуда: 'highlighted: No. {n} — {что} → {куда}',
    нетСвязи: 'No connection — nothing loaded. Check the internet and press “Try again”.',
    повторить: 'Try again',
    нетФайла: 'File not found — perhaps a new version has been released. Refresh the page.',
    обновить: 'Refresh the page',
    нетСверки: 'The makharij file did not pass verification — not shown.',
  },
});

/** Атрибуты HTML для react-native-web (Text их поддерживает, в типах RN их нет). */
const АРАБСКИЙ_ВЕБ = (ВЕБ ? { lang: 'ar', dir: 'rtl' } : {}) as object;
const ШРИФТ_АРАБСКИЙ = ВЕБ ? "'Noto Naskh Arabic', 'Geeza Pro', 'Segoe UI', Tahoma, 'Arial', sans-serif" : undefined;

/** Арабский из данных (буква, название махраджа, лакаб, бейт) — как есть. */
export function АрабскийМахраджа({ текст, размер = 22, цвет: свой, testID }: { текст: string; размер?: number; цвет?: string; testID?: string }) {
  const { цвет } = useТема();
  return (
    <Text
      {...АРАБСКИЙ_ВЕБ}
      selectable
      testID={testID}
      style={{ fontFamily: ШРИФТ_АРАБСКИЙ, fontSize: размер, lineHeight: Math.round(размер * 1.7), color: свой ?? цвет.текст, textAlign: 'center', writingDirection: 'rtl' }}
    >
      {текст}
    </Text>
  );
}

/** «выделено: №N — что → куда» (docs/дизайн/06 §4.1). */
export function описаниеПодсветки(м: Махрадж, язык: Язык, т: (к: 'выделено' | 'выделеноКуда', п: Record<string, string | number>) => string): string {
  const что = текстМахраджа(м.подсветка.что, язык);
  return м.подсветка.куда ? т('выделеноКуда', { n: м.номер, что, куда: текстМахраджа(м.подсветка.куда, язык) }) : т('выделено', { n: м.номер, что });
}

/** Схема махраджа: <img> на своей светлой подложке в обеих темах; подпись видна под рисунком. */
export function СхемаМахраджа({ файл, подпись, выделено, testID }: { файл: string; подпись: string; выделено?: string; testID?: string }) {
  const { отступ, радиус } = useТема();
  const alt = выделено ? `${подпись}; ${выделено}` : подпись;
  return (
    <View
      testID={testID}
      style={{ backgroundColor: ФОН_СХЕМЫ, borderColor: РАМКА_СХЕМЫ, borderWidth: 1, borderRadius: радиус.l, padding: отступ.s, gap: отступ.s, alignItems: 'center' }}
    >
      {ВЕБ ? (
        createElement('img', {
          src: адресСхемы(файл),
          alt,
          'data-testid': testID ? testID + '-рисунок' : undefined,
          loading: 'lazy',
          decoding: 'async',
          style: { display: 'block', width: '100%', maxWidth: 420, height: 'auto', aspectRatio: '1 / 1' },
        })
      ) : (
        <Text>{alt}</Text>
      )}
      <Text style={{ color: ТЕКСТ_НА_СХЕМЕ, fontSize: 14, lineHeight: 20, textAlign: 'center' }} {...(ВЕБ ? ({ 'aria-hidden': true } as object) : null)}>
        {подпись}
      </Text>
    </View>
  );
}

/** «Нет связи» + «Повторить» | «Файл не найден» | «не прошло сверку». */
export function МахраджиНедоступны({ состояние }: { состояние: { нетСвязи: boolean; причина: ПричинаОтказа; повторить: () => void } }) {
  const т = useСловарь(СЛОВАРЬ_МАХРАДЖЕЙ);
  const { отступ } = useТема();
  if (состояние.нетСвязи) {
    return (
      <View style={{ gap: отступ.s }}>
        <Текст вид="второй" testID="махраджи-нет-связи" accessibilityLiveRegion="polite">
          {т('нетСвязи')}
        </Текст>
        <Кнопка вид="вторичная" значок="повтор" надпись={т('повторить')} растянуть={false} приНажатии={состояние.повторить} testID="махраджи-повторить" />
      </View>
    );
  }
  if (состояние.причина === 'нет-файла') {
    return (
      <View style={{ gap: отступ.s }}>
        <Текст вид="второй" testID="махраджи-нет-файла" accessibilityLiveRegion="polite">
          {т('нетФайла')}
        </Текст>
        {ВЕБ ? <Кнопка вид="вторичная" значок="повтор" надпись={т('обновить')} растянуть={false} приНажатии={() => globalThis.location?.reload()} /> : null}
      </View>
    );
  }
  return (
    <Текст вид="второй" testID="махраджи-нет-сверки">
      {т('нетСверки')}
    </Текст>
  );
}
