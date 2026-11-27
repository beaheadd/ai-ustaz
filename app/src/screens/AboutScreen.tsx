/**
 * О проекте: что такое AI Ustaz; бесплатно, ради Аллаха (финансирует бизнес владельца), без рекламы,
 * трекинга и продажи данных; помощник, а не замена устаза — без иджазы и фетв; линия ДУМК
 * (ханафитский мазхаб, матуридитская акыда), чтение Хафс от ‘Асыма; ИИ-предупреждение QML
 * (всегда доступно здесь — правило 12); приватность прототипа; версия уроков; обратная связь;
 * удаление локального прогресса; ссылка на лицензии.
 *
 * Контракт: ПропсыЭкрана<'оПроекте'>.
 * Вид (дизайн-система 19.11.2026): шапка-«герой» с эмблемой AI Ustaz (фонарь-шырақ, без лица) и тремя
 * обещаниями; разделы — карточки со значком; настройки «Язык и тема»; ссылки — строки списка.
 * «Это прототип» и «Что уже есть и что будет» — здесь (перенесены с главной 19.11.2026: на главной — одна строка
 * «Это прототип: что есть и что будет ›»).
 * testID: экран-о-проекте, о-проекте-шапка, о-проекте-прототип, о-проекте-что-будет, о-проекте-бесплатно,
 *         о-проекте-приватность, о-проекте-оформление,
 *         версия-контента, предупреждение-ии, удалить-прогресс, о-проекте-лицензии, о-проекте-как.
 * Обязательная строка: казахские тексты — черновик для редактора-носителя ('оПроекте.казахский').
 * Обратная связь — пока лично через владельца: без форм, почты в коде и сбора данных.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import версияКонтента from '@content/version.json';
import {
  Карточка,
  Кнопка,
  ОрнаментПолоса,
  Плашка,
  ПереключательТемы,
  ПереключательЯзыка,
  СтрокаСписка,
  Текст,
  Значок,
  ЭмблемаУстаза,
  Экран,
  type ВидКарточки,
  type ИмяЗначка,
} from '../components';
import { ПредупреждениеИИИзКонтента, Пункты, ЧтоЕстьЧтоБудет } from '../components/info';
import type { ВерсияКонтента, СтатусКонтента } from '../content/types';
import { useНавигация } from '../engine/navigation';
import { useПрогресс } from '../engine/progress';
import type { ПропсыЭкрана } from '../engine/routes';
import { создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { useТема } from '../theme';

const ВЕРСИЯ = версияКонтента as ВерсияКонтента;

const СЛОВАРЬ = создатьСловарь({
  ru: {
    девиз: 'ИИ-наставник по правильному чтению Корана',
    обещание1: 'Бесплатно',
    обещание2: 'Без рекламы',
    обещание3: 'Данные — у вас',
    оформление: 'Язык и тема',
    плашкаЧерновик: 'Черновик — проверяет устаз',
    оформлениеПояснение: 'Настройки хранятся только на этом устройстве.',
    чтоЭто: 'Что такое AI Ustaz',
    чтоЭтоТекст:
      'Бесплатный ИИ-наставник по правильному чтению Корана. Начинаем с первой буквы по методике Ахмадхади Максуди: буквы → слоги → слова → суры. Дальше — тренер таджвида с проверкой голоса и «Слушатель» для тех, кто учит Коран наизусть.',
    бесплатно: 'Бесплатно, ради Аллаха',
    бесплатно1: 'Без подписок, платных функций и покупок.',
    бесплатно2: 'Проект полностью финансирует бизнес владельца.',
    бесплатно3: 'Без рекламы и рекламного трекинга, без аналитики.',
    бесплатно4: 'Данные пользователей не продаются и не передаются третьим лицам.',
    помощник: 'Помощник, а не устаз',
    помощник1: 'AI Ustaz помогает между занятиями и не заменяет живого устаза: Коран передаётся устно, от учителя к ученику.',
    помощник2: 'Не выдаёт иджазу, статус хафиза или «засчитанный хатм».',
    помощник3: 'Не выносит фетв. Личные вопросы фикха — к имаму мечети или в ДУМК.',
    линия: 'Линия',
    линия1: 'Ханафитский мазхаб и матуридитская акыда — линия ДУМК.',
    линия2: 'Чтение — Хафс от ‘Асыма (через аш-Шатибийю). Когда появится проверка голосом, допустимые варианты чтения будут засчитываться.',
    линия3: 'Текст Корана — только дословно из проверенной базы Tanzil Uthmani v1.1.',
    линия4: 'Объяснения ошибок — только из базы правил и шаблонов AI Ustaz (сейчас черновик, её проверяет устаз). Не уверен — не ругаем.',
    приватность: 'Приватность',
    приватность1: 'Входа нет. На aiustaz.pro приложение отправляет только на свой сервер в Казахстане: анонимную статистику (какие экраны открывали и сколько времени — без имени, телефона и места; выключается в «Ещё») и, если вы включили уведомления, подписку без координат. Данные никому не передаём и не продаём.',
    приватность2: 'Запись голоса — только по вашему нажатию; она живёт в памяти страницы, никуда не отправляется и удаляется, когда вы уходите с упражнения.',
    приватность3: 'На этом устройстве хранятся только номера пройденных уроков, результаты, даты занятий и язык.',
    приватность4:
      'Разрешение на микрофон браузер даёт всему сайту batr.kz, а не только AI Ustaz. После занятия его можно отключить в настройках сайта (значок замка в адресной строке).',
    черновик: 'Уроки — черновик',
    черновикТекст: 'Все уроки и объяснения — черновик: их проверяет устаз. До проверки на экранах уроков стоит плашка «Прототип. Черновик урока».',
    связь: 'Обратная связь',
    связьТекст: 'Пока — лично через владельца проекта, который поделился с вами ссылкой. Форм и сбора данных в приложении нет.',
    данные: 'Ваши данные на этом устройстве',
    'статус.черновик': 'черновик',
    'статус.проверен-устазом': 'проверено устазом',
    'статус.подписан-советом': 'подписано советом',
    как: 'Как AI Ustaz объясняет ошибку',
    лицензии: 'Лицензии и источники',
  },
  kk: {
    девиз: 'Құранды дұрыс оқуға үйрететін ЖИ-тәлімгер',
    обещание1: 'Тегін',
    обещание2: 'Жарнамасыз',
    обещание3: 'Деректер — сізде',
    оформление: 'Тіл және тақырып',
    плашкаЧерновик: 'Жоба — ұстаз тексеріп жатыр',
    оформлениеПояснение: 'Баптаулар тек осы құрылғыда сақталады.',
    чтоЭто: 'AI Ustaz деген не',
    чтоЭтоТекст:
      'Құранды дұрыс оқуға үйрететін тегін ЖИ-тәлімгер. Ахмадхади Мақсұди әдістемесі бойынша алғашқы әріптен бастаймыз: әріптер → буындар → сөздер → сүрелер. Кейін — дауысты тексеретін тәжуид жаттықтырушысы және Құранды жатқа үйренетіндерге арналған «Тыңдаушы».',
    бесплатно: 'Тегін, Алла разылығы үшін',
    бесплатно1: 'Жазылымсыз, ақылы функцияларсыз және сатып алуларсыз.',
    бесплатно2: 'Жобаны толығымен иесінің бизнесі қаржыландырады.',
    бесплатно3: 'Жарнамасыз, жарнамалық бақылаусыз, аналитикасыз.',
    бесплатно4: 'Пайдаланушылардың деректері сатылмайды және үшінші тұлғаларға берілмейді.',
    помощник: 'Көмекші, ұстаз емес',
    помощник1: 'AI Ustaz сабақ арасында көмектеседі, тірі ұстаздың орнын баспайды: Құран ұстаздан шәкіртке ауызша беріледі.',
    помощник2: 'Ижаза, хафиз мәртебесін немесе «есептелген хатым» бермейді.',
    помощник3: 'Пәтуа бермейді. Жеке фиқһ сұрақтары — мешіт имамына немесе ҚМДБ-ға.',
    линия: 'Бағыт',
    линия1: 'Ханафи мазхабы және матуриди ақидасы — ҚМДБ бағыты.',
    линия2: 'Оқу — Хафс ‘Асым риуаяты (аш-Шатиби жолымен). Дауыс тексеруі пайда болғанда, рұқсат етілген оқу нұсқалары есептеледі.',
    линия3: 'Құран мәтіні — тек тексерілген Tanzil Uthmani v1.1 базасынан, сөзбе-сөз.',
    линия4: 'Қателердің түсіндірмесі — тек AI Ustaz ережелері мен үлгілерінің базасынан (әзірге жоба, оны ұстаз тексереді). Сенімді болмасақ — ұрыспаймыз.',
    приватность: 'Прототиптің құпиялылығы',
    приватность1: 'Кіру жоқ. aiustaz.pro-да қолданба тек Қазақстандағы өз серверіне жібереді: жасырын статистика (қай беттер ашылды және қанша уақыт — атыңызсыз, телефонсыз және орынсыз; «Тағы» бөлімінде өшіріледі) және хабарландыруды қоссаңыз — координатсыз жазылым. Деректерді ешкімге бермейміз және сатпаймыз.',
    приватность2: 'Дауыс тек сіз басқанда жазылады; жазба бет жадында ғана тұрады, ешқайда жіберілмейді және жаттығудан шыққанда өшіріледі.',
    приватность3: 'Бұл құрылғыда тек өтілген сабақтардың нөмірлері, нәтижелер, сабақ күндері және тіл сақталады.',
    приватность4:
      'Браузер микрофонға рұқсатты AI Ustaz-қа ғана емес, бүкіл batr.kz сайтына береді. Сабақтан кейін оны сайт баптауларынан өшіруге болады (мекенжай жолындағы құлып белгісі).',
    черновик: 'Сабақтар — жоба',
    черновикТекст: 'Барлық сабақ пен түсіндірме — жоба: оларды ұстаз тексереді. Тексерілгенге дейін сабақ беттерінде «Прототип. Сабақтың жобасы» белгісі тұрады.',
    связь: 'Кері байланыс',
    связьТекст: 'Әзірге — сізге сілтеме берген жоба иесі арқылы, жеке. Қосымшада формалар мен деректер жинау жоқ.',
    данные: 'Осы құрылғыдағы деректеріңіз',
    'статус.черновик': 'жоба',
    'статус.проверен-устазом': 'ұстаз тексерген',
    'статус.подписан-советом': 'кеңес бекіткен',
    как: 'AI Ustaz қатені қалай түсіндіреді',
    лицензии: 'Лицензиялар мен дереккөздер',
  },
  uz: {
    девиз: 'Qurʼonni toʻgʻri oʻqish boʻyicha SI-murabbiy',
    обещание1: 'Bepul',
    обещание2: 'Reklamasiz',
    обещание3: 'Maʼlumotlar — sizda',
    оформление: 'Til va mavzu',
    плашкаЧерновик: 'Qoralama — ustoz tekshiryapti',
    оформлениеПояснение: 'Sozlamalar faqat shu qurilmada saqlanadi.',
    чтоЭто: 'AI Ustaz nima',
    чтоЭтоТекст:
      'Qurʼonni toʻgʻri oʻqish boʻyicha bepul SI-murabbiy. Ahmadhodiy Maqsudiy uslubi boʻyicha birinchi harfdan boshlaymiz: harflar → boʻgʻinlar → soʻzlar → suralar. Keyin — ovozni tekshiradigan tajvid murabbiyi va Qurʼonni yod olayotganlar uchun «Tinglovchi».',
    бесплатно: 'Bepul, Alloh roziligi uchun',
    бесплатно1: 'Obunalar, pullik funksiyalar va xaridlarsiz.',
    бесплатно2: 'Loyihani toʻliq egasining biznesi moliyalashtiradi.',
    бесплатно3: 'Reklama va reklama kuzatuvisiz, analitikasiz.',
    бесплатно4: 'Foydalanuvchilar maʼlumotlari sotilmaydi va uchinchi shaxslarga berilmaydi.',
    помощник: 'Ustoz emas, yordamchi',
    помощник1: 'AI Ustaz mashgʻulotlar orasida yordam beradi va tirik ustozning oʻrnini bosmaydi: Qurʼon ogʻzaki, ustozdan shogirdga oʻtadi.',
    помощник2: 'Ijoza, hofizlik maqomi yoki «hisobga olingan xatm» bermaydi.',
    помощник3: 'Fatvo chiqarmaydi. Shaxsiy fiqh savollari — masjid imomiga yoki QMDBga.',
    линия: 'Yoʻnalish',
    линия1: 'Hanafiy mazhabi va moturidiy aqidasi — QMDB yoʻnalishi.',
    линия2: 'Qiroat — Osimdan Hafs rivoyati (ash-Shotibiya orqali). Ovoz bilan tekshirish paydo boʻlganda, joiz qiroat variantlari hisobga olinadi.',
    линия3: 'Qurʼon matni — faqat tekshirilgan Tanzil Uthmani v1.1 bazasidan, aynan.',
    линия4: 'Xatolarni tushuntirish — faqat AI Ustaz qoidalar va andozalar bazasidan (hozir qoralama, uni ustoz tekshiryapti). Ishonch boʻlmasa — tanbeh bermaymiz.',
    приватность: 'Prototip maxfiyligi',
    приватность1: 'Kirish yoʻq. aiustaz.pro saytida ilova faqat Qozogʻistondagi oʻz serveriga yuboradi: anonim statistika (qaysi sahifalar ochilgani va qancha vaqt — ismingiz, telefoningiz va joyingizsiz; «Yana» boʻlimida oʻchiriladi) va bildirishnomalarni yoqsangiz — koordinatalarsiz obuna. Maʼlumotlarni hech kimga bermaymiz va sotmaymiz.',
    приватность2: 'Ovoz yozuvi — faqat siz bosganingizda; u sahifa xotirasida turadi, hech qayerga yuborilmaydi va mashqdan chiqqaningizda oʻchiriladi.',
    приватность3: 'Bu qurilmada faqat oʻtilgan darslar raqamlari, natijalar, mashgʻulot sanalari va til saqlanadi.',
    приватность4:
      'Mikrofonga ruxsatni brauzer faqat AI Ustazga emas, butun batr.kz saytiga beradi. Mashgʻulotdan keyin uni sayt sozlamalarida oʻchirib qoʻyish mumkin (manzil satridagi qulf belgisi).',
    черновик: 'Darslar — qoralama',
    черновикТекст: 'Barcha darslar va tushuntirishlar — qoralama: ularni ustoz tekshiryapti. Tekshiruvgacha dars ekranlarida «Prototip. Dars qoralamasi» yozuvi turadi.',
    связь: 'Fikr-mulohaza',
    связьТекст: 'Hozircha — sizga havolani ulashgan loyiha egasi orqali shaxsan. Ilovada shakllar va maʼlumot yigʻish yoʻq.',
    данные: 'Shu qurilmadagi maʼlumotlaringiz',
    'статус.черновик': 'qoralama',
    'статус.проверен-устазом': 'ustoz tekshirgan',
    'статус.подписан-советом': 'kengash imzolagan',
    как: 'AI Ustaz xatoni qanday tushuntiradi',
    лицензии: 'Litsenziyalar va manbalar',
  },
  en: {
    девиз: 'An AI mentor for correct Quran reading',
    обещание1: 'Free',
    обещание2: 'No ads',
    обещание3: 'Your data stays with you',
    оформление: 'Language and theme',
    плашкаЧерновик: 'Draft — under review by an ustaz',
    оформлениеПояснение: 'Settings are stored only on this device.',
    чтоЭто: 'What AI Ustaz is',
    чтоЭтоТекст:
      'A free AI mentor for correct Quran reading. We start from the first letter using the method of Ahmadhadi Maksudi: letters → syllables → words → surahs. Next — a tajweed trainer with voice check and a “Listener” for those memorising the Quran.',
    бесплатно: 'Free, for the sake of Allah',
    бесплатно1: 'No subscriptions, paid features or purchases.',
    бесплатно2: "The project is fully funded by the owner's business.",
    бесплатно3: 'No ads and no ad tracking, no analytics.',
    бесплатно4: 'User data is not sold and not shared with third parties.',
    помощник: 'A helper, not an ustaz',
    помощник1: 'AI Ustaz helps between classes and does not replace a living ustaz: the Quran is passed on orally, from teacher to student.',
    помощник2: 'It does not grant ijazah, hafiz status or a “completed khatm”.',
    помощник3: "It does not issue fatwas. Personal fiqh questions — to your mosque's imam or the SAMK.",
    линия: 'Approach',
    линия1: "The Hanafi madhhab and Maturidi aqidah — the approach of the SAMK (Spiritual Administration of Muslims of Kazakhstan).",
    линия2: "Recitation — Hafs from 'Asim (via ash-Shatibiyyah). When the voice check arrives, acceptable recitation variants will be counted as correct.",
    линия3: 'Quran text — only verbatim from the verified Tanzil Uthmani v1.1 database.',
    линия4: 'Explanations of mistakes — only from the AI Ustaz base of rules and templates (a draft for now, an ustaz is reviewing it). Not sure — no scolding.',
    приватность: 'Prototype privacy',
    приватность1: 'No sign-in. On aiustaz.pro the app sends only to its own server in Kazakhstan: anonymous statistics (which screens were opened and for how long — no name, phone or location; can be turned off in "More") and, if you turned on notifications, a subscription without coordinates. We never share or sell data.',
    приватность2: 'Voice is recorded only when you tap; the recording lives in page memory, is not sent anywhere and is deleted when you leave the exercise.',
    приватность3: 'This device stores only the numbers of completed lessons, results, study dates and the language.',
    приватность4:
      'The browser gives microphone permission to the whole batr.kz site, not just AI Ustaz. After the lesson you can turn it off in the site settings (the lock icon in the address bar).',
    черновик: 'Lessons are a draft',
    черновикТекст: 'All lessons and explanations are a draft: an ustaz is reviewing them. Until the review, lesson screens show the “Prototype. Draft lesson” banner.',
    связь: 'Feedback',
    связьТекст: 'For now — personally through the project owner who shared the link with you. The app has no forms and collects no data.',
    данные: 'Your data on this device',
    'статус.черновик': 'draft',
    'статус.проверен-устазом': 'reviewed by an ustaz',
    'статус.подписан-советом': 'signed off by the council',
    как: 'How AI Ustaz explains a mistake',
    лицензии: 'Licenses and sources',
  },
});

/** Раздел «О проекте»: карточка с заголовком и значком в изумрудной плитке. */
function Раздел({ значок, заголовок, вид, testID, children }: { значок?: ИмяЗначка; заголовок: string; вид?: ВидКарточки; testID?: string; children?: ReactNode }) {
  const { цвет, отступ, радиус } = useТема();
  return (
    <Карточка вид={вид} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.m }}>
        {значок ? (
          <View
            style={{ width: 36, height: 36, borderRadius: радиус.m, alignItems: 'center', justifyContent: 'center', backgroundColor: вид === 'акцент' ? цвет.поверхность : цвет.поверхностьАкцент }}
          >
            <Значок имя={значок} размер={20} цвет={цвет.акцент} />
          </View>
        ) : null}
        <Текст вид="подзаголовок" accessibilityRole="header" стиль={{ flex: 1 }}>
          {заголовок}
        </Текст>
      </View>
      {children}
    </Карточка>
  );
}

