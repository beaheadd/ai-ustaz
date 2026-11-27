/**
 * Режим «Страницами» — страница мединского мусхафа целиком, листание как в книге.
 *
 * Решение владельца 27.11.2026: «Страницу Корана нужно сделать так, чтобы можно было читать отдельно, чтобы аяты были,
 * и переключение как книга — так же, как на странице Корана. Чтобы страницы можно было листать, как в Коране».
 * Режим «Аят за аятом» (сплошная прокрутка, владелец 21.11.2026) остаётся по умолчанию; выбор — в меню вида суры
 * (quran/readingView.ts: режим 'страницы').
 *
 * Данные: границы 604 страниц — Tanzil Quran Metadata (QuranData.Page; индекс мусхафа quran/tajweed/index…json,
 * quran/mushaf.ts: страницаАята, участкиСтраницы, джузСтраницы), текст аятов — файлы сур Tanzil дословно (quran/data.ts),
 * цвета таджвида — та же разметка, что в мусхаф-виде. Переносов строк мусхафа в данных нет: строки на экране
 * переносятся по ширине, а кегль подбирается по замеру, чтобы страница поместилась без прокрутки (на очень маленьком
 * экране — прокрутка внутри страницы).
 *
 * Листание — как в арабской книге (справа налево): следующая страница — свайп вправо (палец слева направо), кнопка
 * слева «‹», клавиша ←; предыдущая — свайп влево, кнопка справа «›», клавиша →. Сдвиг с переходом 200 мс (при
 * «уменьшить движение» — сразу).
 *
 * Контракт: <СтраницыМусхафа начало={{ сура, аят }} ночь сЦветами наСтранице(сура, аят) проверить(сура, аят) />
 *   наСтранице — первая строка новой страницы (экран обновляет адрес и заголовок, запоминает место чтения);
 *   проверить — «Проверить моё чтение» из листа действий аята (лист записи держит экран суры).
 * testID: мусхаф-страница, мусхаф-страница-номер, мусхаф-страница-шапка, мусхаф-страница-след, мусхаф-страница-пред,
 *   мусхаф-страница-текст (область текста).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { Значок, Текст } from '../../components';
import { арабскиеЦифры, ПАЛИТРЫ_МУСХАФА, ПотокМусхафа, useЦветаСуры } from '../../components/quran/MushafView';
import { создатьСловарь, useПеревод, useСловарь } from '../../i18n';
import { useИндексСур, useСура, type СураКорана } from '../../quran/data';
import { useРазмерАрабского } from '../../quran/fontSize';
import { джузСтраницы, страницаАята, участкиСтраницы, type Участок } from '../../quran/mushaf';
import { useИндексМусхафа } from '../../quran/mushafData';
import { useЗакладка } from '../../quran/useBookmark';
import { useУменьшитьДвижение } from '../../theme';
import { ЛистДействийАята } from './AyahActions';
import { названиеСуры, сохранитьЧтениеСразу } from './common';

const СЛОВАРЬ = создатьСловарь({
  ru: { след: 'Следующая страница', пред: 'Предыдущая страница', страница: 'Страница {н} из 604', джуз: 'Джуз {н}', загрузка: 'Загрузка…' },
  kk: { след: 'Келесі бет', пред: 'Алдыңғы бет', страница: '604 беттің {н}-беті', джуз: '{н}-пара', загрузка: 'Жүктелуде…' },
  uz: { след: 'Keyingi sahifa', пред: 'Oldingi sahifa', страница: '604 sahifadan {н}-sahifa', джуз: '{н}-pora', загрузка: 'Yuklanmoqda…' },
  en: { след: 'Next page', пред: 'Previous page', страница: 'Page {н} of 604', джуз: 'Juz {н}', загрузка: 'Loading…' },
});

const ВЕБ = Platform.OS === 'web';
const СТРАНИЦ = 604;
const МИН_КЕГЛЬ = 14;

type Свойства = {
  начало: { сура: number; аят: number };
  ночь: boolean;
  сЦветами: boolean;
  наСтранице: (сура: number, аят: number) => void;
  проверить: (сура: СураКорана, аят: number) => void;
};

export function СтраницыМусхафа({ начало, ночь, сЦветами, наСтранице, проверить }: Свойства) {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const уменьшить = useУменьшитьДвижение();
  const п = ночь ? ПАЛИТРЫ_МУСХАФА.ночь : ПАЛИТРЫ_МУСХАФА.бумага;
  const мусхаф = useИндексМусхафа();
  const индекс = useИндексСур();
  const суры = индекс.состояние === 'есть' ? индекс.данные.суры : null;
  const и = мусхаф.состояние === 'есть' ? мусхаф.данные : null;

  const [страница, установитьСтраницу] = useState<number | null>(null);
  const [направление, установитьНаправление] = useState<1 | -1 | 0>(0);
  useEffect(() => {
    if (и && страница === null) установитьСтраницу(страницаАята(и.страницы, начало.сура, Math.max(1, начало.аят)));
  }, [и, страница, начало.сура, начало.аят]);

  const участки: Участок[] = useMemo(
    () => (и && суры && страница !== null ? участкиСтраницы(и.страницы, страница, (с) => суры[с - 1]?.аятов ?? 0) : []),
    [и, суры, страница],
  );

  // Новая страница — сообщить экрану, где мы (адрес, заголовок, место чтения): на странице, открытой по аяту, — сам
  // этот аят (открыли аль-Вакиа — заголовок «аль-Вакиа», хотя страница начинается концом ар-Рахмана), дальше — первая
  // строка страницы.
  const первая = участки[0];
  const цельНачала = useRef<{ страница: number | null; сура: number; аят: number }>({ страница: null, сура: начало.сура, аят: Math.max(1, начало.аят) });
  if (и && цельНачала.current.страница === null) цельНачала.current.страница = страницаАята(и.страницы, начало.сура, Math.max(1, начало.аят));
  const место = первая ? (страница === цельНачала.current.страница ? { сура: цельНачала.current.сура, аят: цельНачала.current.аят } : { сура: первая.сура, аят: первая.с }) : null;
  useEffect(() => {
    if (место) наСтранице(место.сура, место.аят);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [место?.сура, место?.аят]);

  // Уход с экрана и сворачивание приложения — записать место сразу (как в режиме «Аят за аятом»).
  useEffect(() => {
    const скрыто = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') сохранитьЧтениеСразу();
    };
    if (ВЕБ && typeof document !== 'undefined') document.addEventListener('visibilitychange', скрыто);
    return () => {
      if (ВЕБ && typeof document !== 'undefined') document.removeEventListener('visibilitychange', скрыто);
      сохранитьЧтениеСразу();
    };
  }, []);

  const листать = useCallback(
    (шаг: 1 | -1) => {
      установитьСтраницу((с) => {
        if (с === null) return с;
        const н = с + шаг;
        if (н < 1 || н > СТРАНИЦ) return с;
        установитьНаправление(шаг);
        return н;
      });
    },
    [],
  );

  // Клавиши: ← — следующая (книга справа налево), → — предыдущая.
  useEffect(() => {
    if (!ВЕБ || typeof document === 'undefined') return;
    const ф = (е: KeyboardEvent) => {
      const цель = е.target as HTMLElement | null;
      if (цель && (цель.tagName === 'INPUT' || цель.tagName === 'TEXTAREA' || цель.isContentEditable)) return;
      if (е.altKey || е.ctrlKey || е.metaKey) return;
      if (е.key === 'ArrowLeft') листать(1);
      else if (е.key === 'ArrowRight') листать(-1);
    };
    document.addEventListener('keydown', ф);
    return () => document.removeEventListener('keydown', ф);
  }, [листать]);

  // Свайп: вправо (dx > 0) — следующая, влево — предыдущая.
  const касание = useRef<{ x: number; y: number } | null>(null);
  const начатьКасание = (е: GestureResponderEvent) => {
    const т0 = е.nativeEvent.touches?.[0] ?? е.nativeEvent;
    касание.current = { x: т0.pageX, y: т0.pageY };
  };
  const закончитьКасание = (е: GestureResponderEvent) => {
    const н = касание.current;
    касание.current = null;
    const т1 = е.nativeEvent.changedTouches?.[0] ?? е.nativeEvent;
    if (!н) return;
    const dx = т1.pageX - н.x;
    const dy = т1.pageY - н.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) листать(dx > 0 ? 1 : -1);
  };

  // Подбор кегля: начинаем с выбора человека, уменьшаем, пока страница не поместится (или до МИН_КЕГЛЬ).
  const { кегль: кегльЧеловека } = useРазмерАрабского();
  const [кегль, установитьКегль] = useState(кегльЧеловека);
  const область = useRef<HTMLElement | null>(null);
  const [размер, установитьРазмер] = useState(0);
  useEffect(() => {
    установитьКегль(кегльЧеловека);
  }, [страница, кегльЧеловека, размер]);
  useEffect(() => {
    if (!ВЕБ || typeof window === 'undefined') return;
    const ф = () => установитьРазмер(window.innerWidth * 10000 + window.innerHeight);
    window.addEventListener('resize', ф);
    return () => window.removeEventListener('resize', ф);
  }, []);
  // Текст сур приходит в дочерних участках позже — следим за размером содержимого, чтобы подобрать кегль сразу.
  const [, установитьТакт] = useState(0);
  const естьСтраница = страница !== null && !!и && !!суры;
  useEffect(() => {
    const э = область.current;
    if (!ВЕБ || !э || typeof ResizeObserver === 'undefined') return;
    const н = new ResizeObserver(() => установитьТакт((х) => (х + 1) % 1000));
    н.observe(э);
    if (э.firstElementChild) н.observe(э.firstElementChild);
    return () => н.disconnect();
  }, [естьСтраница]);
  useLayoutEffect(() => {
    const э = область.current;
    if (!ВЕБ || !э) return;
    const надо = э.clientHeight;
    const есть = э.scrollHeight;
    if (есть > надо + 1 && кегль > МИН_КЕГЛЬ) {
      установитьКегль(Math.max(МИН_КЕГЛЬ, Math.floor(кегль * Math.sqrt(надо / есть) * 0.98)));
    }
  });

  // Сдвиг при перелистывании: новая страница въезжает со стороны листания.
  const [сдвиг, установитьСдвиг] = useState(0);
  useLayoutEffect(() => {
    if (направление === 0 || уменьшить) return;
    установитьСдвиг(направление * 48);
    const к = requestAnimationFrame(() => requestAnimationFrame(() => установитьСдвиг(0)));
    return () => cancelAnimationFrame(к);
  }, [страница, направление, уменьшить]);

  const [действия, установитьДействия] = useState<{ сура: СураКорана; аят: number } | null>(null);

  if (!и || !суры || страница === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Текст вид="второй">{т('загрузка')}</Текст>
      </View>
    );
  }

  const джуз = джузСтраницы(и, страница);
  const имяСуры = место ? названиеСуры(суры[место.сура - 1] ?? null, место.сура, язык) : '';

  const кнопка = (шаг: 1 | -1) => {
    const доступна = шаг === 1 ? страница < СТРАНИЦ : страница > 1;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={т(шаг === 1 ? 'след' : 'пред')}
        disabled={!доступна}
        onPress={() => листать(шаг)}
        testID={шаг === 1 ? 'мусхаф-страница-след' : 'мусхаф-страница-пред'}
        hitSlop={6}
        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: доступна ? (pressed ? 0.5 : 1) : 0.3 })}
      >
        <Значок имя={шаг === 1 ? 'назад' : 'вперёд'} размер={24} цвет={п.рамка2 === '#0F4C45' && !ночь ? п.рамка2 : п.знак} толщина={2} />
      </Pressable>
    );
  };

  return (
    <View
      testID="мусхаф-страница"
      {...((ВЕБ ? { dataSet: { page: String(страница) } } : {}) as object)}
      style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
      onTouchStart={начатьКасание}
      onTouchEnd={закончитьКасание}
    >
      <View testID="мусхаф-страница-шапка" style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 4 }}>
        <Текст вид="мелкий" цвет={п.второй} numberOfLines={1} стиль={{ flex: 1 }}>
          {имяСуры}
        </Текст>
        <Текст вид="мелкий" цвет={п.второй}>
          {т('джуз', { н: джуз })}
        </Текст>
      </View>
      {/* Рамка страницы, как в мусхафе: двойная линия — золото снаружи, тонкая зелёная внутри. */}
      <View style={{ flex: 1, marginHorizontal: 8, borderWidth: 1.5, borderColor: п.рамка, borderRadius: 6, padding: 2 }}>
        <View style={{ flex: 1, borderWidth: 0.5, borderColor: п.рамка2, borderRadius: 4 }}>
          <ScrollView
            ref={(р) => {
              const узел = (р as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.() ?? null;
              область.current = узел;
            }}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6 }}
            testID="мусхаф-страница-текст"
          >
            <View
              style={{
                gap: 2,
                transform: [{ translateX: сдвиг }],
                opacity: сдвиг === 0 ? 1 : 0.4,
                ...(ВЕБ && !уменьшить && сдвиг === 0 ? ({ transitionProperty: 'transform, opacity', transitionDuration: '200ms', transitionTimingFunction: 'ease-out' } as object) : null),
              }}
            >
              {участки.map((уч) => (
                <УчастокСтраницы key={уч.сура + ':' + уч.с} участок={уч} ночь={ночь} сЦветами={сЦветами} кегль={кегль} открыть={(сура, аят) => установитьДействия({ сура, аят })} выбран={действия ? действия.сура.сура + ':' + действия.аят : null} />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4 }}>
        {кнопка(1)}
        <Текст вид="мелкий" цвет={п.второй} accessibilityLabel={т('страница', { н: страница })} testID="мусхаф-страница-номер" стиль={{ fontVariant: ['tabular-nums'] }}>
          {арабскиеЦифры(страница) + ' · ' + страница}
        </Текст>
        {кнопка(-1)}
      </View>
      {действия ? (
        <ЛистДействийАята
          сура={действия.сура}
          аят={действия.аят}
          закрыть={() => установитьДействия(null)}
          проверить={(а) => {
            const с = действия.сура;
            установитьДействия(null);
            проверить(с, а);
          }}
        />
      ) : null}
    </View>
  );
}

