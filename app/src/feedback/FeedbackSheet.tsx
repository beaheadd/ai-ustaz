/**
 * Лист «Сообщить об ошибке» — отдельный ленивый чанк (открывает FeedbackLayer.tsx).
 *
 * Владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“. И написать, какая там ошибка. Все эти данные
 * нам нужно будет для улучшения». Сервер — server/feedback.py.
 *
 * Что в листе: выделенный текст (только чтение, ≤ 500 символов); «Где: <название экрана>»; раздел (Коран / таджвид,
 * Хадис, Перевод, Зикр / дуа, Время намаза, Интерфейс, Другое — выбран по экрану, feedback/core.ts); «Что не так?»
 * (обязательно, 5–1000 символов); «Как с вами связаться (по желанию)» — пусто по умолчанию, хранится только для ответа;
 * «Отправить» → «Спасибо! Мы рассмотрим вашу ошибку в ближайшее время».
 * Что уходит (POST /api/feedback, свой домен, без cookie): раздел, текст, цитата, экран (hash-адрес латиницей) и место
 * (2:255, hadith:1751), коммит сборки (<meta name="aiustaz-commit">), язык, тема, класс устройства (phone/tablet/
 * desktop — по экрану и касанию; строка браузера не уходит). Ни IP (сервер видит только хэш для лимита), ни id статистики.
 * Не aiustaz.pro (batr.kz, тесты): отправки нет — «Отправить можно на aiustaz.pro» и ссылка на это же место там.
 * Нет связи: текст остаётся в листе, «Нет связи — попробуйте позже» (без очереди: просто и надёжно).
 * kk, uz, en — черновик для редактора-носителя.
 * testID: ошибка-лист, ошибка-закрыть, ошибка-цитата, ошибка-где, ошибка-раздел-<код>, ошибка-текст, ошибка-счёт,
 *   ошибка-контакт, ошибка-отправить, ошибка-итог (role=status), ошибка-спасибо, ошибка-не-свой, ошибка-на-сайт.
 */
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Кнопка } from '../components/Button';
import { Значок } from '../components/Icon';
import { Текст } from '../components/Text';
import { useНавигация } from '../engine/navigation';
import { вХэш } from '../engine/routes';
import { создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { видХоста } from '../install/platform';
import { ШИРИНА_КОЛОНКИ, ШРИФТ_ИНТЕРФЕЙСА, useТема } from '../theme';
import { коммитСборки } from '../update/update';
import { КАТЕГОРИИ_ОШИБОК, категорияЭкрана, местоЦели, type ЗапросСообщения, type КатегорияОшибки } from './core';

const ВЕБ = Platform.OS === 'web';
const МИН = 5;
const МАКС = 1000;
const МАКС_КОНТАКТ = 200;
const АДРЕС = '/api/feedback';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    заголовок: 'Сообщить об ошибке',
    выделено: 'Выделенный текст',
    где: 'Где: {экран}',
    раздел: 'Раздел',
    quran: 'Коран / таджвид',
    hadith: 'Хадис',
    translation: 'Перевод',
    dhikr: 'Зикр / дуа',
    prayer: 'Время намаза',
    ui: 'Интерфейс',
    other: 'Другое',
    что: 'Что не так?',
    чтоПодсказка: 'Например: здесь мадд 4 счёта, а написано 2',
    мало: 'Напишите хотя бы 5 символов',
    контакт: 'Как с вами связаться (по желанию)',
    контактПояснение:
      'Не обязательно. Оставьте телефон, почту или Telegram, только если хотите ответ. Храним только для ответа и удаляем через 3 месяца после разбора. Ответ не нужен — оставьте пустым.',
    безДанных: 'Вместе с сообщением уходят экран, версия приложения, язык и тема — без имени и IP.',
    отправить: 'Отправить',
    отправка: 'Отправляем…',
    спасибо: 'Спасибо! Мы рассмотрим вашу ошибку в ближайшее время.',
    спасибоПояснение: 'Если ошибка в религиозном тексте, исправление проверит устаз.',
    закрыть: 'Закрыть',
    нетСвязи: 'Нет связи — попробуйте позже. Текст остался здесь.',
    лимит: 'Слишком много сообщений подряд. Попробуйте через несколько минут.',
    сбой: 'Не удалось отправить. Попробуйте позже.',
    неСвой: 'Отправить сообщение можно на нашем сайте aiustaz.pro — откройте это место там.',
    наСайт: 'Открыть на aiustaz.pro',
  },
  kk: {
    заголовок: 'Қате туралы хабарлау',
    выделено: 'Белгіленген мәтін',
    где: 'Қай жерде: {экран}',
    раздел: 'Бөлім',
    quran: 'Құран / тәжуид',
    hadith: 'Хадис',
    translation: 'Аударма',
    dhikr: 'Зікір / дұға',
    prayer: 'Намаз уақыты',
    ui: 'Интерфейс',
    other: 'Басқа',
    что: 'Не дұрыс емес?',
    чтоПодсказка: 'Мысалы: мұнда мадд 4 санақ, ал 2 деп жазылған',
    мало: 'Кемінде 5 таңба жазыңыз',
    контакт: 'Сізбен қалай байланысуға болады (қаласаңыз)',
    контактПояснение:
      'Міндетті емес. Жауап алғыңыз келсе ғана телефон, пошта немесе Telegram қалдырыңыз. Тек жауап беру үшін сақтаймыз және қарап болған соң 3 айдан кейін өшіреміз. Жауап керек болмаса — бос қалдырыңыз.',
    безДанных: 'Хабарламамен бірге экран, қолданба нұсқасы, тіл және безендіру жіберіледі — атыңызсыз және IP-сіз.',
    отправить: 'Жіберу',
    отправка: 'Жіберіп жатырмыз…',
    спасибо: 'Рақмет! Қатеңізді жақын арада қарастырамыз.',
    спасибоПояснение: 'Қате діни мәтінде болса, түзетуді ұстаз тексереді.',
    закрыть: 'Жабу',
    нетСвязи: 'Байланыс жоқ — кейінірек қайталаңыз. Мәтін осында қалды.',
    лимит: 'Хабарлама тым көп. Бірнеше минуттан кейін қайталаңыз.',
    сбой: 'Жіберілмеді. Кейінірек қайталаңыз.',
    неСвой: 'Хабарламаны біздің aiustaz.pro сайтында жіберуге болады — бұл жерді сонда ашыңыз.',
    наСайт: 'aiustaz.pro сайтында ашу',
  },
  uz: {
    заголовок: 'Xato haqida xabar berish',
    выделено: 'Belgilangan matn',
    где: 'Qayerda: {экран}',
    раздел: 'Boʻlim',
    quran: 'Qurʼon / tajvid',
    hadith: 'Hadis',
    translation: 'Tarjima',
    dhikr: 'Zikr / duo',
    prayer: 'Namoz vaqti',
    ui: 'Interfeys',
    other: 'Boshqa',
    что: 'Nima notoʻgʻri?',
    чтоПодсказка: 'Masalan: bu yerda madd 4 harakat, lekin 2 deb yozilgan',
    мало: 'Kamida 5 ta belgi yozing',
    контакт: 'Siz bilan qanday bogʻlanish mumkin (ixtiyoriy)',
    контактПояснение:
      'Majburiy emas. Javob olishni istasangizgina telefon, pochta yoki Telegram qoldiring. Faqat javob uchun saqlaymiz va koʻrib chiqilgandan 3 oy keyin oʻchiramiz. Javob kerak boʻlmasa — boʻsh qoldiring.',
    безДанных: 'Xabar bilan birga ekran, ilova versiyasi, til va bezak yuboriladi — ismingiz va IP manzilingizsiz.',
    отправить: 'Yuborish',
    отправка: 'Yuborilmoqda…',
    спасибо: 'Rahmat! Xatoingizni yaqin orada koʻrib chiqamiz.',
    спасибоПояснение: 'Xato diniy matnda boʻlsa, tuzatishni ustoz tekshiradi.',
    закрыть: 'Yopish',
    нетСвязи: 'Aloqa yoʻq — keyinroq urinib koʻring. Matn shu yerda qoldi.',
    лимит: 'Juda koʻp xabar yuborildi. Bir necha daqiqadan keyin urinib koʻring.',
    сбой: 'Yuborib boʻlmadi. Keyinroq urinib koʻring.',
    неСвой: 'Xabarni bizning aiustaz.pro saytimizda yuborish mumkin — bu joyni oʻsha yerda oching.',
    наСайт: 'aiustaz.pro saytida ochish',
  },
  en: {
    заголовок: 'Report a mistake',
    выделено: 'Selected text',
    где: 'Where: {экран}',
    раздел: 'Section',
    quran: 'Quran / tajweed',
    hadith: 'Hadith',
    translation: 'Translation',
    dhikr: "Dhikr / du'a",
    prayer: 'Prayer times',
    ui: 'Interface',
    other: 'Other',
    что: 'What is wrong?',
    чтоПодсказка: 'For example: the madd here is 4 counts, but it says 2',
    мало: 'Write at least 5 characters',
    контакт: 'How to contact you (optional)',
    контактПояснение:
      'Optional. Leave a phone, email or Telegram only if you want a reply. We keep it only to reply and delete it 3 months after review. No reply needed — leave it empty.',
    безДанных: 'The screen, app version, language and theme are sent with the report — no name or IP.',
    отправить: 'Send',
    отправка: 'Sending…',
    спасибо: 'Thank you! We will review the mistake you reported shortly.',
    спасибоПояснение: 'If the mistake is in religious text, an ustaz will review the fix.',
    закрыть: 'Close',
    нетСвязи: 'No connection — try again later. Your text is still here.',
    лимит: 'Too many reports in a row. Try again in a few minutes.',
    сбой: 'Could not send. Try again later.',
    неСвой: 'Reports can be sent on our website aiustaz.pro — open this place there.',
    наСайт: 'Open on aiustaz.pro',
  },
}, 'feedback/FeedbackSheet');

