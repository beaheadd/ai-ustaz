/**
 * Общее для экранов «Хадисы» (#/hadith, #/hadith/list, #/hadith/item): строка хадиса, арабский абзац, ссылка на
 * HadeethEnc.com, поле поиска, состояния загрузки, заголовки на языке интерфейса.
 *
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!». Данные — src/hadith/data.ts.
 * - Строки HadeethEnc выводятся как есть (условия: без изменений, добавлений и удалений); заголовок в списке
 *   обрезается только глазами (numberOfLines), целиком — на экране хадиса.
 * - Арабский текст хадиса — обычный системный арабский шрифт (не Amiri Quran: это не Коран), lang="ar", dir="rtl".
 * - Ссылка на страницу хадиса — обычная ссылка (на вебе <a target="_blank" rel="noopener noreferrer">), переход только
 *   по нажатию; само приложение к hadeethenc.com запросов не делает (CSP).
 * Контракт:
 *   useЗаголовкиЯзыка(язык) → { состояние, заголовки: (Заголовки|null)[] (язык, затем ru), повторить }
 *   <СтрокаХадиса запись заголовки язык последняя /> — ссылка #/hadith/item?n=<id>: номер, заголовок, «аль-Бухари · степень»
 *   <АрабскийАбзац текст testID? />, <СсылкаHadeethEnc адрес надпись testID? />, <ПолеПоиска значение изменить подпись testID />
 *   <ХадисыНедоступны состояние /> — «Нет связи» + «Повторить» | «Файл не найден» | «не прошло сверку»
 *   СЛОВАРЬ_ХАДИСОВ — общие строки (kk, uz, en — черновики для редактора-носителя).
 * testID: хадис-строка-<id>, хадисы-нет-связи, хадисы-повторить, хадисы-нет-файла, хадисы-нет-сверки.
 */
import { memo, useRef, useState, type ComponentRef, type ComponentType } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View, type TextProps } from 'react-native';
import { Кнопка, Значок, Текст } from '../../components';
import { useНавигация } from '../../engine/navigation';
import { вХэш } from '../../engine/routes';
import { useЗаголовки, языкЗаголовков, type Заголовки, type ЗаписьХадиса, type ПричинаОтказа } from '../../hadith/data';
import { создатьСловарь, useПеревод, useСловарь } from '../../i18n';
import { ШРИФТ_ИНТЕРФЕЙСА, useТема } from '../../theme';

export const ВЕБ = Platform.OS === 'web';

export const СЛОВАРЬ_ХАДИСОВ = создатьСловарь({
  ru: {
    бухари: 'аль-Бухари',
    строка: '{n}. {заголовок}',
    подпись: 'аль-Бухари · {степень}',
    хадисов: 'Хадисов: {н}',
    нетСвязи: 'Нет связи — не загрузилось. Проверьте интернет и нажмите «Повторить».',
    повторить: 'Повторить',
    нетФайла: 'Файл не найден — возможно, вышла новая версия. Обновите страницу.',
    обновить: 'Обновить страницу',
    нетСверки: 'Файл не прошёл сверку с выгрузкой HadeethEnc — не показываем.',
    черновик: 'Черновик — проверяет устаз',
    запасной: 'Перевода на язык интерфейса пока нет — русский перевод',
  },
  kk: {
    бухари: 'әл-Бұхари',
    строка: '{n}. {заголовок}',
    подпись: 'әл-Бұхари · {степень}',
    хадисов: 'Хадистер: {н}',
    нетСвязи: 'Байланыс жоқ — жүктелмеді. Интернетті тексеріп, «Қайталау» түймесін басыңыз.',
    повторить: 'Қайталау',
    нетФайла: 'Файл табылмады — жаңа нұсқа шыққан болуы мүмкін. Бетті жаңартыңыз.',
    обновить: 'Бетті жаңарту',
    нетСверки: 'Файл HadeethEnc жүктемесімен салыстырудан өтпеді — көрсетпейміз.',
    черновик: 'Жоба — ұстаз тексеріп жатыр',
    запасной: 'Қазақ тіліндегі аударма әзірге жоқ — орысша аудармасы',
  },
  uz: {
    бухари: 'al-Buxoriy',
    строка: '{n}. {заголовок}',
    подпись: 'al-Buxoriy · {степень}',
    хадисов: 'Hadislar: {н}',
    нетСвязи: 'Aloqa yoʻq — yuklanmadi. Internetni tekshirib, «Qayta urinish» tugmasini bosing.',
    повторить: 'Qayta urinish',
    нетФайла: 'Fayl topilmadi — ehtimol, yangi versiya chiqqan. Sahifani yangilang.',
    обновить: 'Sahifani yangilash',
    нетСверки: 'Fayl HadeethEnc yuklamasi bilan solishtiruvdan oʻtmadi — koʻrsatmaymiz.',
    черновик: 'Qoralama — ustoz tekshiryapti',
    запасной: 'Oʻzbekcha tarjimasi hozircha yoʻq — ruscha tarjimasi',
  },
  en: {
    бухари: 'al-Bukhari',
    строка: '{n}. {заголовок}',
    подпись: 'al-Bukhari · {степень}',
    хадисов: 'Hadiths: {н}',
    нетСвязи: 'No connection — nothing loaded. Check the internet and press “Try again”.',
    повторить: 'Try again',
    нетФайла: 'File not found — perhaps a new version has been released. Refresh the page.',
    обновить: 'Refresh the page',
    нетСверки: 'The file did not pass verification against the HadeethEnc export — not shown.',
    черновик: 'Draft — under review by an ustaz',
    запасной: 'No English translation yet — Russian translation',
  },
});

