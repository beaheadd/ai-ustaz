"""Английский для данных контента: русская строка → английская. Читает tools/build_content.py.

ЧЕРНОВИК для редактора-носителя (CLAUDE.md: переводы — черновик, религиозный контент проверяет устаз; пока не
проверено — на экране плашка «черновик», статус уроков «черновик»). Решение владельца 20.11.2026: «Потом нам нужен
ещё английский язык… Казахский, русский, узбекский, английский. 4 языка должно быть для старта». Переведено с
русского по смыслу, без добавлений (по образцу tools/content_uz.py).

Термины — принятая английская транслитерация: fatha, kasra, damma, sukun, shaddah, tanween, madd, hamza, ghunnah,
qalqalah, ustaz, qari, mushaf, surah, ayah; кавычки — “…”, апостроф — ASCII ' (tabi'i). Учебные звуки — латиницей
(«a», «i», «u», долгие «ā», «ī», «ū»); единица длительности мадда — «count». Названия букв — как в
app/src/speech/hints.ts НАЗВАНИЯ_БУКВ.en (точка снизу различает ṣ ṭ ḍ ẓ ḥ; ʿ — ‘айн U+02BF, ʾ — хамза U+02BE).
Сравнения с русскими и казахскими звуками каталога §8 («глубже русского «к»», «опора — казахское «қ»») переведены
дословно — для англоязычных читателей опору стоит пересмотреть с редактором и устазом.
ИИ-предупреждение QML — ОФИЦИАЛЬНЫЙ английский текст файла NOTICE модели quran-muaalem (прочитан 20.11.2026; он же
— в docs/программа-курса.md §5.1), не наш перевод.
Арабский текст в строках — ровно тот же, что в русских (не набирается заново; текст Корана здесь не хранится:
слово примера §13 подставляет сборщик из копии Tanzil для показа — {W}, ступени лестницы — {L}).

Контракт: ПЕРЕВОД[ru] → en; ПРИМЕРЫ[id] → (русский текст-источник, шаблон en с {W} и {L}).
Новая русская строка в build_content.py без перевода здесь — сборка падает со списком строк.
"""

