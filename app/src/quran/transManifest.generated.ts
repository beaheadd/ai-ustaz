/**
 * СГЕНЕРИРОВАНО tools/quran_trans/build_translations.py — руками не править
 * (python3 -I -B tools/quran_trans/build_translations.py).
 * Перевод смыслов и тафсир по языкам: ключ издания QuranEnc.com, имя индекса (app/public/quran-trans →
 * dist/quran-trans) и его sha256. Текста переводов и Корана здесь нет. Переводы — только en, tr, id, ur, uz; тафсира нет.
 */
import type { МанифестПереводов } from './translation';

export const МАНИФЕСТ_ПЕРЕВОДОВ: МанифестПереводов = {
  формат: 1,
  переводы: {
    en: { ключ: 'english_saheeh', индекс: 'quran-trans/english_saheeh/index.7a78156fbb2eb504b3a4.json', sha256Индекса: '7a78156fbb2eb504b3a48e9f15f17edb56c5c59123213fb761c7f630bdb5752b' },
    id: { ключ: 'indonesian_affairs', индекс: 'quran-trans/indonesian_affairs/index.5110e4b1505f517aa717.json', sha256Индекса: '5110e4b1505f517aa717e2db0ac81501544d414f422cb348057ae138a6d1a54f' },
    tr: { ключ: 'turkish_shahin', индекс: 'quran-trans/turkish_shahin/index.ab98e3e1050ec34c488d.json', sha256Индекса: 'ab98e3e1050ec34c488d16046b7ef7c31544867fd58c798b12a6f9eca3e043b1' },
    ur: { ключ: 'urdu_junagarhi', индекс: 'quran-trans/urdu_junagarhi/index.dad42157c2a810a09aa4.json', sha256Индекса: 'dad42157c2a810a09aa45c2e6eed137abdf188301d8442aa02fd647873615444' },
    uz: { ключ: 'uzbek_mansour', индекс: 'quran-trans/uzbek_mansour/index.c0a62dfa719dbba26c9e.json', sha256Индекса: 'c0a62dfa719dbba26c9ecce31532b90908329458c5fed739436ba68be83a82e6' },
  },
  тафсиры: {
  },
};