type Итог = 'нетСвязи' | 'лимит' | 'сбой' | null;

/** Класс устройства — по экрану и касанию (строка браузера не читается и не уходит). */
function классУстройства(): 'phone' | 'tablet' | 'desktop' {
  try {
    const касание = window.matchMedia?.('(pointer: coarse)').matches;
    if (!касание) return 'desktop';
    return Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) < 600 ? 'phone' : 'tablet';
  } catch {
    return 'phone';
  }
}

/** Название экрана — как в заголовке вкладки («Хадис № 5 — AI Ustaz» → «Хадис № 5»); без него — адрес. */
function названиеЭкрана(запасное: string): string {
  const з = ВЕБ && typeof document !== 'undefined' ? document.title.replace(/\s+—\s+AI Ustaz$/, '').trim() : '';
  return з || запасное;
}

async function отправить(тело: object): Promise<'ок' | Exclude<Итог, null>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'нетСвязи';
  try {
    const упр = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const таймер = setTimeout(() => упр?.abort(), 15_000);
    const о = await fetch(АДРЕС, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(тело), credentials: 'omit', signal: упр?.signal });
    clearTimeout(таймер);
    if (о.ok) return 'ок';
    return о.status === 429 ? 'лимит' : 'сбой';
  } catch {
    return 'нетСвязи';
  }
}

