"""Узбекский (латиница) для данных контента: русская строка → узбекская. Читает tools/build_content.py.

ЧЕРНОВИК для редактора-носителя (CLAUDE.md: переводы — черновик, религиозный контент проверяет устаз; пока не
проверено — на экране плашка «черновик», статус уроков «черновик»). Решение владельца 20.11.2026: «Потом нужно
добавить узбекский язык», алфавит — латиница. Переведено с русского по смыслу, без добавлений.

Орфография: «ʻ» (U+02BB) в oʻ/gʻ, «ʼ» (U+02BC) — тутук белгиси (Qurʼon, maʼno). Учебные звуки — латиницей
(«a», «i», «u», долгие «ā», «ī», «ū»); единица длительности мадда — «harakat» (как «харакат» в kk).
Названия букв — как в app/src/speech/hints.ts НАЗВАНИЯ_БУКВ.uz (точка/черта под буквой различают ص ط ح ض ذ ظ ث).
Арабский текст в строках — ровно тот же, что в русских (не набирается заново; текст Корана здесь не хранится:
слово примера §13 подставляет сборщик из копии Tanzil для показа — {W}, ступени лестницы — {L}).

Контракт: ПЕРЕВОД[ru] → uz; ПРИМЕРЫ[id] → (русский текст-источник, шаблон uz с {W} и {L}).
Новая русская строка в build_content.py без перевода здесь — сборка падает со списком строк.
"""