/** Заголовки для списка и поиска: файл языка интерфейса (kk → ru) и, если язык не ru, русский — запасной. */
export function useЗаголовкиЯзыка(язык: string) {
  const я = языкЗаголовков(язык);
  const свой = useЗаголовки(я);
  const ru = useЗаголовки('ru');
  const нужныОба = я !== 'ru';
  const состояния = нужныОба ? [свой, ru] : [свой];
  const нет = состояния.find((с) => с.состояние === 'нет');
  const загрузка = состояния.some((с) => с.состояние === 'загрузка');
  const заголовки: (Заголовки | null)[] = состояния.map((с) => (с.состояние === 'есть' ? с.данные : null));
  return {
    состояние: нет ? нет : загрузка ? ({ состояние: 'загрузка' } as const) : ({ состояние: 'есть' } as const),
    заголовки,
    повторить: () => состояния.forEach((с) => с.повторить()),
  };
}

/** Заголовок и степень хадиса из первого файла, где он есть (язык, затем ru). */
export function заголовокХадиса(заголовки: readonly (Заголовки | null)[], id: number) {
  for (const з of заголовки) {
    const т = з?.get(id);
    if (т) return т;
  }
  return null;
}

/** На вебе — <a href target=_blank rel="noopener noreferrer"> (react-native-web: Text с href и hrefAttrs). */
const ТекстСсылка = Text as unknown as ComponentType<TextProps & { href?: string; hrefAttrs?: { target?: string; rel?: string }; role?: string }>;

/** Внешняя ссылка на HadeethEnc.com: переход только по нажатию (новая вкладка / внешний браузер). */
export function СсылкаHadeethEnc({ адрес, надпись, testID }: { адрес: string; надпись: string; testID?: string }) {
  const { цвет, отступ } = useТема();
  if (!ВЕБ) {
    return <Кнопка вид="вторичная" значок="внешняя" надпись={надпись} приНажатии={() => Linking.openURL(адрес)} testID={testID} />;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.xs }}>
      <Значок имя="внешняя" размер={18} цвет={цвет.акцент} />
      <ТекстСсылка
        href={адрес}
        hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
        role="link"
        testID={testID}
        style={{ fontFamily: ШРИФТ_ИНТЕРФЕЙСА, fontSize: 16, lineHeight: 24, fontWeight: '600', color: цвет.акцент, textDecorationLine: 'underline', flexShrink: 1 }}
      >
        {надпись}
      </ТекстСсылка>
    </View>
  );
}