export function ЛистСообщения({ запрос, закрыть }: { запрос: ЗапросСообщения; закрыть: () => void }) {
  const т = useСловарь(СЛОВАРЬ);
  const { язык } = useПеревод();
  const { цвет, отступ, радиус, тёмная } = useТема();
  const { текущий } = useНавигация();
  // Экран и место — на момент открытия (лист поверх экрана, экран не меняется).
  const [экран] = useState(() => вХэш(текущий));
  const [место] = useState(() => (запрос.место !== undefined ? запрос.место : местоЦели(текущий)));
  const [где] = useState(() => названиеЭкрана(экран));
  const [раздел, установитьРаздел] = useState<КатегорияОшибки>(() => категорияЭкрана(текущий.экран));
  const [текст, установитьТекст] = useState('');
  const [контакт, установитьКонтакт] = useState('');
  const [идёт, установитьИдёт] = useState(false);
  const [итог, установитьИтог] = useState<Итог>(null);
  const [готово, установитьГотово] = useState(false);
  const [тронут, установитьТронут] = useState(false);
  const свой = !ВЕБ || typeof window === 'undefined' ? false : видХоста(window.location?.hostname) === 'свой';
  const цитата = (запрос.цитата ?? '').slice(0, 500);
  const длина = текст.trim().length;
  const можно = длина >= МИН && длина <= МАКС && !идёт;

  useEffect(() => {
    if (!ВЕБ || typeof document === 'undefined') return;
    const к = (е: KeyboardEvent) => {
      if (е.key === 'Escape') закрыть();
    };
    document.addEventListener('keydown', к);
    return () => document.removeEventListener('keydown', к);
  }, [закрыть]);

  const послать = async () => {
    установитьТронут(true);
    if (!можно) return;
    установитьИдёт(true);
    установитьИтог(null);
    const о = await отправить({
      cat: раздел,
      text: текст.trim(),
      route: экран,
      ...(цитата ? { quote: цитата } : null),
      ...(место ? { ref: место } : null),
      ...(контакт.trim() ? { contact: контакт.trim().slice(0, МАКС_КОНТАКТ) } : null),
      ver: коммитСборки() ?? '',
      lang: язык,
      theme: тёмная ? 'dark' : 'light',
      dev: классУстройства(),
    });
    установитьИдёт(false);
    if (о === 'ок') установитьГотово(true);
    else установитьИтог(о);
  };

  const поле = {
    borderWidth: 1,
    borderColor: цвет.границаЭлемента,
    borderRadius: радиус.m,
    backgroundColor: цвет.поверхность,
    color: цвет.текст,
    fontFamily: ШРИФТ_ИНТЕРФЕЙСА,
    fontSize: 16,
    paddingHorizontal: отступ.m,
    paddingVertical: 10,
  } as const;

  return (
    <>
      <Pressable accessibilityLabel={т('закрыть')} onPress={закрыть} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: цвет.наложение }} {...((ВЕБ ? { tabIndex: -1 } : {}) as object)} />
      <View
        testID="ошибка-лист"
        {...((ВЕБ ? { role: 'dialog', 'aria-modal': true, 'aria-label': т('заголовок') } : {}) as object)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '6%', justifyContent: 'flex-end', alignItems: 'center' }}
      >
        <View style={{ width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, maxHeight: '100%', backgroundColor: цвет.фон, borderTopLeftRadius: радиус.l, borderTopRightRadius: радиус.l, borderWidth: 1, borderBottomWidth: 0, borderColor: цвет.граница }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingStart: отступ.l, paddingEnd: отступ.s, paddingTop: отступ.xs, borderBottomWidth: 1, borderBottomColor: цвет.граница }}>
            <Значок имя="флаг" размер={20} цвет={цвет.акцент} толщина={2} />
            <Текст вид="подзаголовок" accessibilityRole="header" уровень={2} стиль={{ flex: 1, marginStart: отступ.s }}>
              {т('заголовок')}
            </Текст>
            <Pressable accessibilityRole="button" accessibilityLabel={т('закрыть')} onPress={закрыть} testID="ошибка-закрыть" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Значок имя="закрыть" размер={22} цвет={цвет.акцент} толщина={2} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: отступ.l, gap: отступ.m, paddingBottom: ВЕБ ? ('calc(24px + env(safe-area-inset-bottom))' as unknown as number) : 24 }}>
            {готово ? (
              <View style={{ gap: отступ.m, alignItems: 'center', paddingVertical: отступ.l }} testID="ошибка-спасибо" {...((ВЕБ ? { role: 'status' } : {}) as object)}>
                <Значок имя="галочка" размер={40} цвет={цвет.успех} толщина={2} />
                <Текст вид="подзаголовок" стиль={{ textAlign: 'center' }}>
                  {т('спасибо')}
                </Текст>
                <Текст вид="второй" стиль={{ textAlign: 'center' }}>
                  {т('спасибоПояснение')}
                </Текст>
                <Кнопка надпись={т('закрыть')} вид="вторичная" приНажатии={закрыть} testID="ошибка-готово-закрыть" />
              </View>
            ) : (
              <>
                {цитата ? (
                  <View style={{ gap: отступ.xs }}>
                    <Текст вид="мелкий">{т('выделено')}</Текст>
                    <View style={{ borderStartWidth: 3, borderStartColor: цвет.акцент, backgroundColor: цвет.поверхностьАкцент, borderRadius: радиус.s, paddingHorizontal: отступ.m, paddingVertical: отступ.s }}>
                      <Текст numberOfLines={6} testID="ошибка-цитата" {...((ВЕБ ? { dir: 'auto' } : {}) as object)}>
                        {цитата}
                      </Текст>
                    </View>
                  </View>
                ) : null}
                <Текст вид="мелкий" testID="ошибка-где">
                  {т('где', { экран: где })}
                </Текст>
                {!свой ? (
                  <View style={{ gap: отступ.s }} testID="ошибка-не-свой">
                    <Текст>{т('неСвой')}</Текст>
                    <Кнопка
                      надпись={т('наСайт')}
                      значок="внешняя"
                      приНажатии={() => void Linking.openURL('https://aiustaz.pro/aiustaz/' + экран)}
                      testID="ошибка-на-сайт"
                    />
                  </View>
                ) : (
                  <>
                    <View style={{ gap: отступ.xs }}>
                      <Текст вид="мелкий" стиль={{ fontWeight: '600' }}>
                        {т('раздел')}
                      </Текст>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.xs }} {...((ВЕБ ? { role: 'radiogroup', 'aria-label': т('раздел') } : {}) as object)}>
                        {КАТЕГОРИИ_ОШИБОК.map((к) => {
                          const выбран = к === раздел;
                          return (
                            <Pressable
                              key={к}
                              {...((ВЕБ ? { role: 'radio', 'aria-checked': выбран } : { accessibilityRole: 'radio', accessibilityState: { checked: выбран } }) as object)}
                              onPress={() => установитьРаздел(к)}
                              testID={'ошибка-раздел-' + к}
                              style={{ minHeight: 40, paddingHorizontal: отступ.m, borderRadius: 20, borderWidth: 1, justifyContent: 'center', borderColor: выбран ? цвет.акцент : цвет.границаЭлемента, backgroundColor: выбран ? цвет.акцентМягкий : цвет.поверхность }}
                            >
                              <Текст вид="мелкий" цвет={выбран ? цвет.акцент : цвет.текст} стиль={выбран ? { fontWeight: '600' } : undefined}>
                                {т(к)}
                              </Текст>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={{ gap: отступ.xs }}>
                      <Текст вид="мелкий" стиль={{ fontWeight: '600' }}>
                        {т('что')}
                      </Текст>
                      <TextInput
                        value={текст}
                        onChangeText={(с) => установитьТекст(с.slice(0, МАКС))}
                        multiline
                        numberOfLines={4}
                        maxLength={МАКС}
                        placeholder={т('чтоПодсказка')}
                        placeholderTextColor={цвет.текстВторой}
                        accessibilityLabel={т('что')}
                        testID="ошибка-текст"
                        style={{ ...поле, minHeight: 104, textAlignVertical: 'top', ...(ВЕБ ? ({ outlineColor: цвет.фокус } as object) : null) }}
                      />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: отступ.s }}>
                        <Текст вид="мелкий" цвет={тронут && длина < МИН ? цвет.внимание : цвет.текстВторой}>
                          {тронут && длина < МИН ? т('мало') : ' '}
                        </Текст>
                        <Текст вид="мелкий" табличные testID="ошибка-счёт">
                          {`${текст.length} / ${МАКС}`}
                        </Текст>
                      </View>
                    </View>
                    <View style={{ gap: отступ.xs }}>
                      <Текст вид="мелкий" стиль={{ fontWeight: '600' }}>
                        {т('контакт')}
                      </Текст>
                      <TextInput
                        value={контакт}
                        onChangeText={(с) => установитьКонтакт(с.slice(0, МАКС_КОНТАКТ))}
                        maxLength={МАКС_КОНТАКТ}
                        accessibilityLabel={т('контакт')}
                        autoComplete="off"
                        autoCorrect={false}
                        testID="ошибка-контакт"
                        style={{ ...поле, minHeight: 48, ...(ВЕБ ? ({ outlineColor: цвет.фокус } as object) : null) }}
                      />
                      <Текст вид="мелкий">{т('контактПояснение')}</Текст>
                    </View>
                    <Текст вид="мелкий">{т('безДанных')}</Текст>
                    {итог ? (
                      <Текст цвет={цвет.внимание} testID="ошибка-итог" {...((ВЕБ ? { role: 'status' } : {}) as object)}>
                        {т(итог)}
                      </Текст>
                    ) : null}
                    <Кнопка надпись={идёт ? т('отправка') : т('отправить')} отключена={идёт || (тронут && !можно)} приНажатии={() => void послать()} testID="ошибка-отправить" />
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </>
  );
}