ПЕРЕВОД = {
    # ── огласовки и знаки (harakat.json) ──
    'фатха': 'fatha',
    '«а»': '«a»',
    'Короткая косая черта над буквой. Звук «а».': 'Harf ustidagi qisqa qiya chiziq. Tovushi — «a».',
    'кясра': 'kasra',
    '«и»': '«i»',
    'Короткая косая черта под буквой. Звук «и».': 'Harf ostidagi qisqa qiya chiziq. Tovushi — «i».',
    'дамма': 'damma',
    '«у»': '«u»',
    'Маленькая петелька над буквой, похожая на маленькую و. Звук «у».':
        'Harf ustidagi kichik ilmoq, kichkina و harfiga oʻxshaydi. Tovushi — «u».',
    'сукун': 'sukun',
    'нет гласного': 'unli yoʻq',
    'Маленький кружок над буквой. Слог закрыт: после буквы гласного нет.':
        'Harf ustidagi kichik doiracha. Boʻgʻin yopiq: harfdan keyin unli yoʻq.',
    'шадда': 'shadda',
    'буква дважды': 'harf ikki marta',
    'Буква звучит дважды: шадда = сукун + огласовка (رَبَّ = رَبْبَ). Задержите букву, как «сс» в русском «касса».':
        'Harf ikki marta aytiladi: shadda = sukun + harakat (رَبَّ = رَبْبَ). Harfni ruscha «kassa» soʻzidagi «ss» kabi '
        'ushlab turing.',
    'танвин с фатхой': 'fathali tanvin',
    '«ан»': '«an»',
    'Две фатхи: в конце слова читается «ан» — фатха + нун с сукуном (ـً = ـَنْ).':
        'Ikki fatha: soʻz oxirida «an» deb oʻqiladi — fatha + sukunli nun (ـً = ـَنْ).',
    'танвин с кясрой': 'kasrali tanvin',
    '«ин»': '«in»',
    'Две кясры: в конце слова читается «ин» — кясра + нун с сукуном.':
        'Ikki kasra: soʻz oxirida «in» deb oʻqiladi — kasra + sukunli nun.',
    'танвин с даммой': 'dammali tanvin',
    '«ун»': '«un»',
    'Две даммы: в конце слова читается «ун» — дамма + нун с сукуном.':
        'Ikki damma: soʻz oxirida «un» deb oʻqiladi — damma + sukunli nun.',
    'мадд через алиф': 'alif orqali madd',
    '«а̄» — 2 счёта': '«ā» — 2 harakat',
    'Алиф после фатхи тянет «а» на 2 счёта. Долгий гласный — как два ваших коротких подряд, без разрыва.':
        'Fathadan keyingi alif «a»ni 2 harakatga choʻzadi. Uzun unli — ikkita qisqa unlingiz ketma-ket, uzilishsiz '
        'aytilgandek.',
    'мадд через вав': 'vov orqali madd',
    '«ӯ» — 2 счёта': '«ū» — 2 harakat',
    'Вав после даммы тянет «у» на 2 счёта.': 'Dammadan keyingi vov «u»ni 2 harakatga choʻzadi.',
    'мадд через йа': 'yo orqali madd',
    '«ӣ» — 2 счёта': '«ī» — 2 harakat',
    'Йа после кясры тянет «и» на 2 счёта.': 'Kasradan keyingi yo «i»ni 2 harakatga choʻzadi.',
    'Казахский термин не утверждён (программа курса §16, вопрос 9): арабские названия или тюркские из старых букварей.':
        'Qozoqcha atama tasdiqlanmagan (kurs dasturi §16, 9-savol): arabcha nomlarmi yoki eski alifbolardagi turkiy '
        'nomlarmi.',
    # ── варианты и подсказки заданий ──
    'фатха («а»)': 'fatha («a»)',
    'кясра («и»)': 'kasra («i»)',
    'дамма («у»)': 'damma («u»)',
    'сукун (нет гласного)': 'sukun (unli yoʻq)',
    'Прочитайте вслух. Не уверены — откройте подсказку под слогом.':
        'Ovoz chiqarib oʻqing. Ishonchingiz komil boʻlmasa — boʻgʻin ostidagi maslahatni oching.',
    'Прочитайте пары. Слова различаются одной буквой.': 'Juftliklarni oʻqing. Soʻzlar bitta harf bilan farqlanadi.',
    'Прочитайте вслух и запишите себя, затем послушайте запись.':
        'Ovoz chiqarib oʻqing va oʻzingizni yozib oling, soʻng yozuvni tinglang.',
    'Лестница: читайте по ступеням — от слога к слову. Запишите каждую ступень.':
        'Narvon: pogʻonama-pogʻona oʻqing — boʻgʻindan soʻzgacha. Har bir pogʻonani yozib oling.',
    # ── уровни курса ──
    'Вход': 'Kirish',
    'Буквы, огласовки, сукун': 'Harflar, harakatlar, sukun',
    'Долгота, удвоение, танвин, хамза, мост к мусхафу': 'Choʻziq, tashdid, tanvin, hamza, mushafga koʻprik',
    'Аль-Фатиха и суры намаза: базовый таджвид': 'Al-Fotiha va namoz suralari: asosiy tajvid',
    'Чтение мусхафа и углублённый таджвид': 'Mushafni oʻqish va chuqurlashtirilgan tajvid',
    # ── пример разбора аль-Фатихи ──
    'Ошибка': 'Xato',
    'Проверьте себя': 'Oʻzingizni tekshiring',
    'Сравните': 'Solishtiring',
    'Это важно: от этой буквы зависит смысл слова.': 'Bu muhim: soʻzning maʼnosi shu harfga bogʻliq.',
    'Гладкий выдох из середины горла, без хрипа — как будто дышите на стекло очков.':
        'Tomoqning oʻrtasidan silliq nafas, xirillashsiz — xuddi koʻzoynak oynasiga nafas purkayotgandek.',
    'Без буквы ‘айн (ع) слово меняется.': 'Ayn (ع) harfisiz soʻz oʻzgaradi.',
    'Звонкий звук из середины горла: горло сжимается, и «а» выходит с усилием.':
        'Tomoqning oʻrtasidan chiqadigan jarangli tovush: tomoq qisiladi va «a» kuch bilan chiqadi.',
    'Мадд табии: «мā» тянется на 2 счёта.': 'Tabiiy madd: «mā» 2 harakatga choʻziladi.',
    'Тяните на 2 счёта, как два ваших коротких гласных подряд.':
        'Ikkita qisqa unlingiz ketma-ket kelgandek, 2 harakatga choʻzing.',
    'Короткое «малики» — законное чтение других риваятов, поэтому «другое слово» здесь не говорим. В чтении Хафс здесь долгий слог.':
        'Qisqa «maliki» — boshqa rivoyatlarning joiz qiroati, shuning uchun bu yerda «boshqa soʻz» demaymiz. Hafs '
        'qiroatida bu yerda boʻgʻin uzun.',
    '‘Айн — не пауза в горле, а звонкий звук.': 'Ayn — tomoqdagi pauza emas, jarangli tovush.',
    'Послушайте кари и сравните со своей записью. Голос кари появится после записи эталона.':
        'Qorini tinglang va oʻz yozuvingiz bilan solishtiring. Qori ovozi namuna yozib olingandan keyin qoʻshiladi.',
    'Без буквы һа (ه) слово меняется.': 'Ha (ه) harfisiz soʻz oʻzgaradi.',
    'Лёгкий выдох из глубины горла; после него сразу «ди».': 'Tomoq tubidan yengil nafas; undan keyin darhol «di».',
    'От огласовки здесь зависит смысл: меняется лицо — «Ты» превращается в «я».':
        'Bu yerda maʼno harakatga bogʻliq: shaxs oʻzgaradi — «Sen» «men»ga aylanadi.',
    'На букве та (ت) — фатха: «-та».': 'To (ت) harfida — fatha: «-ta».',
    'Перевод смысла в объяснении — только по карточке, проверенной устазом; до проверки — черновик.':
        'Tushuntirishdagi maʼno tarjimasi — faqat ustoz tekshirgan kartochka boʻyicha; tekshiruvgacha — qoralama.',
    'Мадд лязим: после алифа идёт буква с шаддой — тянется на 6 счётов.':
        'Lozim madd: alifdan keyin shaddali harf keladi — 6 harakatga choʻziladi.',
    'В упражнении тяните, пока полоска не заполнится.': 'Mashqda chiziq toʻlguncha choʻzing.',
    '«Ошибка» здесь — после урока 31; до него — «Проверьте себя» с подсказкой «разберём в уроке 31».':
        'Bu yerda «Xato» — 31-darsdan keyin; undan oldin — «Oʻzingizni tekshiring» va «31-darsda koʻrib chiqamiz» '
        'degan maslahat.',
    'Как AI Ustaz объясняет ошибку': 'AI Ustaz xatoni qanday tushuntiradi',
    'Пример, не проверка вашего чтения. Так AI Ustaz будет объяснять ошибку, когда появится проверка голосом.':
        'Bu — namuna, oʻqishingizni tekshirish emas. Ovoz bilan tekshirish paydo boʻlganda, AI Ustaz xatoni shunday '
        'tushuntiradi.',
    'Разбор подготовлен ИИ, он может ошибаться.': 'Tahlilni SI tayyorlagan, u xato qilishi mumkin.',
    'Уровни — целевые. С подключением проверки все замечания сначала идут как «Проверьте себя»; «Ошибка» включается код за кодом, когда проверка покажет себя надёжной.':
        'Darajalar — maqsadli. Tekshiruv ulanganda barcha izohlar avval «Oʻzingizni tekshiring» sifatida chiqadi; '
        '«Xato» tekshiruv ishonchli ekani isbotlanganda, kod-ma-kod yoqiladi.',
    # ── названия букв (letters.json; как в speech/hints.ts НАЗВАНИЯ_БУКВ.uz) ──
    'алиф': 'alif',
    'ра': 'ro',
    'зай': 'zay',
    'мим': 'mim',
    'та': 'to',
    'нун': 'nun',
    'йа': 'yo',
    'ба': 'bo',
    'каф': 'kof',
    'лям': 'lom',
    'вав': 'vov',
    'һа': 'ha',
    'фа': 'fo',
    'қаф': 'qof',
    'шин': 'shin',
    'син': 'sin',
    'с̱а': 's̱o',
    'с̣ад': 'ṣod',
    'т̣а': 'ṭo',
    'джим': 'jim',
    'ха': 'xo',
    'х̣а': 'ḥo',
    'ғайн': 'gʻayn',
    '‘айн': 'ayn',
    'даль': 'dol',
    'д̣ад': 'ḍod',
    'з̱аль': 'ẕol',
    'з̣а': 'ẓo',
    'хамза': 'hamza',
    'лям-алиф': 'lom-alif',
    # ── подсказки артикуляции (каталог §8) и типичные подмены (§5.1, §6) ──
    'Один лёгкий удар кончика языка, без раската «р-р».': 'Til uchining bitta yengil zarbi, «r-r» deb titratmasdan.',
    '«р» с раскатом «р-р»': '«r»ni «r-r» deb titratib aytish',
    'ز на конце оглушается в «с»': 'oxiridagi ز jarangsizlanib «s»ga aylanadi',
    'ت с придыханием': 'ت nafas chiqarib aytiladi',
    'Звонко; на конце и при остановке не переходите в «п».': 'Jarangli; oxirida va toʻxtaganda «p»ga oʻtmang.',
    'ب на конце слова оглушается в «п»': 'soʻz oxiridagi ب jarangsizlanib «p»ga aylanadi',
    'Обычное «к» впереди; гласный после него — чистое «а». Не делайте его глубоким, как ق.':
        'Oddiy «k», oldinda; undan keyingi unli — sof «a». Uni ق kabi chuqur qilmang.',
    'ك слишком глубокое, как ق': 'ك juda chuqur, ق kabi aytiladi',
    'казахо- и узбекоязычным': 'qozoq va oʻzbek tilida soʻzlashuvchilarga',
    'Лёгкий выдох из глубины горла, тише ح. В конце слова не глотайте.':
        'Tomoq tubidan yengil nafas, ح dan sokinroq. Soʻz oxirida yutib yubormang.',
    'ه звучит как «х»': 'ه «x» boʻlib eshitiladi',
    'русскоязычным, казахоязычным': 'rus tilida soʻzlashuvchilarga, qozoq tilida soʻzlashuvchilarga',
    'ه пропадает, особенно в конце слова': 'ه tushib qoladi, ayniqsa soʻz oxirida',
    'Нижняя губа касается верхних зубов: «ф», а не «п».': 'Pastki lab yuqori tishlarga tegadi: «f», «p» emas.',
    'ف звучит как «п»': 'ف «p» boʻlib eshitiladi',
    'части старшего поколения казахоязычных': 'qozoq tilida soʻzlashuvchi katta avlodning bir qismiga',
    'Корень языка смыкается с самым задним нёбом, глубже русского «к». Опора — казахское «қ».':
        'Til ildizi tanglayning eng orqa qismiga tegadi, ruscha «k» dan chuqurroq. Tayanch — qozoqcha «қ».',
    'ق звучит как ك (قُلْ → «куль»)': 'ق harfi ك boʻlib eshitiladi (قُلْ → «kul»)',
    'русскоязычным': 'rus tilida soʻzlashuvchilarga',
    'Кончик языка между зубами, глухо (как th в английском think). Не «с».':
        'Til uchi tishlar orasida, jarangsiz (inglizcha think soʻzidagi th kabi). «s» emas.',
    'ث → «с»': 'ث → «s»',
    'всем': 'hammaga',
    'Как «с», но задняя часть языка поднята, звук полный, со свистом. «А» после неё темнее, но не «о».':
        '«s» kabi, lekin tilning orqa qismi koʻtarilgan, tovush toʻliq, hushtakli. Undan keyingi «a» qalinroq, lekin «o» '
        'emas.',
    'ص → «с»': 'ص → «s»',
    'Как «т», но язык плотно прижат, задняя часть поднята; звук полный, без придыхания.':
        '«t» kabi, lekin til mahkam bosilgan, orqa qismi koʻtarilgan; tovush toʻliq, nafas chiqarmasdan.',
    'ط → «т»': 'ط → «t»',
    'Как «х», но глубже, с лёгким хрипом.': '«x» kabi, lekin chuqurroq, yengil xirillash bilan.',
    'خ звучит как «к» или как ح': 'خ «k» yoki ح boʻlib eshitiladi',
    'Гладкий выдох из середины горла: горло слегка сжато, без хрипа — как будто дышите на стекло очков.':
        'Tomoqning oʻrtasidan silliq nafas: tomoq biroz qisilgan, xirillashsiz — xuddi koʻzoynak oynasiga nafas '
        'purkayotgandek.',
    'ح звучит как «х»': 'ح «x» boʻlib eshitiladi',
    'всем (у казахоязычных — х или һ, у русскоязычных — х)':
        'hammaga (qozoq tilida soʻzlashuvchilarda — x yoki h, rus tilida soʻzlashuvchilarda — x)',
    'ح звучит как лёгкое «һ»': 'ح yengil «h» boʻlib eshitiladi',
    'Звонкий звук из верхней части горла, ближе ко рту (там же, где خ), похож на картавое «р», но не «г». У казахов опора — «ғ».':
        'Tomoqning yuqori, ogʻizga yaqin qismidan (خ chiqadigan joydan) chiqadigan jarangli tovush, burro «r»ga oʻxshaydi, '
        'lekin «g» emas. Qozoqlarda tayanch — «ғ».',
    'غ звучит как «г»': 'غ «g» boʻlib eshitiladi',
    'Звонкий звук из середины горла: горло сжимается, и «а» выходит с усилием. Это не пауза и не «ғ».':
        'Tomoqning oʻrtasidan chiqadigan jarangli tovush: tomoq qisiladi va «a» kuch bilan chiqadi. Bu pauza ham, «gʻ» '
        'ham emas.',
    '‘айн пропадает': 'ayn tushib qoladi',
    '‘айн заменён хамзой («на’буду»)': 'ayn hamza bilan almashgan («naʼbudu»)',
    '‘айн звучит как «ғ»': 'ayn «gʻ» boʻlib eshitiladi',
    'казахоязычным': 'qozoq tilida soʻzlashuvchilarga',
    'Звонко; на конце и при остановке не переходите в «т».': 'Jarangli; oxirida va toʻxtaganda «t»ga oʻtmang.',
    'د на конце звучит глухо, как «т» (нет отскока)': 'oxiridagi د jarangsiz, «t» kabi chiqadi (sapchish yoʻq)',
    'Края языка у коренных зубов, задняя часть поднята; звук звонкий и полный. Не «з» и не простое «д».':
        'Til chetlari oziq tishlar yonida, orqa qismi koʻtarilgan; tovush jarangli va toʻliq. «z» ham, oddiy «d» ham emas.',
    'ض → «д» или «з»': 'ض → «d» yoki «z»',
    'путаница ض и ظ — оценивает только устаз': 'ض va ظ ni chalkashtirish — faqat ustoz baholaydi',
    'Кончик языка между зубами, звонко (как th в английском this). Не «з».':
        'Til uchi tishlar orasida, jarangli (inglizcha this soʻzidagi th kabi). «z» emas.',
    'ذ → «з»': 'ذ → «z»',
    'ذ на конце оглушается в «с»': 'oxiridagi ذ jarangsizlanib «s»ga aylanadi',
    'Кончик языка между зубами, звонко, задняя часть поднята. Не «з».':
        'Til uchi tishlar orasida, jarangli, orqa qismi koʻtarilgan. «z» emas.',
    'ظ → «з»': 'ظ → «z»',
    'Короткая смычка в горле, как перерыв в «а-а!».': 'Tomoqdagi qisqa toʻxtash, «a-a!» dagi uzilish kabi.',
    'хамза пропадает': 'hamza tushib qoladi',
    # ── карта курса: названия и цели пунктов ──
    'ИИ-предупреждение, как устроен урок, первая запись «а — и — у»':
        'SI haqida ogohlantirish, dars qanday tuzilgan, ilk yozuv «a — i — u»',
    'Алиф (ا), хамза (ء) и ра (ر)': 'Alif (ا), hamza (ء) va ro (ر)',
    'Читать справа налево; фатха, кясра, дамма и сукун': 'Oʻngdan chapga oʻqish; fatha, kasra, damma va sukun',
    'Буквы ز и م': 'ز va م harflari',
    'Новые буквы и первые слова': 'Yangi harflar va ilk soʻzlar',
    'Буквы ت и ن': 'ت va ن harflari',
    'Закрытые слоги и слова': 'Yopiq boʻgʻinlar va soʻzlar',
    'Буквы ي и ب': 'ي va ب harflari',
    'ي как согласная и дифтонг «ай»': 'ي undosh sifatida va «ay» diftongi',
    'Буквы ك и ل': 'ك va ل harflari',
    'Новые буквы в коротких словах': 'Qisqa soʻzlarda yangi harflar',
    'Буквы و и ه': 'و va ه harflari',
    'Дифтонг «ау»; ه не глотаем': '«av» diftongi; ه ni yutmaymiz',
    'Буквы ف и ق': 'ف va ق harflari',
    'Различаем ك и ق': 'ك va ق ni farqlaymiz',
    'Буквы ش и س': 'ش va س harflari',
    'Новые буквы и длинные слова': 'Yangi harflar va uzun soʻzlar',
    'Буквы ث и ص': 'ث va ص harflari',
    'Различаем س и ث, س и ص': 'س va ث, س va ص ni farqlaymiz',
    'Буква ط': 'ط harfi',
    'Буква ط; «тяжёлые» буквы (исти‘ля)': 'ط harfi; «qalin» harflar (istiʼlo)',
    'Буквы ج и خ': 'ج va خ harflari',
    'Новые буквы; خ — не «к»': 'Yangi harflar; خ — «k» emas',
    'Буква ح': 'ح harfi',
    'Различаем خ и ح, ه и ح': 'خ va ح, ه va ح ni farqlaymiz',
    'Буквы غ и ع': 'غ va ع harflari',
    'Различаем غ и ع, ء и ع': 'غ va ع, ء va ع ni farqlaymiz',
    'Буквы د и ض': 'د va ض harflari',
    'Различаем د и ض': 'د va ض ni farqlaymiz',
    'Буквы ذ и ظ': 'ذ va ظ harflari',
    'Пары ذ и ظ, ض и ظ, ز и ذ, ز и ظ': 'ذ va ظ, ض va ظ, ز va ذ, ز va ظ juftliklari',
    'Формы и соединения букв': 'Harflarning shakllari va qoʻshilishi',
    'Начальная, срединная, конечная форма; буквы, не соединяющиеся слева; لا':
        'Boshlangʻich, oʻrta, oxirgi shakl; chapga qoʻshilmaydigan harflar; لا',
    'Контрольная 1': '1-nazorat',
    'Повторение всего буквенного блока: 28 букв, слова уроков 1–15, пары':
        'Butun harflar boʻlimini takrorlash: 28 harf, 1–15-darslar soʻzlari, juftliklar',
    'Сейчас — тренировочный вариант без проверки голосом. Настоящая К1 — со следующим выпуском.':
        'Hozir — ovoz bilan tekshiruvsiz mashq varianti. Haqiqiy K1 — keyingi chiqarilish bilan.',
    'Мадд через ا': 'ا orqali madd',
    'Мадд табии — 2 счёта; краткое против долгого': 'Tabiiy madd — 2 harakat; qisqa va uzunni farqlash',
    'Мадд через ي и و; лин': 'ي va و orqali madd; lin',
    'Долгие «ӣ» и «ӯ»; лин (أَيْ، أَوْ)': 'Uzun «ī» va «ū»; lin (أَيْ، أَوْ)',
    'Беглость длинных слов': 'Uzun soʻzlarni ravon oʻqish',
    'Длинные слова с маддом — без пауз': 'Maddli uzun soʻzlar — pauzasiz',
    'Шадда': 'Shadda',
    'Шадда = сукун + огласовка (رَبَّ = رَبْبَ)': 'Shadda = sukun + harakat (رَبَّ = رَبْبَ)',
    'Нун и мим с шаддой': 'Shaddali nun va mim',
    'Гунна — 2 счёта': 'Gʻunna — 2 harakat',
    'Танвин': 'Tanvin',
    'Танвин = «н» (ـً = ـَنْ); танвин с шаддой; ‘ивад при остановке':
        'Tanvin = «n» (ـً = ـَنْ); shaddali tanvin; toʻxtashda ivaz',
    'Хамза в 9 видах; знак мадда': 'Hamzaning 9 koʻrinishi; madd belgisi',
    'Хамза и ع; знак мадда ٓ — тянем не меньше 4': 'Hamza va ع; madd belgisi ٓ — kamida 4 harakat choʻzamiz',
    'Мост к мусхафу I': 'Mushafga koʻprik I',
    'Та марбута, алиф максура, малые буквы ـٰ ۥ ۦ': 'Toi marbuta, alif maqsura, kichik harflar ـٰ ۥ ۦ',
    'Мост к мусхафу II': 'Mushafga koʻprik II',
    'Пишется, но не читается: ٱ, алиф после вава, знак ۟; лям камарийя':
        'Yoziladi, lekin oʻqilmaydi: ٱ, vovdan keyingi alif, ۟ belgisi; lomi qamariya',
    'Лям шамсийя; слово «Аллах»': 'Lomi shamsiya; «Alloh» soʻzi',
    'Солнечные буквы; тяжёлый и лёгкий лям в слове «Аллах»': 'Quyosh harflari; «Alloh» soʻzidagi qalin va ingichka lom',
    'Васл': 'Vasl',
    'Соединение слов через хамзат-васль; встреча двух сукунов':
        'Soʻzlarni hamzai vasl orqali qoʻshish; ikki sukunning uchrashishi',
    'Вакф I': 'Vaqf I',
    'Формы остановки: сукун, алиф ‘ивада, ة → ه': 'Toʻxtash shakllari: sukun, ivaz alifi, ة → ه',
    'Контрольная 2': '2-nazorat',
    'Аль-Фатиха и аль-Ихлас по слогам, с подсветкой': 'Al-Fotiha va al-Ixlos boʻgʻinlab, ajratib koʻrsatish bilan',
    'Исти‘аза и басмала': 'Istiʼoza va basmala',
    'Мадд ‘арид при остановке (2, 4 или 6)': 'Toʻxtashdagi oriz madd (2, 4 yoki 6)',
    'Аль-Фатиха, аяты 1–4': 'Al-Fotiha, 1–4-oyatlar',
    'Аяты 1–4 по слогам и целиком': '1–4-oyatlar boʻgʻinlab va toʻliq',
    'Аль-Фатиха, аяты 5–7; мадд лязим': 'Al-Fotiha, 5–7-oyatlar; lozim madd',
    'Аяты 5–7; мадд лязим — 6 счётов; отметка урока 31': '5–7-oyatlar; lozim madd — 6 harakat; 31-dars belgisi',
    'Изхар': 'Izhor',
    'Нун сакина и танвин перед горловыми буквами': 'Tomoq harflari oldidagi sokin nun va tanvin',
    'Идгам': 'Idgʻom',
    'Идгам с гунной и без; изхар мутляк': 'Gʻunnali va gʻunnasiz idgʻom; mutlaq izhor',
    'Икляб': 'Iqlob',
    'Нун сакина и танвин перед ب звучат как «м»': 'ب oldidagi sokin nun va tanvin «m» boʻlib eshitiladi',
    'Ихфа': 'Ixfo',
    '15 букв ихфы; тренировка слуха': 'Ixfoning 15 harfi; eshitish mashqi',
    'Мим сакина': 'Sokin mim',
    'Ихфа шафави, идгам мислейн, изхар шафави': 'Shafaviy ixfo, misliyn idgʻomi, shafaviy izhor',
    'Калькаля': 'Qalqala',
    'Буквы ق ط ب ج د: малая и большая; без ложной калькали':
        'ق ط ب ج د harflari: kichik va katta; soxta qalqalasiz',
    'Мадд муттасиль и мунфасиль': 'Muttasil va munfasil madd',
    '4 или 5 счётов; единообразие': '4 yoki 5 harakat; bir xillik',
    '‘Арид, лин, ‘ивад, сыля': 'Oriz, lin, ivaz, sila',
    'Мадды при остановке; сыля': 'Toʻxtashdagi maddlar; sila',
    'Мадд лязим; мукатта‘ат': 'Lozim madd; muqattaʼot',
    'Мадд лязим в слове и в буквах; буквы мукатта‘ат': 'Soʻzdagi va harflardagi lozim madd; muqattaʼot harflari',
    'Ра: тяжёлая и лёгкая': 'Ro: qalin va ingichka',
    'Места, где допустимы оба варианта': 'Ikkala variant ham joiz boʻlgan joylar',
    'Тяжёлые буквы; лям в слове «Аллах»': 'Qalin harflar; «Alloh» soʻzidagi lom',
    'Степени тафхима; тяжёлый и лёгкий лям': 'Tafxim darajalari; qalin va ingichka lom',
    'Контрольная 3': '3-nazorat',
    'Аль-Фатиха и три суры на выбор, без подсветки': 'Al-Fotiha va tanlangan uchta sura, ajratib koʻrsatishsiz',
    'Ас-сана': 'Sano',
    'Текст намаза: ас-сана': 'Namoz matni: sano',
    'Ташаххуд': 'Tashahhud',
    'Текст намаза: ташаххуд': 'Namoz matni: tashahhud',
    'Салават': 'Salovot',
    'Текст намаза: салават': 'Namoz matni: salovot',
    'Ханафитский кунут витра': 'Hanafiy mazhabidagi vitr qunuti',
    'Текст намаза: кунут витра': 'Namoz matni: vitr qunuti',
    'Махраджи и сифаты': 'Maxrajlar va sifatlar',
    'Короткие карточки по вашим частым ошибкам': 'Koʻp uchraydigan xatolaringiz boʻyicha qisqa kartochkalar',
    'Идгамы двух согласных': 'Ikki undoshning idgʻomlari',
    'Одинаковые, однородные и близкие согласные': 'Bir xil, bir jinsli va yaqin undoshlar',
    'Вакф и ибтида': 'Vaqf va ibtido',
    'Виды остановок; знаки вакфа': 'Toʻxtash turlari; vaqf belgilari',
    'Особые места Хафса': 'Hafsning alohida oʻrinlari',
    'Сакт, имала, ташиль, ишмам и другие': 'Sakt, imola, tashil, ishmom va boshqalar',
    'Темп': 'Surʼat',
    'Тахкик, тадвир, хадр; ровность маддов': 'Tahqiq, tadvir, hadr; maddlarning bir tekisligi',
    'Джуз ‘Амма — книга для чтения': 'Amma porasi — oʻqish kitobi',
    'Суры 114 → 78; переход к хифзу': '114 → 78-suralar; hifzga oʻtish',
    'Итоговое чтение': 'Yakuniy oʻqish',
    'Чтение двух страниц мусхафа': 'Mushafning ikki sahifasini oʻqish',
    # ── урок 0 ──
    'Как устроен урок': 'Dars qanday tuzilgan',
    'Урок — 8–12 коротких заданий: узнать букву, найти её среди похожих, прочитать слог и сказать вслух. Сейчас это прототип: ИИ ещё не проверяет голос, а голос кари появится после записи эталона. Ваша запись остаётся только на этой странице и никуда не отправляется.':
        'Dars — 8–12 ta qisqa topshiriq: harfni tanish, uni oʻxshashlari orasidan topish, boʻgʻinni oʻqish va ovoz chiqarib '
        'aytish. Hozir bu — prototip: SI hali ovozni tekshirmaydi, qori ovozi esa namuna yozib olingandan keyin '
        'qoʻshiladi. Yozuvingiz faqat shu sahifada qoladi va hech qayerga yuborilmaydi.',
    'Справа налево': 'Oʻngdan chapga',
    'Арабский текст читают справа налево. Начните с правого слога: а — и — у.':
        'Arabcha matn oʻngdan chapga oʻqiladi. Oʻngdagi boʻgʻindan boshlang: a — i — u.',
    'Первая запись: прочитайте «а — и — у» три раза подряд и послушайте себя. Оценки нет.':
        'Ilk yozuv: «a — i — u»ni ketma-ket uch marta oʻqing va oʻzingizni tinglang. Baho qoʻyilmaydi.',
    # ИИ-предупреждение QML (урок 0): ar и ru — официальные тексты NOTICE; uz — наш перевод с ru, черновик.
    'Этот учитель Корана — модель искусственного интеллекта, которая может ошибаться. Она предназначена только для помощи, и на неё нельзя полагаться. Она не заменяет опытного, уполномоченного учителя, поскольку Коран передаётся только устно (мушафаха).':
        'Bu Qurʼon ustozi — xato qilishi mumkin boʻlgan sunʼiy intellekt modeli. U faqat yordam uchun moʻljallangan va '
        'unga tayanib boʻlmaydi. U tajribali, vakolatli ustozning oʻrnini bosmaydi, chunki Qurʼon faqat ogʻzaki '
        '(mushofaha) yoʻli bilan oʻtadi.',
    'Вы уже читаете по-арабски?': 'Siz arabcha oʻqiy olasizmi?',
    'Не знаю букв': 'Harflarni bilmayman',
    'Знаю буквы, читаю медленно': 'Harflarni bilaman, sekin oʻqiyman',
    'Теста на уровень в прототипе пока нет: выберите урок на карте курса (например, урок 16 «Формы и соединения букв»).':
        'Prototipda daraja testi hozircha yoʻq: kurs xaritasidan dars tanlang (masalan, 16-dars «Harflarning shakllari va '
        'qoʻshilishi»).',
    'Читаю, хочу таджвид': 'Oʻqiyman, tajvid oʻrganmoqchiman',
    '«Аудит Фатихи» появится вместе с проверкой голосом. Сейчас можно посмотреть, как AI Ustaz будет объяснять ошибки.':
        '«Fotiha auditi» ovoz bilan tekshirish bilan birga paydo boʻladi. Hozir AI Ustaz xatolarni qanday tushuntirishini '
        'koʻrish mumkin.',
    'Учу наизусть': 'Yod olyapman',
    '«Слушатель» для хифза появится позже. Пока можно пройти курс чтения.':
        'Hifz uchun «Tinglovchi» keyinroq paydo boʻladi. Hozircha oʻqish kursini oʻtish mumkin.',
    'С каким намерением вы учитесь? (по желанию, ответ не сохраняется)':
        'Qanday niyat bilan oʻqiyapsiz? (xohishga koʻra, javob saqlanmaydi)',
    'Читать в намазе': 'Namozda oʻqish',
    'Читать Коран': 'Qurʼon oʻqish',
    'Учить детей': 'Bolalarni oʻqitish',
    'Заучивать': 'Yod olish',
    'Пропустить': 'Oʻtkazib yuborish',
    # ── теория уроков 1–16 и К1 ──
    'Арабский текст читают справа налево. Первая буква слова — справа.':
        'Arabcha matn oʻngdan chapga oʻqiladi. Soʻzning birinchi harfi — oʻngda.',
    'Огласовки: фатха, кясра, дамма': 'Harakatlar: fatha, kasra, damma',
    'Фатха — черта над буквой: «а». Кясра — черта под буквой: «и». Дамма — петелька над буквой: «у».':
        'Fatha — harf ustidagi chiziq: «a». Kasra — harf ostidagi chiziq: «i». Damma — harf ustidagi ilmoq: «u».',
    'Сукун': 'Sukun',
    'Сукун — маленький кружок над буквой. Слог закрыт: после буквы гласного нет.':
        'Sukun — harf ustidagi kichik doiracha. Boʻgʻin yopiq: harfdan keyin unli yoʻq.',
    'Алиф и хамза': 'Alif va hamza',
    'Хамза (ء) — короткая смычка в горле, как перерыв в «а-а!». В начале слова она пишется на алифе: أَ إِ أُ.':
        'Hamza (ء) — tomoqdagi qisqa toʻxtash, «a-a!» dagi uzilish kabi. Soʻz boshida u alif ustiga yoziladi: أَ إِ أُ.',
    'Какой знак у хамзы?': 'Hamzada qanday belgi bor?',
    'Дифтонг «ай»': '«Ay» diftongi',
    'Если на ي сукун, а перед ней фатха, звучит «ай».': 'Agar ي da sukun, undan oldin esa fatha boʻlsa, «ay» eshitiladi.',
    'Дифтонг «ау»': '«Av» diftongi',
    'Если на و сукун, а перед ней фатха, звучит «ау».': 'Agar و da sukun, undan oldin esa fatha boʻlsa, «av» eshitiladi.',
    'Какая из этих букв есть в слове?': 'Bu harflardan qaysi biri soʻzda bor?',
    'Тяжёлые буквы (исти‘ля)': 'Qalin harflar (istiʼlo)',
    'Семь букв читаются «тяжело»: задняя часть языка поднята, звук полный; гласный после них темнее, но не «о».':
        'Yetti harf «qalin» oʻqiladi: tilning orqa qismi koʻtarilgan, tovush toʻliq; ulardan keyingi unli qalinroq, lekin '
        '«o» emas.',
    'ض и ظ проверяет устаз': 'ض va ظ ni ustoz tekshiradi',
    'Различие ض и ظ ИИ не оценивает — только устаз.': 'ض va ظ farqini SI baholamaydi — faqat ustoz.',
    'Четыре формы буквы': 'Harfning toʻrt shakli',
    'В слове буква меняет форму: отдельная, начальная, срединная, конечная.':
        'Soʻzda harf shaklini oʻzgartiradi: alohida, boshlangʻich, oʻrta, oxirgi.',
    'Шесть букв не соединяются слева': 'Olti harf chapga qoʻshilmaydi',
    'Буквы ا د ذ ر ز و соединяются только с предыдущей буквой, а со следующей — нет.':
        'ا د ذ ر ز و harflari faqat oldingi harf bilan qoʻshiladi, keyingisi bilan esa — yoʻq.',
    'Лям и алиф: لا': 'Lom va alif: لا',
    'Лям и алиф пишутся вместе одним знаком: لا.': 'Lom va alif birga, bitta belgi bilan yoziladi: لا.',
    'Какая из этих букв не соединяется со следующей (левой) буквой?':
        'Bu harflardan qaysi biri keyingi (chapdagi) harfga qoʻshilmaydi?',
    'Не соединяются со следующей буквой шесть букв: ا د ذ ر ز و.': 'Keyingi harfga olti harf qoʻshilmaydi: ا د ذ ر ز و.',
    'Тренировочная К1': 'Mashq K1',
    'Повторяем весь буквенный блок: 28 букв, формы, пары и слова уроков 1–15. Это тренировочный вариант: настоящая К1 — с проверкой голосом, два прохождения в разные дни.':
        'Butun harflar boʻlimini takrorlaymiz: 28 harf, shakllar, juftliklar va 1–15-darslar soʻzlari. Bu — mashq '
        'varianti: haqiqiy K1 — ovoz bilan tekshiriladi, turli kunlarda ikki marta oʻtiladi.',
    'Тренировочный вариант без проверки голосом. Контрольной К1 он не засчитывается.':
        'Ovoz bilan tekshiruvsiz mashq varianti. U K1 nazorati sifatida hisobga olinmaydi.',
}