/** Атрибуты HTML для react-native-web (Text их поддерживает, в типах RN их нет). */
const АРАБСКИЙ_ВЕБ = (ВЕБ ? { lang: 'ar', dir: 'rtl' } : {}) as object;
/** Обычный арабский шрифт системы (не Amiri Quran — хадис не Коран); на вебе — стек системных шрифтов. */
const ШРИФТ_АРАБСКИЙ_ТЕКСТ = ВЕБ ? "'Noto Naskh Arabic', 'Geeza Pro', 'Segoe UI', Tahoma, 'Arial', sans-serif" : undefined;

/** Арабский абзац хадиса или справки (как есть; справа налево). */
export function АрабскийАбзац({ текст, testID, мелкий = false }: { текст: string; testID?: string; мелкий?: boolean }) {
  const { цвет } = useТема();
  const кегль = мелкий ? 17 : 21;
  return (
    <Text
      {...АРАБСКИЙ_ВЕБ}
      selectable
      testID={testID}
      style={{
        fontFamily: ШРИФТ_АРАБСКИЙ_ТЕКСТ,
        fontSize: кегль,
        lineHeight: Math.round(кегль * 1.8),
        color: цвет.текст,
        textAlign: 'right',
        writingDirection: 'rtl',
      }}
    >
      {текст}
    </Text>
  );
}

