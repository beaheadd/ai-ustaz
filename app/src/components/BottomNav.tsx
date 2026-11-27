/**
 * НижнееМеню — пять разделов приложения внизу экрана (tab bar).
 *
 * Основание: решение владельца 19.11.2026 («Нижний блок меню обязательно должен быть. Главное, Таджвид, Коран,
 * Хадис и там настройки…»); анализ и макет — docs/дизайн/04-нижнее-меню-и-главная.md, раздел «Нижнее меню».
 *
 * Контракт: <НижнееМеню /> — без пропсов; рисует App.tsx под текущим экраном, как обычный элемент колонки (flex,
 * не position: fixed): прокрутка экрана сама становится короче, содержимое под меню не уходит. На фокусных
 * экранах (routes.ts ФОКУСНЫЕ: урок, урок 0, онбординг) App.tsx меню не рисует.
 * - Разделы и порядок — routes.ts ВКЛАДКИ (владелец 27.11.2026): Главная · Коран · AI Ustaz · Хадисы · Ещё (kk — черновик
 *   для редактора: Басты бет · Құран · AI Ustaz · Хадис · Тағы); «Таджвид» — плитка главной и строка в «Ещё».
 *   Центральный пункт (routes.ts ЦЕНТР_МЕНЮ) — круг 56 px с образом AI Устаза (components/UstazFigure.tsx: мужчина без
 *   лица в одежде сунны, владелец 27.11.2026), приподнят над линией меню на 18 px (поверхностьАкцент, обводка «акцент»;
 *   выбран — обводка 3 px и подпись 600). Цель нажатия — весь пункт. Подписи видны всегда, без многоточия; при крупном шрифте меню
 *   растёт (minHeight 64), а подпись не выходит за свой пункт: ширина ≤ пункта, слово, которое не влезает, переносится
 *   (на вебе overflow-wrap: anywhere и переносы по слогам по lang страницы; ревью 19.11.2026: при тексте ×2 «Главная»
 *   налезала на «Таджвид» и уходила за край окна).
 * - Подсвеченный раздел — routes.ts активнаяВкладка(стек) (подстраница — в разделе, откуда её открыли).
 * - Нажатие: другой раздел — useНавигация().перейтиВкладку(в); тот же раздел на подстранице — назад к корню
 *   раздела; тот же раздел на корне — прокрутка экрана к началу (прокрутитьЭкранВверх).
 * - Вид (§3.3): фон «поверхность», сверху линия «граница», без тени, размытия и золота. Неактивные — «текстВторой»,
 *   подпись 400. Активный — «таблетка» 56×30 «акцентМягкий» с обводкой 1,5 px «акцент» (форма, не только цвет;
 *   в тёмной теме без обводки активный почти не отличим), значок толще (2,25), значок и подпись «акцент», 600.
 *   Без бейджей, счётчиков, точек «новое», звука, вибрации и анимации; нажатие — прозрачность 0,7.
 * - Высота 64 + безопасная зона снизу (на вебе env(safe-area-inset-bottom), viewport-fit=cover уже в index.html;
 *   нативно — позже react-native-safe-area-context). Цель нажатия — весь пункт (≥ 72×64 на 360 px).
 * - Доступность. Веб: <nav aria-label="Основные разделы">, пункты — ссылки <a href="#/…"> (клик перехвачен:
 *   preventDefault + перейтиВкладку, иначе hashchange положил бы экран поверх стека), у активного
 *   aria-current="page"; Tab и Enter работают, кольцо :focus-visible — общее, но внутри пункта (data-focus="inside":
 *   outline-offset −3 px — у нижнего края окна и у крайних пунктов кольцо не обрезается). Шаблон tablist не берём
 *   (он для панелей внутри страницы). Нативно: tabbar / tab + accessibilityState.selected. Значки декоративные.
 * testID: нижнее-меню, меню-<вкладка> (меню-главная, меню-коран, меню-устаз, меню-хадисы, меню-ещё), круг-устаза.
 */
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useНавигация } from '../engine/navigation';
import { ВКЛАДКИ, КОРЕНЬ_ВКЛАДКИ, ЦЕНТР_МЕНЮ, активнаяВкладка, вХэш, type Вкладка, type Цель } from '../engine/routes';
import { создатьСловарь, useСловарь } from '../i18n';
import { ШИРИНА_КОЛОНКИ, useТема } from '../theme';
import type { ИмяЗначка } from '../design/icons';
import { Значок } from './Icon';
import { Текст } from './Text';
import { прокрутитьЭкранВверх } from './Screen';
import { ОбразУстаза } from './UstazFigure';

const СЛОВАРЬ = создатьСловарь({
  ru: { меню: 'Основные разделы', главная: 'Главная', таджвид: 'Таджвид', устаз: 'AI Ustaz', коран: 'Коран', хадисы: 'Хадисы', ещё: 'Ещё', устазПодпись: 'AI Ustaz — задать вопрос' },
  kk: { меню: 'Негізгі бөлімдер', главная: 'Басты бет', таджвид: 'Тәжуид', устаз: 'AI Ustaz', коран: 'Құран', хадисы: 'Хадис', ещё: 'Тағы', устазПодпись: 'AI Ustaz — сұрақ қою' },
  uz: { меню: 'Asosiy boʻlimlar', главная: 'Bosh sahifa', таджвид: 'Tajvid', устаз: 'AI Ustaz', коран: 'Qurʼon', хадисы: 'Hadislar', ещё: 'Yana', устазПодпись: 'AI Ustaz — savol berish' },
  en: { меню: 'Main sections', главная: 'Home', таджвид: 'Tajweed', устаз: 'AI Ustaz', коран: 'Quran', хадисы: 'Hadith', ещё: 'More', устазПодпись: 'AI Ustaz — ask a question' },
});