function УчастокСтраницы({ участок, ночь, сЦветами, кегль, открыть, выбран }: { участок: Участок; ночь: boolean; сЦветами: boolean; кегль: number; открыть: (сура: СураКорана, аят: number) => void; выбран: string | null }) {
  const сура = useСура(участок.сура);
  if (сура.состояние !== 'есть') return null;
  return <УчастокСуры сура={сура.данные} участок={участок} ночь={ночь} сЦветами={сЦветами} кегль={кегль} открыть={открыть} выбран={выбран} />;
}

function УчастокСуры({ сура, участок, ночь, сЦветами, кегль, открыть, выбран }: { сура: СураКорана; участок: Участок; ночь: boolean; сЦветами: boolean; кегль: number; открыть: (сура: СураКорана, аят: number) => void; выбран: string | null }) {
  const { цвета } = useЦветаСуры(сура, сЦветами);
  const закладка = useЗакладка();
  return (
    <ПотокМусхафа
      сура={сура}
      с={участок.с}
      по={участок.по}
      цвета={цвета}
      ночь={ночь}
      выбран={выбран}
      играет={null}
      закладка={закладка ? закладка.сура + ':' + закладка.аят : null}
      строкой
      кегль={кегль}
      выбрать={(ключ) => {
        if (!ключ) return;
        const а = Number(ключ.split(':')[1]);
        if (а >= 1) открыть(сура, а);
      }}
    />
  );
}