export function ОПроекте(_: ПропсыЭкрана<'оПроекте'>) {
  const { t } = useПеревод();
  const т = useСловарь(СЛОВАРЬ);
  const { перейти } = useНавигация();
  const { сбросить } = useПрогресс();
  const { отступ, цвет } = useТема();
  const [удалено, установитьУдалено] = useState(false);
  const статус = т(`статус.${ВЕРСИЯ.статус as СтатусКонтента}`);

  return (
    <Экран заголовок={t('экран.оПроекте')} testID="экран-о-проекте">
      <Карточка вид="герой" testID="о-проекте-шапка">
        <View style={{ alignItems: 'center', gap: отступ.s }}>
          <ЭмблемаУстаза размер={120} вариант="полный" />
          <Текст вид="заголовок" стиль={{ textAlign: 'center' }}>
            AI Ustaz
          </Текст>
          <Текст стиль={{ textAlign: 'center' }} цвет={цвет.геройВторой}>
            {т('девиз')}
          </Текст>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: отступ.xs, paddingTop: отступ.xs }}>
            <Плашка вид="инфо" значок="галочка" надпись={т('обещание1')} />
            <Плашка вид="инфо" значок="галочка" надпись={т('обещание2')} />
            <Плашка вид="инфо" значок="замок" надпись={т('обещание3')} />
          </View>
        </View>
      </Карточка>

      <Раздел значок="инфо" заголовок={т('чтоЭто')}>
        <Текст>{т('чтоЭтоТекст')}</Текст>
      </Раздел>

      <Карточка вид="песок" заголовок={t('главная.прототип.заголовок')} testID="о-проекте-прототип">
        <Текст>{t('главная.прототип.вступление')}</Текст>
        <Пункты
          пункты={[
            t('главная.прототип.голос'),
            t('главная.прототип.кари'),
            t('главная.прототип.черновик'),
            t('главная.прототип.данные'),
            t('главная.прототип.бесплатно'),
          ]}
        />
      </Карточка>

      <ЧтоЕстьЧтоБудет testID="о-проекте-что-будет" />

      <Раздел значок="галочка" вид="акцент" заголовок={т('бесплатно')} testID="о-проекте-бесплатно">
        <Пункты пункты={[т('бесплатно1'), т('бесплатно2'), т('бесплатно3'), т('бесплатно4')]} />
      </Раздел>

      <Раздел значок="урок" заголовок={т('помощник')}>
        <Пункты пункты={[т('помощник1'), т('помощник2'), т('помощник3')]} />
      </Раздел>

      <ПредупреждениеИИИзКонтента />

      <Раздел значок="коран" заголовок={т('линия')}>
        <Пункты пункты={[т('линия1'), т('линия2'), т('линия3'), т('линия4')]} />
      </Раздел>

      <Раздел значок="замок" заголовок={т('приватность')} testID="о-проекте-приватность">
        <Пункты пункты={[т('приватность1'), т('приватность2'), т('приватность3'), т('приватность4')]} />
      </Раздел>

      <Раздел вид="песок" заголовок={т('черновик')}>
        <Плашка вид="черновик" значок="урок" надпись={ВЕРСИЯ.статус === 'черновик' ? т('плашкаЧерновик') : статус} />
        <Текст>{т('черновикТекст')}</Текст>
        <Текст testID="версия-контента">{t('оПроекте.версияКонтента', { версия: ВЕРСИЯ.версия, статус })}</Текст>
        <Текст>{t('оПроекте.казахский')}</Текст>
      </Раздел>

      <Раздел значок="тема" заголовок={т('оформление')} testID="о-проекте-оформление">
        <ПереключательЯзыка />
        <ПереключательТемы />
        <Текст вид="мелкий">{т('оформлениеПояснение')}</Текст>
      </Раздел>

      <Раздел заголовок={т('связь')}>
        <Текст>{т('связьТекст')}</Текст>
      </Раздел>

      <Раздел заголовок={т('данные')}>
        <Кнопка
          надпись={t('оПроекте.удалитьДанные')}
          вид="вторичная"
          значок="удалить"
          приНажатии={() => {
            сбросить();
            установитьУдалено(true);
          }}
          testID="удалить-прогресс"
        />
        {удалено ? (
          <Текст вид="второй" accessibilityLiveRegion="polite">
            {t('оПроекте.данныеУдалены')}
          </Текст>
        ) : null}
      </Раздел>

      <ОрнаментПолоса />

      <View style={{ gap: отступ.s }}>
        <СтрокаСписка заголовок={т('как')} значок="нукта" приНажатии={() => перейти('какОбъясняем')} testID="о-проекте-как" />
        <СтрокаСписка заголовок={т('лицензии')} значок="инфо" приНажатии={() => перейти('лицензии')} testID="о-проекте-лицензии" />
      </View>
    </Экран>
  );
}
