/**
 * Включена ли проверка голосом. ВЫКЛЮЧЕНА ПО УМОЛЧАНИЮ.
 *
 * Решение владельца и лицензия QML (CLAUDE.md, «Чужие зоны»; speech/README.md): проверка голосом моделью
 * quran-muaalem работает ТОЛЬКО на своём домене AI Ustaz, НИКОГДА на batr.kz (там реклама и платное вокруг).
 *
 * Включена, только если ОДНОВРЕМЕННО:
 *   (а) сборка с флагом: EXPO_PUBLIC_SPEECH_CHECK=1 в окружении `expo export` (Expo вшивает переменные
 *       EXPO_PUBLIC_* в бандл при сборке; без флага — обычная сборка для batr.kz/aiustaz);
 *   (б) страница открыта НЕ на batr.kz и не на его поддоменах (www.batr.kz, analytics.batr.kz, …) —
 *       на batr.kz всегда false, даже если туда по ошибке выложат сборку с флагом;
 *   (в) есть window.location (веб). Локальная разработка — localhost/127.0.0.1 с тем же флагом.
 *
 * Контракт:
 *   проверкаРазрешенаДля(хост, флаг) → boolean — чистая функция (тест: scripts/test-speech.mjs);
 *   проверкаГолосомВключена() → boolean — для экранов (хост — location.hostname, флаг — из сборки).
 * Без импортов: файл проверяется в node.
 */

export function проверкаРазрешенаДля(хост: string, флаг: string | undefined): boolean {
  if (флаг !== '1') return false;
  const х = String(хост ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (!х) return false;
  if (х === 'batr.kz' || х.endsWith('.batr.kz')) return false;
  return true;
}

/** Флаг сборки. Обращение — строго `process.env.EXPO_PUBLIC_SPEECH_CHECK`: Expo заменяет именно это выражение. */
function флагСборки(): string | undefined {
  try {
    return process.env.EXPO_PUBLIC_SPEECH_CHECK;
  } catch {
    return undefined; // нет process в среде — значит, флага нет
  }
}

export function проверкаГолосомВключена(): boolean {
  if (typeof window === 'undefined' || typeof window.location?.hostname !== 'string') return false;
  return проверкаРазрешенаДля(window.location.hostname, флагСборки());
}