ПЕРЕВОД = {
    # ── огласовки и знаки (harakat.json) ──
    'фатха': 'fatha',
    '«а»': '“a”',
    'Короткая косая черта над буквой. Звук «а».': 'A short slanted stroke above the letter. The sound “a”.',
    'кясра': 'kasra',
    '«и»': '“i”',
    'Короткая косая черта под буквой. Звук «и».': 'A short slanted stroke below the letter. The sound “i”.',
    'дамма': 'damma',
    '«у»': '“u”',
    'Маленькая петелька над буквой, похожая на маленькую و. Звук «у».':
        'A small loop above the letter, like a small و. The sound “u”.',
    'сукун': 'sukun',
    'нет гласного': 'no vowel',
    'Маленький кружок над буквой. Слог закрыт: после буквы гласного нет.':
        'A small circle above the letter. The syllable is closed: there is no vowel after the letter.',
    'шадда': 'shaddah',
    'буква дважды': 'letter doubled',
    'Буква звучит дважды: шадда = сукун + огласовка (رَبَّ = رَبْبَ). Задержите букву, как «сс» в русском «касса».':
        'The letter sounds twice: shaddah = sukun + vowel mark (رَبَّ = رَبْبَ). Hold the letter, like “ss” in the Russian word “kassa”.',
    'танвин с фатхой': 'tanween with fatha',
    '«ан»': '“an”',
    'Две фатхи: в конце слова читается «ан» — фатха + нун с сукуном (ـً = ـَنْ).':
        'Two fathas: at the end of a word it is read “an” — fatha + nun with sukun (ـً = ـَنْ).',
    'танвин с кясрой': 'tanween with kasra',
    '«ин»': '“in”',
    'Две кясры: в конце слова читается «ин» — кясра + нун с сукуном.':
        'Two kasras: at the end of a word it is read “in” — kasra + nun with sukun.',
    'танвин с даммой': 'tanween with damma',
    '«ун»': '“un”',
    'Две даммы: в конце слова читается «ун» — дамма + нун с сукуном.':
        'Two dammas: at the end of a word it is read “un” — damma + nun with sukun.',
    'мадд через алиф': 'madd with alif',
    '«а̄» — 2 счёта': '“ā” — 2 counts',
    'Алиф после фатхи тянет «а» на 2 счёта. Долгий гласный — как два ваших коротких подряд, без разрыва.':
        'Alif after a fatha lengthens “a” to 2 counts. A long vowel is like two of your short ones in a row, without a break.',
    'мадд через вав': 'madd with waw',
    '«ӯ» — 2 счёта': '“ū” — 2 counts',
    'Вав после даммы тянет «у» на 2 счёта.': 'Waw after a damma lengthens “u” to 2 counts.',
    'мадд через йа': 'madd with ya',
    '«ӣ» — 2 счёта': '“ī” — 2 counts',
    'Йа после кясры тянет «и» на 2 счёта.': 'Ya after a kasra lengthens “i” to 2 counts.',
    'Казахский термин не утверждён (программа курса §16, вопрос 9): арабские названия или тюркские из старых букварей.':
        'The Kazakh term is not approved yet (course programme §16, question 9): Arabic names or the Turkic ones from old primers.',
    # ── варианты и подсказки заданий ──
    'фатха («а»)': 'fatha (“a”)',
    'кясра («и»)': 'kasra (“i”)',
    'дамма («у»)': 'damma (“u”)',
    'сукун (нет гласного)': 'sukun (no vowel)',
    'Прочитайте вслух. Не уверены — откройте подсказку под слогом.':
        'Read aloud. Not sure — open the hint under the syllable.',
    'Прочитайте пары. Слова различаются одной буквой.': 'Read the pairs. The words differ by one letter.',
    'Прочитайте вслух и запишите себя, затем послушайте запись.':
        'Read aloud and record yourself, then listen to the recording.',
    'Лестница: читайте по ступеням — от слога к слову. Запишите каждую ступень.':
        'Ladder: read step by step — from the syllable to the word. Record each step.',
    # ── уровни курса ──
    'Вход': 'Introduction',
    'Буквы, огласовки, сукун': 'Letters, vowel marks, sukun',
    'Долгота, удвоение, танвин, хамза, мост к мусхафу':
        'Length, doubling, tanween, hamza, bridge to the mushaf',
    'Аль-Фатиха и суры намаза: базовый таджвид': 'Al-Fatiha and the surahs of prayer: basic tajweed',
    'Чтение мусхафа и углублённый таджвид': 'Reading the mushaf and advanced tajweed',
    # ── пример разбора аль-Фатихи ──
    'Ошибка': 'Mistake',
    'Проверьте себя': 'Check yourself',
    'Сравните': 'Compare',
    'Это важно: от этой буквы зависит смысл слова.':
        'This matters: the meaning of the word depends on this letter.',
    'Гладкий выдох из середины горла, без хрипа — как будто дышите на стекло очков.':
        'A smooth breath from the middle of the throat, without rasping — as if you were breathing on your glasses.',
    'Без буквы ‘айн (ع) слово меняется.': 'Without the letter ʿayn (ع) the word changes.',
    'Звонкий звук из середины горла: горло сжимается, и «а» выходит с усилием.':
        'A voiced sound from the middle of the throat: the throat tightens and the “a” comes out with effort.',
    'Мадд табии: «мā» тянется на 2 счёта.': "Madd tabi'i: “mā” is lengthened to 2 counts.",
    'Тяните на 2 счёта, как два ваших коротких гласных подряд.':
        'Lengthen it to 2 counts, like two of your short vowels in a row.',
    'Короткое «малики» — законное чтение других риваятов, поэтому «другое слово» здесь не говорим. В чтении Хафс здесь долгий слог.':
        'The short “maliki” is a valid reading of other riwayahs, so we do not say “a different word” here. In the Hafs reading the syllable here is long.',
    '‘Айн — не пауза в горле, а звонкий звук.': 'ʿAyn is not a pause in the throat but a voiced sound.',
    'Послушайте кари и сравните со своей записью. Голос кари появится после записи эталона.':
        'Listen to the qari and compare with your recording. The qari voice will appear once the reference recording is made.',
    'Без буквы һа (ه) слово меняется.': 'Without the letter ha (ه) the word changes.',
    'Лёгкий выдох из глубины горла; после него сразу «ди».':
        'A light breath from deep in the throat; right after it, “di”.',
    'От огласовки здесь зависит смысл: меняется лицо — «Ты» превращается в «я».':
        'The meaning depends on the vowel mark here: the person changes — “You” turns into “I”.',
    'На букве та (ت) — фатха: «-та».': 'On the letter ta (ت) there is a fatha: “-ta”.',
    'Перевод смысла в объяснении — только по карточке, проверенной устазом; до проверки — черновик.':
        'The translation of the meaning in the explanation comes only from a card reviewed by an ustaz; until the review it is a draft.',
    'Мадд лязим: после алифа идёт буква с шаддой — тянется на 6 счётов.':
        'Madd lazim: after the alif comes a letter with shaddah — it is lengthened to 6 counts.',
    'В упражнении тяните, пока полоска не заполнится.': 'In the exercise, hold it until the bar fills up.',
    '«Ошибка» здесь — после урока 31; до него — «Проверьте себя» с подсказкой «разберём в уроке 31».':
        '“Mistake” here — after lesson 31; before it — “Check yourself” with the hint “we will cover this in lesson 31”.',
    'Как AI Ustaz объясняет ошибку': 'How AI Ustaz explains a mistake',
    'Пример, не проверка вашего чтения. Так AI Ustaz будет объяснять ошибку, когда появится проверка голосом.':
        'An example, not a check of your reading. This is how AI Ustaz will explain a mistake once the voice check arrives.',
    'Разбор подготовлен ИИ, он может ошибаться.': 'The analysis was prepared by AI and can be wrong.',
    'Уровни — целевые. С подключением проверки все замечания сначала идут как «Проверьте себя»; «Ошибка» включается код за кодом, когда проверка покажет себя надёжной.':
        'The levels are target levels. When the check is connected, all remarks first come as “Check yourself”; “Mistake” is switched on code by code once the check proves reliable.',
    # ── названия букв (letters.json; как в speech/hints.ts НАЗВАНИЯ_БУКВ.uz) ──
    'алиф': 'alif',
    'ра': 'ra',
    'зай': 'zay',
    'мим': 'mim',
    'та': 'ta',
    'нун': 'nun',
    'йа': 'ya',
    'ба': 'ba',
    'каф': 'kaf',
    'лям': 'lam',
    'вав': 'waw',
    'һа': 'ha',
    'фа': 'fa',
    'қаф': 'qaf',
    'шин': 'shin',
    'син': 'sin',
    'с̱а': 'tha',
    'с̣ад': 'ṣad',
    'т̣а': 'ṭa',
    'джим': 'jim',
    'ха': 'kha',
    'х̣а': 'ḥa',
    'ғайн': 'ghayn',
    '‘айн': 'ʿayn',
    'даль': 'dal',
    'д̣ад': 'ḍad',
    'з̱аль': 'dhal',
    'з̣а': 'ẓa',
    'хамза': 'hamza',
    'лям-алиф': 'lam-alif',
    # ── подсказки артикуляции (каталог §8) и типичные подмены (§5.1, §6) ──
    'Один лёгкий удар кончика языка, без раската «р-р».':
        'One light tap of the tongue tip, without rolling “r-r”.',
    '«р» с раскатом «р-р»': '“r” rolled as “r-r”',
    'ز на конце оглушается в «с»': 'ز at the end is devoiced to “s”',
    'ت с придыханием': 'ت with aspiration',
    'Звонко; на конце и при остановке не переходите в «п».':
        'Voiced; at the end and when stopping do not turn it into “p”.',
    'ب на конце слова оглушается в «п»': 'ب at the end of a word is devoiced to “p”',
    'Обычное «к» впереди; гласный после него — чистое «а». Не делайте его глубоким, как ق.':
        'An ordinary “k” at the front; the vowel after it is a pure “a”. Do not make it deep like ق.',
    'ك слишком глубокое, как ق': 'ك too deep, like ق',
    'казахо- и узбекоязычным': 'Kazakh and Uzbek speakers',
    'Лёгкий выдох из глубины горла, тише ح. В конце слова не глотайте.':
        'A light breath from deep in the throat, softer than ح. Do not swallow it at the end of a word.',
    'ه звучит как «х»': 'ه sounds like “kh”',
    'русскоязычным, казахоязычным': 'Russian speakers, Kazakh speakers',
    'ه пропадает, особенно в конце слова': 'ه disappears, especially at the end of a word',
    'Нижняя губа касается верхних зубов: «ф», а не «п».':
        'The lower lip touches the upper teeth: “f”, not “p”.',
    'ف звучит как «п»': 'ف sounds like “p”',
    'части старшего поколения казахоязычных': 'part of the older generation of Kazakh speakers',
    'Корень языка смыкается с самым задним нёбом, глубже русского «к». Опора — казахское «қ».':
        'The root of the tongue closes against the very back of the palate, deeper than the Russian “k”. Anchor — the Kazakh “қ”.',
    'ق звучит как ك (قُلْ → «куль»)': 'ق sounds like ك (قُلْ → “kul”)',
    'русскоязычным': 'Russian speakers',
    'Кончик языка между зубами, глухо (как th в английском think). Не «с».':
        'Tongue tip between the teeth, voiceless (like th in the English “think”). Not “s”.',
    'ث → «с»': 'ث → “s”',
    'всем': 'everyone',
    'Как «с», но задняя часть языка поднята, звук полный, со свистом. «А» после неё темнее, но не «о».':
        'Like “s”, but the back of the tongue is raised, the sound is full, with a whistle. The “a” after it is darker, but not “o”.',
    'ص → «с»': 'ص → “s”',
    'Как «т», но язык плотно прижат, задняя часть поднята; звук полный, без придыхания.':
        'Like “t”, but the tongue is pressed firmly and its back is raised; the sound is full, without aspiration.',
    'ط → «т»': 'ط → “t”',
    'Как «х», но глубже, с лёгким хрипом.': 'Like “kh”, but deeper, with a slight rasp.',
    'خ звучит как «к» или как ح': 'خ sounds like “k” or like ح',
    'Гладкий выдох из середины горла: горло слегка сжато, без хрипа — как будто дышите на стекло очков.':
        'A smooth breath from the middle of the throat: the throat is slightly tightened, without rasping — as if you were breathing on your glasses.',
    'ح звучит как «х»': 'ح sounds like “kh”',
    'всем (у казахоязычных — х или һ, у русскоязычных — х)':
        'everyone (Kazakh speakers — kh or h, Russian speakers — kh)',
    'ح звучит как лёгкое «һ»': 'ح sounds like a light “h”',
    'Звонкий звук из верхней части горла, ближе ко рту (там же, где خ), похож на картавое «р», но не «г». У казахов опора — «ғ».':
        'A voiced sound from the upper part of the throat, closer to the mouth (the same place as خ), similar to a guttural “r”, but not “g”. For Kazakh speakers the anchor is “ғ”.',
    'غ звучит как «г»': 'غ sounds like “g”',
    'Звонкий звук из середины горла: горло сжимается, и «а» выходит с усилием. Это не пауза и не «ғ».':
        'A voiced sound from the middle of the throat: the throat tightens and the “a” comes out with effort. It is not a pause and not “ғ”.',
    '‘айн пропадает': 'ʿayn disappears',
    '‘айн заменён хамзой («на’буду»)': 'ʿayn replaced by hamza (“naʾbudu”)',
    '‘айн звучит как «ғ»': 'ʿayn sounds like “ғ”',
    'казахоязычным': 'Kazakh speakers',
    'Звонко; на конце и при остановке не переходите в «т».':
        'Voiced; at the end and when stopping do not turn it into “t”.',
    'د на конце звучит глухо, как «т» (нет отскока)': 'د at the end sounds voiceless, like “t” (no bounce)',
    'Края языка у коренных зубов, задняя часть поднята; звук звонкий и полный. Не «з» и не простое «д».':
        'The edges of the tongue at the molars, the back raised; the sound is voiced and full. Not “z” and not a plain “d”.',
    'ض → «д» или «з»': 'ض → “d” or “z”',
    'путаница ض и ظ — оценивает только устаз': 'confusing ض and ظ — assessed only by an ustaz',
    'Кончик языка между зубами, звонко (как th в английском this). Не «з».':
        'Tongue tip between the teeth, voiced (like th in the English “this”). Not “z”.',
    'ذ → «з»': 'ذ → “z”',
    'ذ на конце оглушается в «с»': 'ذ at the end is devoiced to “s”',
    'Кончик языка между зубами, звонко, задняя часть поднята. Не «з».':
        'Tongue tip between the teeth, voiced, the back raised. Not “z”.',
    'ظ → «з»': 'ظ → “z”',
    'Короткая смычка в горле, как перерыв в «а-а!».':
        'A short stop in the throat, like the break in “uh-oh!”.',
    'хамза пропадает': 'hamza disappears',
    # ── карта курса: названия и цели пунктов ──
    'ИИ-предупреждение, как устроен урок, первая запись «а — и — у»':
        'AI notice, how a lesson works, first recording “a — i — u”',
    'Алиф (ا), хамза (ء) и ра (ر)': 'Alif (ا), hamza (ء) and ra (ر)',
    'Читать справа налево; фатха, кясра, дамма и сукун':
        'Reading right to left; fatha, kasra, damma and sukun',
    'Буквы ز и م': 'Letters ز and م',
    'Новые буквы и первые слова': 'New letters and first words',
    'Буквы ت и ن': 'Letters ت and ن',
    'Закрытые слоги и слова': 'Closed syllables and words',
    'Буквы ي и ب': 'Letters ي and ب',
    'ي как согласная и дифтонг «ай»': 'ي as a consonant and the diphthong “ay”',
    'Буквы ك и ل': 'Letters ك and ل',
    'Новые буквы в коротких словах': 'New letters in short words',
    'Буквы و и ه': 'Letters و and ه',
    'Дифтонг «ау»; ه не глотаем': 'The diphthong “aw”; do not swallow ه',
    'Буквы ف и ق': 'Letters ف and ق',
    'Различаем ك и ق': 'Telling ك and ق apart',
    'Буквы ش и س': 'Letters ش and س',
    'Новые буквы и длинные слова': 'New letters and long words',
    'Буквы ث и ص': 'Letters ث and ص',
    'Различаем س и ث, س и ص': 'Telling س and ث, س and ص apart',
    'Буква ط': 'The letter ط',
    'Буква ط; «тяжёлые» буквы (исти‘ля)': 'The letter ط; “heavy” letters (istiʿla)',
    'Буквы ج и خ': 'Letters ج and خ',
    'Новые буквы; خ — не «к»': 'New letters; خ is not “k”',
    'Буква ح': 'The letter ح',
    'Различаем خ и ح, ه и ح': 'Telling خ and ح, ه and ح apart',
    'Буквы غ и ع': 'Letters غ and ع',
    'Различаем غ и ع, ء и ع': 'Telling غ and ع, ء and ع apart',
    'Буквы د и ض': 'Letters د and ض',
    'Различаем د и ض': 'Telling د and ض apart',
    'Буквы ذ и ظ': 'Letters ذ and ظ',
    'Пары ذ и ظ, ض и ظ, ز и ذ, ز и ظ': 'Pairs ذ and ظ, ض and ظ, ز and ذ, ز and ظ',
    'Формы и соединения букв': 'Letter forms and joining',
    'Начальная, срединная, конечная форма; буквы, не соединяющиеся слева; لا':
        'Initial, medial and final forms; letters that do not join on the left; لا',
    'Контрольная 1': 'Checkpoint 1',
    'Повторение всего буквенного блока: 28 букв, слова уроков 1–15, пары':
        'Revision of the whole letter block: 28 letters, words of lessons 1–15, pairs',
    'Сейчас — тренировочный вариант без проверки голосом. Настоящая К1 — со следующим выпуском.':
        'For now it is a practice version without voice check. The real K1 comes with the next release.',
    'Мадд через ا': 'Madd with ا',
    'Мадд табии — 2 счёта; краткое против долгого': "Madd tabi'i — 2 counts; short versus long",
    'Мадд через ي и و; лин': 'Madd with ي and و; lin',
    'Долгие «ӣ» и «ӯ»; лин (أَيْ، أَوْ)': 'Long “ī” and “ū”; lin (أَيْ، أَوْ)',
    'Беглость длинных слов': 'Fluency with long words',
    'Длинные слова с маддом — без пауз': 'Long words with madd — without pauses',
    'Шадда': 'Shaddah',
    'Шадда = сукун + огласовка (رَبَّ = رَبْبَ)': 'Shaddah = sukun + vowel mark (رَبَّ = رَبْبَ)',
    'Нун и мим с шаддой': 'Nun and mim with shaddah',
    'Гунна — 2 счёта': 'Ghunnah — 2 counts',
    'Танвин': 'Tanween',
    'Танвин = «н» (ـً = ـَنْ); танвин с шаддой; ‘ивад при остановке':
        'Tanween = “n” (ـً = ـَنْ); tanween with shaddah; ʿiwad when stopping',
    'Хамза в 9 видах; знак мадда': 'Hamza in 9 forms; the madd sign',
    'Хамза и ع; знак мадда ٓ — тянем не меньше 4': 'Hamza and ع; the madd sign ٓ — hold at least 4',
    'Мост к мусхафу I': 'Bridge to the mushaf I',
    'Та марбута, алиф максура, малые буквы ـٰ ۥ ۦ': 'Ta marbuta, alif maqsura, small letters ـٰ ۥ ۦ',
    'Мост к мусхафу II': 'Bridge to the mushaf II',
    'Пишется, но не читается: ٱ, алиф после вава, знак ۟; лям камарийя':
        'Written but not read: ٱ, alif after waw, the sign ۟; lam qamariyyah',
    'Лям шамсийя; слово «Аллах»': 'Lam shamsiyyah; the word “Allah”',
    'Солнечные буквы; тяжёлый и лёгкий лям в слове «Аллах»':
        'Sun letters; heavy and light lam in the word “Allah”',
    'Васл': 'Wasl',
    'Соединение слов через хамзат-васль; встреча двух сукунов':
        'Joining words through hamzat al-wasl; meeting of two sukuns',
    'Вакф I': 'Waqf I',
    'Формы остановки: сукун, алиф ‘ивада, ة → ه': 'Forms of stopping: sukun, alif of ʿiwad, ة → ه',
    'Контрольная 2': 'Checkpoint 2',
    'Аль-Фатиха и аль-Ихлас по слогам, с подсветкой':
        'Al-Fatiha and al-Ikhlas syllable by syllable, with highlighting',
    'Исти‘аза и басмала': 'Istiʿadha and basmala',
    'Мадд ‘арид при остановке (2, 4 или 6)': 'Madd ʿarid when stopping (2, 4 or 6)',
    'Аль-Фатиха, аяты 1–4': 'Al-Fatiha, ayahs 1–4',
    'Аяты 1–4 по слогам и целиком': 'Ayahs 1–4 syllable by syllable and in full',
    'Аль-Фатиха, аяты 5–7; мадд лязим': 'Al-Fatiha, ayahs 5–7; madd lazim',
    'Аяты 5–7; мадд лязим — 6 счётов; отметка урока 31': 'Ayahs 5–7; madd lazim — 6 counts; lesson 31 mark',
    'Изхар': 'Izhar',
    'Нун сакина и танвин перед горловыми буквами': 'Nun sakinah and tanween before the throat letters',
    'Идгам': 'Idgham',
    'Идгам с гунной и без; изхар мутляк': 'Idgham with and without ghunnah; izhar mutlaq',
    'Икляб': 'Iqlab',
    'Нун сакина и танвин перед ب звучат как «м»': 'Nun sakinah and tanween before ب sound like “m”',
    'Ихфа': 'Ikhfa',
    '15 букв ихфы; тренировка слуха': 'The 15 letters of ikhfa; ear training',
    'Мим сакина': 'Mim sakinah',
    'Ихфа шафави, идгам мислейн, изхар шафави': 'Ikhfa shafawi, idgham mithlayn, izhar shafawi',
    'Калькаля': 'Qalqalah',
    'Буквы ق ط ب ج د: малая и большая; без ложной калькали':
        'The letters ق ط ب ج د: minor and major; no false qalqalah',
    'Мадд муттасиль и мунфасиль': 'Madd muttasil and munfasil',
    '4 или 5 счётов; единообразие': '4 or 5 counts; consistency',
    '‘Арид, лин, ‘ивад, сыля': 'ʿArid, lin, ʿiwad, silah',
    'Мадды при остановке; сыля': 'Madds when stopping; silah',
    'Мадд лязим; мукатта‘ат': 'Madd lazim; muqattaʿat',
    'Мадд лязим в слове и в буквах; буквы мукатта‘ат':
        'Madd lazim in a word and in letters; the muqattaʿat letters',
    'Ра: тяжёлая и лёгкая': 'Ra: heavy and light',
    'Места, где допустимы оба варианта': 'Places where both variants are acceptable',
    'Тяжёлые буквы; лям в слове «Аллах»': 'Heavy letters; lam in the word “Allah”',
    'Степени тафхима; тяжёлый и лёгкий лям': 'Degrees of tafkhim; heavy and light lam',
    'Контрольная 3': 'Checkpoint 3',
    'Аль-Фатиха и три суры на выбор, без подсветки':
        'Al-Fatiha and three surahs of your choice, without highlighting',
    'Ас-сана': 'As-Sana',
    'Текст намаза: ас-сана': 'Prayer text: as-sana',
    'Ташаххуд': 'Tashahhud',
    'Текст намаза: ташаххуд': 'Prayer text: tashahhud',
    'Салават': 'Salawat',
    'Текст намаза: салават': 'Prayer text: salawat',
    'Ханафитский кунут витра': 'Hanafi qunut of witr',
    'Текст намаза: кунут витра': 'Prayer text: qunut of witr',
    'Махраджи и сифаты': 'Makharij and sifat',
    'Короткие карточки по вашим частым ошибкам': 'Short cards on your frequent mistakes',
    'Идгамы двух согласных': 'Idghams of two consonants',
    'Одинаковые, однородные и близкие согласные': 'Identical, homogeneous and close consonants',
    'Вакф и ибтида': 'Waqf and ibtida',
    'Виды остановок; знаки вакфа': 'Kinds of stops; waqf signs',
    'Особые места Хафса': 'Special places of Hafs',
    'Сакт, имала, ташиль, ишмам и другие': 'Sakt, imalah, tashil, ishmam and others',
    'Темп': 'Pace',
    'Тахкик, тадвир, хадр; ровность маддов': 'Tahqiq, tadwir, hadr; even madds',
    'Джуз ‘Амма — книга для чтения': 'Juz ʿAmma — a reading book',
    'Суры 114 → 78; переход к хифзу': 'Surahs 114 → 78; transition to hifz',
    'Итоговое чтение': 'Final reading',
    'Чтение двух страниц мусхафа': 'Reading two pages of the mushaf',
    # ── урок 0 ──
    'Как устроен урок': 'How a lesson works',
    'Урок — 8–12 коротких заданий: узнать букву, найти её среди похожих, прочитать слог и сказать вслух. Сейчас это прототип: ИИ ещё не проверяет голос, а голос кари появится после записи эталона. Ваша запись остаётся только на этой странице и никуда не отправляется.':
        'A lesson is 8–12 short tasks: recognise a letter, find it among similar ones, read a syllable and say it aloud. This is a prototype for now: the AI does not check the voice yet, and the qari voice will appear once the reference recording is made. Your recording stays only on this page and is not sent anywhere.',
    'Справа налево': 'Right to left',
    'Арабский текст читают справа налево. Начните с правого слога: а — и — у.':
        'Arabic text is read from right to left. Start with the right-hand syllable: a — i — u.',
    'Первая запись: прочитайте «а — и — у» три раза подряд и послушайте себя. Оценки нет.':
        'First recording: read “a — i — u” three times in a row and listen to yourself. There is no grade.',
    'Этот учитель Корана — модель искусственного интеллекта, которая может ошибаться. Она предназначена только для помощи, и на неё нельзя полагаться. Она не заменяет опытного, уполномоченного учителя, поскольку Коран передаётся только устно (мушафаха).':
        'This Quranic Teacher is an artificial-intelligence model that may make mistakes. It is intended for assistance only and must not be relied upon. It is not a replacement for a proficient, authorized teacher, because the Quran is only received through oral transmission (mushafahah).',
    'Вы уже читаете по-арабски?': 'Can you already read Arabic?',
    'Не знаю букв': 'I do not know the letters',
    'Знаю буквы, читаю медленно': 'I know the letters, I read slowly',
    'Теста на уровень в прототипе пока нет: выберите урок на карте курса (например, урок 16 «Формы и соединения букв»).':
        'There is no placement test in the prototype yet: choose a lesson on the course map (for example, lesson 16 “Letter forms and joining”).',
    'Читаю, хочу таджвид': 'I read, I want tajweed',
    '«Аудит Фатихи» появится вместе с проверкой голосом. Сейчас можно посмотреть, как AI Ustaz будет объяснять ошибки.':
        'The “Fatiha audit” will come together with the voice check. For now you can see how AI Ustaz will explain mistakes.',
    'Учу наизусть': 'I am memorising',
    '«Слушатель» для хифза появится позже. Пока можно пройти курс чтения.':
        'The “Listener” for hifz will come later. For now you can take the reading course.',
    'С каким намерением вы учитесь? (по желанию, ответ не сохраняется)':
        'With what intention are you learning? (optional, the answer is not saved)',
    'Читать в намазе': 'To read in prayer',
    'Читать Коран': 'To read the Quran',
    'Учить детей': 'To teach children',
    'Заучивать': 'To memorise',
    'Пропустить': 'Skip',
    # ── теория уроков 1–16 и К1 ──
    'Арабский текст читают справа налево. Первая буква слова — справа.':
        'Arabic text is read from right to left. The first letter of a word is on the right.',
    'Огласовки: фатха, кясра, дамма': 'Vowel marks: fatha, kasra, damma',
    'Фатха — черта над буквой: «а». Кясра — черта под буквой: «и». Дамма — петелька над буквой: «у».':
        'Fatha is a stroke above the letter: “a”. Kasra is a stroke below the letter: “i”. Damma is a loop above the letter: “u”.',
    'Сукун': 'Sukun',
    'Сукун — маленький кружок над буквой. Слог закрыт: после буквы гласного нет.':
        'Sukun is a small circle above the letter. The syllable is closed: there is no vowel after the letter.',
    'Алиф и хамза': 'Alif and hamza',
    'Хамза (ء) — короткая смычка в горле, как перерыв в «а-а!». В начале слова она пишется на алифе: أَ إِ أُ.':
        'Hamza (ء) is a short stop in the throat, like the break in “uh-oh!”. At the start of a word it is written on an alif: أَ إِ أُ.',
    'Какой знак у хамзы?': 'Which mark is on the hamza?',
    'Дифтонг «ай»': 'The diphthong “ay”',
    'Если на ي сукун, а перед ней фатха, звучит «ай».':
        'If ي has a sukun and a fatha comes before it, it sounds “ay”.',
    'Дифтонг «ау»': 'The diphthong “aw”',
    'Если на و сукун, а перед ней фатха, звучит «ау».':
        'If و has a sukun and a fatha comes before it, it sounds “aw”.',
    'Какая из этих букв есть в слове?': 'Which of these letters is in the word?',
    'Тяжёлые буквы (исти‘ля)': 'Heavy letters (istiʿla)',
    'Семь букв читаются «тяжело»: задняя часть языка поднята, звук полный; гласный после них темнее, но не «о».':
        'Seven letters are read “heavy”: the back of the tongue is raised, the sound is full; the vowel after them is darker, but not “o”.',
    'ض и ظ проверяет устаз': 'ض and ظ are checked by an ustaz',
    'Различие ض и ظ ИИ не оценивает — только устаз.':
        'The AI does not assess the difference between ض and ظ — only an ustaz does.',
    'Четыре формы буквы': 'Four forms of a letter',
    'В слове буква меняет форму: отдельная, начальная, срединная, конечная.':
        'In a word a letter changes its form: isolated, initial, medial, final.',
    'Шесть букв не соединяются слева': 'Six letters do not join on the left',
    'Буквы ا د ذ ر ز و соединяются только с предыдущей буквой, а со следующей — нет.':
        'The letters ا د ذ ر ز و join only to the previous letter, not to the next one.',
    'Лям и алиф: لا': 'Lam and alif: لا',
    'Лям и алиф пишутся вместе одним знаком: لا.': 'Lam and alif are written together as one sign: لا.',
    'Какая из этих букв не соединяется со следующей (левой) буквой?':
        'Which of these letters does not join to the next (left) letter?',
    'Не соединяются со следующей буквой шесть букв: ا د ذ ر ز و.':
        'Six letters do not join to the next letter: ا د ذ ر ز و.',
    'Тренировочная К1': 'Practice K1',
    'Повторяем весь буквенный блок: 28 букв, формы, пары и слова уроков 1–15. Это тренировочный вариант: настоящая К1 — с проверкой голосом, два прохождения в разные дни.':
        'We revise the whole letter block: 28 letters, forms, pairs and words of lessons 1–15. This is a practice version: the real K1 has a voice check and two attempts on different days.',
    'Тренировочный вариант без проверки голосом. Контрольной К1 он не засчитывается.':
        'A practice version without voice check. It does not count as checkpoint K1.',
}

