/**
 * Легенда цветов таджвида (вид «Мусхаф + цвета таджвида» и ночной с цветами). Владелец 20.11.2026.
 *
 * Контракт: <ЛегендаТаджвида тема? таджвид? плашка? /> и <ПлашкаТаджвида /> (над страницей; легенда тогда — с плашка={false}).
 *   Плашка «Цвета таджвида — черновик, проверяет устаз» видна всегда (правило 11: учебный религиозный контент).
 *   Раскрывашка «Что значат цвета» (aria-expanded): 11 правил — образец цвета, название (ru; kk — черновик), «Урок N»
 *   (где правило проходят по программе курса, docs/программа-курса.md §6–7) — ссылка на карту курса (#/course):
 *   уроков 17–40 в приложении ещё нет. Строка: «Правила — Хафс от ‘Асыма через аш-Шатибийю; при слитном чтении,
 *   остановка — в конце аята». Цвет не единственный носитель смысла: названия правил — текстом.
 *   тема — тема страницы (образец на её фоне), таджвид — «традиционные» | «различимые» (владелец 28.11.2026: дизайн A + B;
 *   в «Различимых» у мадда 4–6 образец подчёркнут, как в тексте; кода нет в наборе темы — образец цветом чернил).
 * testID: таджвид-черновик, таджвид-легенда (кнопка), таджвид-легенда-список, таджвид-правило-<код>, таджвид-урок-<код>.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useНавигация } from '../../engine/navigation';
import { создатьСловарь, useПеревод, useСловарь } from '../../i18n';
import { КОДЫ_ТАДЖВИДА, ПОДЧЁРКНУТЫЕ, ПРАВИЛА_ТАДЖВИДА, СТРАНИЦА, цветаТаджвида, type РежимТаджвида, type ТемаСтраницы } from '../../quran/tajweed';
import { useТема } from '../../theme';
import { Плашка } from '../Badge';
import { СтрокаСписка } from '../ListRow';
import { Текст } from '../Text';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    черновик: 'Цвета таджвида — черновик, проверяет устаз',
    легенда: 'Что значат цвета',
    урок: 'Урок {н}',
    урокПодпись: 'Урок {н} — открыть карту курса',
    линия: 'Правила — Хафс от ‘Асыма через аш-Шатибийю, при слитном чтении; остановка — в конце аята. Раскраску строят правила AI Ustaz, без ИИ.',
  },
  kk: {
    черновик: 'Тәжуид түстері — жоба, ұстаз тексереді',
    легенда: 'Түстер нені білдіреді',
    урок: '{н}-сабақ',
    урокПодпись: '{н}-сабақ — курс картасын ашу',
    линия: 'Ережелер — Хафс ‘Асымнан аш-Шатибия жолымен, жалғап оқығанда; тоқтау — аят соңында. Бояуды AI Ustaz ережелері құрады, ЖИ-сіз.',
  },
  uz: {
    черновик: 'Tajvid ranglari — qoralama, ustoz tekshiradi',
    легенда: 'Ranglar nimani bildiradi',
    урок: '{н}-dars',
    урокПодпись: '{н}-dars — kurs xaritasini ochish',
    линия: 'Qoidalar — Hafs anʼ Osim, Shotibiya yoʻli boʻyicha, ulab oʻqilganda; toʻxtash — oyat oxirida. Ranglarni AI Ustaz qoidalari beradi, SIsiz.',
  },
  en: {
    черновик: 'Tajweed colours are a draft; an ustaz is reviewing them',
    легенда: 'What the colours mean',
    урок: 'Lesson {н}',
    урокПодпись: 'Lesson {н} — open the course map',
    линия: "Rules — Hafs from 'Asim via ash-Shatibiyyah, in continuous reading; stopping — at the end of the ayah. The colouring is built by AI Ustaz rules, without AI.",
  },
}, 'components/quran/TajweedLegend');

/** Плашка «Цвета таджвида — черновик, проверяет устаз» (правило 11) — над страницей с цветами. */
export function ПлашкаТаджвида() {
  const т = useСловарь(СЛОВАРЬ);
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Плашка вид="черновик" надпись={т('черновик')} малая testID="таджвид-черновик" />
    </View>
  );
}

export function ЛегендаТаджвида({ тема = 'день', таджвид = 'традиционные', плашка = true }: { тема?: ТемаСтраницы; таджвид?: РежимТаджвида; плашка?: boolean }) {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { цвет, отступ, радиус } = useТема();
  const { перейти } = useНавигация();
  const [открыта, установитьОткрыта] = useState(false);
  const цвета = цветаТаджвида(тема, таджвид === 'безЦвета' ? 'традиционные' : таджвид) ?? {};
  const страница = СТРАНИЦА[тема];
  return (
    <View style={{ gap: отступ.s }}>
      {плашка ? <ПлашкаТаджвида /> : null}
      <СтрокаСписка заголовок={т('легенда')} значок="таджвид" раскрыт={открыта} приНажатии={() => установитьОткрыта((о) => !о)} testID="таджвид-легенда" />
      {открыта ? (
        <View testID="таджвид-легенда-список" style={{ gap: отступ.xs }} {...({ role: 'list' } as object)}>
          {КОДЫ_ТАДЖВИДА.map((код) => {
            const п = ПРАВИЛА_ТАДЖВИДА[код];
            return (
              <View key={код} testID={'таджвид-правило-' + код} {...({ role: 'listitem' } as object)} style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, minHeight: 48 }}>
                <View
                  style={{ width: 28, height: 28, borderRadius: радиус.s, backgroundColor: страница.фон, borderWidth: 1, borderColor: цвет.граница, alignItems: 'center', justifyContent: 'center' }}
                  {...({ 'aria-hidden': true } as object)}
                >
                  <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: цвета[код] ?? страница.чернила }} />
                  {таджвид === 'различимые' && ПОДЧЁРКНУТЫЕ.has(код) ? <View style={{ position: 'absolute', bottom: 3, width: 16, height: 1.5, backgroundColor: цвета[код] ?? страница.чернила }} /> : null}
                </View>
                <Текст вид="второй" стиль={{ flex: 1 }}>
                  {п[язык === 'kk' || язык === 'uz' || язык === 'en' ? язык : 'ru']}
                </Текст>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={т('урокПодпись', { н: п.урок })}
                  onPress={() => перейти('картаКурса')}
                  testID={'таджвид-урок-' + код}
                  style={({ pressed }) => ({ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: отступ.xs, opacity: pressed ? 0.6 : 1 })}
                >
                  <Текст вид="метка" цвет={цвет.акцент} стиль={{ textDecorationLine: 'underline' }}>
                    {т('урок', { н: п.урок })}
                  </Текст>
                </Pressable>
              </View>
            );
          })}
          <Текст вид="мелкий">{т('линия')}</Текст>
        </View>
      ) : null}
    </View>
  );
}