# Примеры объяснений на аль-Фатихе (каталог ошибок §13): (русский текст-источник после сборки, шаблон uz).
# {W} — слово аята дословно из копии Tanzil для показа, {L} — ступени лестницы через « — » (из русского текста).
ПРИМЕРЫ = {
    'fat-1': ('В слове ٱلْحَمْدُ буква х̣а (ح) прозвучала как «х»: «аль-хамду». Гладкий выдох из середины горла, без хрипа — '
              'как будто дышите на стекло очков. Повторите: حَ — حَمْ — ٱلْحَمْدُ.',
              'Ushbu {W} soʻzida ḥo (ح) harfi «x» boʻlib eshitildi: «al-xamdu». Tomoqning oʻrtasidan silliq nafas, xirillashsiz — '
              'xuddi koʻzoynak oynasiga nafas purkayotgandek. Takrorlang: {L}.'),
    'fat-2': ('В слове ٱلْعَٰلَمِينَ не прозвучала буква ‘айн (ع) — получилось «аламӣн», а без неё слово меняется. Звонкий '
              'звук из середины горла: горло сжимается, и «а» выходит с усилием. Повторите: عَا — ٱلْعَا — ٱلْعَٰلَمِينَ.',
              'Ushbu {W} soʻzida ayn (ع) harfi eshitilmadi — «alamīn» boʻlib qoldi, usiz esa soʻz oʻzgaradi. Tomoqning oʻrtasidan '
              'chiqadigan jarangli tovush: tomoq qisiladi va «a» kuch bilan chiqadi. Takrorlang: {L}.'),
    'fat-3': ('Проверьте себя: в слове مَٰلِكِ здесь мадд — тяните на 2 счёта, как два ваших коротких гласных подряд: «мā». В '
              'чтении Хафс здесь долгий слог.',
              'Oʻzingizni tekshiring: {W} soʻzida bu yerda madd bor — ikkita qisqa unlingiz ketma-ket kelgandek, 2 harakatga '
              'choʻzing: «mā». Hafs qiroatida bu yerda boʻgʻin uzun.'),
    'fat-4': ('Проверьте себя: послушайте, как кари читает نَعْبُدُ, и сравните со своей записью. ‘Айн — не пауза в горле, а '
              'звонкий звук: горло сжимается, и звук идёт с усилием.',
              'Oʻzingizni tekshiring: qori {W} soʻzini qanday oʻqishini tinglang va oʻz yozuvingiz bilan solishtiring. Ayn — '
              'tomoqdagi pauza emas, jarangli tovush: tomoq qisiladi va tovush kuch bilan chiqadi.'),
    'fat-5': ('В слове ٱهْدِنَا не прозвучала буква һа (ه) — получилось «иддина». Лёгкий выдох из глубины горла; после него '
              'сразу «ди». Повторите: إِهْ — ٱهْدِ — ٱهْدِنَا.',
              'Ushbu {W} soʻzida ha (ه) harfi eshitilmadi — «iddina» boʻlib qoldi. Tomoq tubidan yengil nafas; undan keyin darhol '
              '«di». Takrorlang: {L}.'),
    'fat-6': ('В слове أَنْعَمْتَ на букве та (ت) — фатха («-та»), а прозвучало «-ту». От огласовки здесь зависит смысл: '
              'меняется лицо — «Ты» превращается в «я». Повторите: تَ — عَمْتَ — أَنْعَمْتَ.',
              'Ushbu {W} soʻzida to (ت) harfida — fatha («-ta»), eshitilgani esa «-tu». Bu yerda maʼno harakatga bogʻliq: shaxs '
              'oʻzgaradi — «Sen» «men»ga aylanadi. Takrorlang: {L}.'),
    'fat-7': ('Здесь мадд лязим: после алифа идёт буква с шаддой, тянется на 6 счётов. У вас около 2. В упражнении тяните, '
              'пока полоска не заполнится.',
              'Bu yerda lozim madd: alifdan keyin shaddali harf keladi, 6 harakatga choʻziladi. Sizda taxminan 2. Mashqda '
              'chiziq toʻlguncha choʻzing.'),
}