const ЗНАЧОК: Record<Exclude<Вкладка, typeof ЦЕНТР_МЕНЮ>, ИмяЗначка> = { главная: 'главная', таджвид: 'таджвид', коран: 'коран', хадисы: 'хадис', ещё: 'ещё' };

/** Высота ряда пунктов без безопасной зоны (px). */
export const ВЫСОТА_МЕНЮ = 64;

const ВЕБ = Platform.OS === 'web';

export function НижнееМеню() {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет } = useТема();
  const навигация = useНавигация();
  const активная = активнаяВкладка(навигация.стек);

  const нажать = (в: Вкладка, событие?: GestureResponderEvent) => {
    // Веб: пункт — настоящая ссылка; переход делает навигация, а не браузер.
    (событие as unknown as { preventDefault?: () => void } | undefined)?.preventDefault?.();
    const с = навигация.стек;
    const наКорне = в === 'главная' ? с.length === 1 : с.length === 2 && с[1].экран === КОРЕНЬ_ВКЛАДКИ[в];
    if (наКорне) прокрутитьЭкранВверх();
    else навигация.перейтиВкладку(в);
  };

  return (
    <View
      testID="нижнее-меню"
      {...(ВЕБ ? { role: 'navigation' as const } : { accessibilityRole: 'tabbar' as const })}
      accessibilityLabel={т('меню')}
      style={[
        стили.меню,
        {
          backgroundColor: цвет.поверхность,
          borderTopColor: цвет.граница,
          // Безопасная зона снизу (полоса жестов iPhone); в Chrome Android обычно 0.
          paddingBottom: ВЕБ ? ('env(safe-area-inset-bottom)' as unknown as number) : 0,
        },
      ]}
    >
      <View style={стили.ряд}>
        {ВКЛАДКИ.map((в) => {
          const выбрана = в === активная;
          const цветПункта = выбрана ? цвет.акцент : цвет.текстВторой;
          const адрес = вХэш({ экран: КОРЕНЬ_ВКЛАДКИ[в], параметры: undefined } as Цель);
          const центр = в === ЦЕНТР_МЕНЮ;
          return (
            <Pressable
              key={в}
              testID={'меню-' + в}
              {...(ВЕБ
                ? ({ href: адрес, role: 'link', 'aria-current': выбрана ? 'page' : undefined, dataSet: { focus: 'inside' } } as object)
                : { accessibilityRole: 'tab' as const, accessibilityState: { selected: выбрана } })}
              {...(центр ? { accessibilityLabel: т('устазПодпись') } : null)}
              onPress={(е) => нажать(в, е)}
              style={({ pressed }) => [стили.пункт, { opacity: pressed ? 0.7 : 1 }]}
            >
              {центр ? (
                // Центр — круг AI Ustaz над линией меню; тонкое кольцо цвета меню отделяет его от содержимого экрана.
                <View
                  testID="круг-устаза"
                  {...((ВЕБ ? { 'aria-hidden': true } : { importantForAccessibility: 'no-hide-descendants' }) as object)}
                  style={[
                    стили.круг,
                    { backgroundColor: цвет.поверхностьАкцент, borderColor: цвет.акцент, borderWidth: выбрана ? 3 : 1.5 },
                    ВЕБ ? ({ boxShadow: `0 0 0 4px ${цвет.поверхность}` } as object) : null,
                  ]}
                >
                  <ОбразУстаза размер={52} фон={false} />
                </View>
              ) : (
                <View
                  style={[
                    стили.таблетка,
                    выбрана ? { backgroundColor: цвет.акцентМягкий, borderColor: цвет.акцент } : { borderColor: 'transparent' },
                  ]}
                >
                  <Значок имя={ЗНАЧОК[в as keyof typeof ЗНАЧОК]} размер={24} цвет={цветПункта} толщина={выбрана ? 2.25 : 1.75} />
                </View>
              )}
              <Текст цвет={цветПункта} стиль={[стили.подпись, { fontWeight: выбрана ? '600' : '400' }]}>
                {т(в)}
              </Текст>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const стили = StyleSheet.create({
  меню: { width: '100%', borderTopWidth: StyleSheet.hairlineWidth },
  ряд: { flexDirection: 'row', width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, alignSelf: 'center' },
  пункт: {
    flex: 1,
    minWidth: 0,
    minHeight: ВЫСОТА_МЕНЮ,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 7,
    paddingBottom: 7,
    paddingHorizontal: 2,
    gap: 4,
  },
  таблетка: { width: 56, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  // Центр (AI Ustaz): верх круга на 18 px над линией меню (7 поле + −26 = −19); подпись — на уровне остальных.
  круг: { width: 56, height: 56, borderRadius: 28, marginTop: -26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Подпись не шире пункта; слово, которое не влезает (крупный текст, масштаб страницы), переносится, а не налезает.
  подпись: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: '100%',
    ...(ВЕБ ? ({ overflowWrap: 'anywhere', hyphens: 'auto' } as object) : null),
  },
});