ПРИМЕРЫ = {
    'fat-1': (
        'В слове ٱلْحَمْدُ буква х̣а (ح) прозвучала как «х»: «аль-хамду». Гладкий выдох из середины горла, без хрипа — как будто дышите на стекло очков. Повторите: حَ — حَمْ — ٱلْحَمْدُ.',
        'In the word {W} the letter ḥa (ح) sounded like “kh”: “al-khamdu”. A smooth breath from the middle of the throat, without rasping — as if you were breathing on your glasses. Repeat: {L}.',
    ),
    'fat-2': (
        'В слове ٱلْعَٰلَمِينَ не прозвучала буква ‘айн (ع) — получилось «аламӣн», а без неё слово меняется. Звонкий звук из середины горла: горло сжимается, и «а» выходит с усилием. Повторите: عَا — ٱلْعَا — ٱلْعَٰلَمِينَ.',
        'In the word {W} the letter ʿayn (ع) was not heard — it became “alamīn”, and without it the word changes. A voiced sound from the middle of the throat: the throat tightens and the “a” comes out with effort. Repeat: {L}.',
    ),
    'fat-3': (
        'Проверьте себя: в слове مَٰلِكِ здесь мадд — тяните на 2 счёта, как два ваших коротких гласных подряд: «мā». В чтении Хафс здесь долгий слог.',
        'Check yourself: in the word {W} there is a madd here — lengthen it to 2 counts, like two of your short vowels in a row: “mā”. In the Hafs reading the syllable here is long.',
    ),
    'fat-4': (
        'Проверьте себя: послушайте, как кари читает نَعْبُدُ, и сравните со своей записью. ‘Айн — не пауза в горле, а звонкий звук: горло сжимается, и звук идёт с усилием.',
        'Check yourself: listen to how the qari reads {W} and compare with your recording. ʿAyn is not a pause in the throat but a voiced sound: the throat tightens and the sound comes out with effort.',
    ),
    'fat-5': (
        'В слове ٱهْدِنَا не прозвучала буква һа (ه) — получилось «иддина». Лёгкий выдох из глубины горла; после него сразу «ди». Повторите: إِهْ — ٱهْدِ — ٱهْدِنَا.',
        'In the word {W} the letter ha (ه) was not heard — it became “iddina”. A light breath from deep in the throat; right after it, “di”. Repeat: {L}.',
    ),
    'fat-6': (
        'В слове أَنْعَمْتَ на букве та (ت) — фатха («-та»), а прозвучало «-ту». От огласовки здесь зависит смысл: меняется лицо — «Ты» превращается в «я». Повторите: تَ — عَمْتَ — أَنْعَمْتَ.',
        'In the word {W} the letter ta (ت) has a fatha (“-ta”), but “-tu” was heard. The meaning depends on the vowel mark here: the person changes — “You” turns into “I”. Repeat: {L}.',
    ),
    'fat-7': (
        'Здесь мадд лязим: после алифа идёт буква с шаддой, тянется на 6 счётов. У вас около 2. В упражнении тяните, пока полоска не заполнится.',
        'Here there is madd lazim: after the alif comes a letter with shaddah, it is lengthened to 6 counts. Yours is about 2. In the exercise, hold it until the bar fills up.',
    ),
}