/** Строка хадиса в списке: ссылка «#/hadith/item?n=<id>». Номер по порядку · заголовок · «аль-Бухари · степень». */
export const СтрокаХадиса = memo(function СтрокаХадиса({
  запись,
  заголовки,
  последняя,
}: {
  запись: ЗаписьХадиса;
  заголовки: readonly (Заголовки | null)[];
  последняя: boolean;
}) {
  const т = useСловарь(СЛОВАРЬ_ХАДИСОВ);
  const { перейти } = useНавигация();
  const { цвет, отступ, радиус } = useТема();
  const з = заголовокХадиса(заголовки, запись.id);
  const ссылка = вХэш({ экран: 'хадис', параметры: { номер: запись.id } });
  const подпись = т('подпись', { степень: з?.степень ?? '' });
  return (
    <View {...(ВЕБ ? { role: 'listitem' as const } : {})} style={{ borderBottomWidth: последняя ? 0 : 1, borderBottomColor: цвет.граница }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${запись.n}. ${з?.заголовок ?? ''}. ${подпись}`}
        {...(ВЕБ
          ? ({
              href: ссылка,
              onKeyDown: (е: { key: string; preventDefault: () => void }) => {
                if (е.key === ' ' || е.key === 'Spacebar') {
                  е.preventDefault();
                  перейти('хадис', { номер: запись.id });
                }
              },
            } as object)
          : null)}
        onPress={(е) => {
          const с = е as unknown as { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; preventDefault?: () => void };
          if (с.metaKey || с.ctrlKey || с.shiftKey || с.altKey) return;
          с.preventDefault?.();
          перейти('хадис', { номер: запись.id });
        }}
        testID={'хадис-строка-' + запись.id}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: отступ.m,
          minHeight: 64,
          paddingHorizontal: отступ.m,
          paddingVertical: отступ.s,
          backgroundColor: pressed ? цвет.акцентМягкий : hovered ? цвет.поверхностьВторая : 'transparent',
          ...(ВЕБ ? ({ textDecorationLine: 'none' } as object) : null),
        })}
      >
        <View style={{ minWidth: 40, height: 40, paddingHorizontal: 6, borderRadius: радиус.круг, alignItems: 'center', justifyContent: 'center', backgroundColor: цвет.поверхностьАкцент }}>
          <Текст вид="метка" цвет={цвет.акцент} табличные>
            {String(запись.n)}
          </Текст>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Текст numberOfLines={2} стиль={{ fontWeight: '600' }} testID={`хадис-строка-${запись.id}-заголовок`}>
            {з?.заголовок ?? ''}
          </Текст>
          <Текст вид="мелкий" numberOfLines={2}>
            {подпись}
          </Текст>
        </View>
      </Pressable>
    </View>
  );
});

/** Список строк хадисов в карточке-рамке (role="list"). */
export function СписокХадисов({ записи, заголовки, testID }: { записи: readonly ЗаписьХадиса[]; заголовки: readonly (Заголовки | null)[]; testID?: string }) {
  const { цвет, радиус } = useТема();
  return (
    <View
      testID={testID}
      {...(ВЕБ ? { role: 'list' as const } : {})}
      style={{ borderRadius: радиус.l, borderWidth: 1, borderColor: цвет.граница, backgroundColor: цвет.поверхность, overflow: 'hidden' }}
    >
      {записи.map((з, i) => (
        <СтрокаХадиса key={з.id} запись={з} заголовки={заголовки} последняя={i === записи.length - 1} />
      ))}
    </View>
  );
}

/** Поле поиска (как в «Коране»): нажатие по всему полю ставит курсор. */
export function ПолеПоиска({ значение, изменить, подсказка, подпись, testID }: { значение: string; изменить: (с: string) => void; подсказка: string; подпись: string; testID: string }) {
  const { цвет, отступ, радиус } = useТема();
  const [вФокусе, установитьФокус] = useState(false);
  const поле = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable
      onPress={() => поле.current?.focus()}
      accessible={false}
      {...(ВЕБ ? ({ tabIndex: -1 } as object) : null)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: отступ.s,
        minHeight: 52,
        paddingHorizontal: вФокусе ? отступ.m - 1 : отступ.m,
        borderRadius: радиус.m,
        borderWidth: вФокусе ? 2 : 1,
        borderColor: вФокусе ? цвет.фокус : цвет.границаЭлемента,
        backgroundColor: цвет.поверхность,
      }}
    >
      <Значок имя="поиск" размер={20} цвет={цвет.текстВторой} />
      <TextInput
        ref={поле}
        value={значение}
        onChangeText={изменить}
        onFocus={() => установитьФокус(true)}
        onBlur={() => установитьФокус(false)}
        placeholder={подсказка}
        placeholderTextColor={цвет.текстВторой}
        accessibilityLabel={подпись}
        autoCorrect={false}
        autoCapitalize="none"
        inputMode="search"
        enterKeyHint="search"
        testID={testID}
        style={{ flex: 1, minWidth: 0, minHeight: 48, fontFamily: ШРИФТ_ИНТЕРФЕЙСА, fontSize: 16, color: цвет.текст, ...(ВЕБ ? ({ outlineStyle: 'none' } as object) : null) }}
      />
    </Pressable>
  );
}

/** «Нет связи» + «Повторить» | «Файл не найден» | «не прошло сверку» (правило 2: непроверенное не показываем). */
export function ХадисыНедоступны({ состояние }: { состояние: { нетСвязи: boolean; причина: ПричинаОтказа; повторить: () => void } }) {
  const т = useСловарь(СЛОВАРЬ_ХАДИСОВ);
  const { отступ } = useТема();
  if (состояние.нетСвязи) {
    return (
      <View style={{ gap: отступ.s }}>
        <Текст вид="второй" testID="хадисы-нет-связи" accessibilityLiveRegion="polite">
          {т('нетСвязи')}
        </Текст>
        <Кнопка вид="вторичная" значок="повтор" надпись={т('повторить')} растянуть={false} приНажатии={состояние.повторить} testID="хадисы-повторить" />
      </View>
    );
  }
  if (состояние.причина === 'нет-файла') {
    return (
      <View style={{ gap: отступ.s }}>
        <Текст вид="второй" testID="хадисы-нет-файла" accessibilityLiveRegion="polite">
          {т('нетФайла')}
        </Текст>
        {ВЕБ ? <Кнопка вид="вторичная" значок="повтор" надпись={т('обновить')} растянуть={false} приНажатии={() => globalThis.location?.reload()} testID="хадисы-обновить" /> : null}
      </View>
    );
  }
  return (
    <Текст вид="второй" testID="хадисы-нет-сверки">
      {т('нетСверки')}
    </Текст>
  );
}

/** Скрыт глазами, читается диктором (live-регион). */
export const стильСкрытого = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, opacity: 0 };

/** Язык интерфейса — для подписей (useПеревод().язык). */
export function useЯзык() {
  return useПеревод().язык;
}
