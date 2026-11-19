/**
 * Запись → WAV 16 кГц моно PCM16 — БРАУЗЕР. Интерфейс — speech/wav.ts.
 *
 * Как: Blob записи (webm/opus, ogg/opus, mp4/aac — что выбрал MediaRecorder) → arrayBuffer →
 * decodeAudioData в OfflineAudioContext(1, 1, 16000): браузер сам декодирует и пересчитывает частоту
 * в 16 кГц своим качественным ресемплером → каналы усредняются в моно → PCM16 (speech/wavEncode.ts).
 * Всё в памяти страницы; ничего не сохраняется и не отправляется (отправка — только speech/check.ts).
 */
import type * as Интерфейс from './wav';
import { ЧАСТОТА_ПРОВЕРКИ, ОшибкаПодготовкиЗаписи, закодироватьWav, смешатьВМоно } from './wavEncode';

type КонструкторОфлайн = typeof OfflineAudioContext;

function конструкторОфлайн(): КонструкторОфлайн | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { OfflineAudioContext?: КонструкторОфлайн; webkitOfflineAudioContext?: КонструкторОфлайн };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

/** decodeAudioData и в форме с обратными вызовами (старый Safari), и в форме промиса. */
function декодировать(контекст: OfflineAudioContext, байты: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((готово, ошибка) => {
    try {
      const п = контекст.decodeAudioData(байты, готово, (е) => ошибка(е ?? new Error('decodeAudioData')));
      if (п && typeof п.then === 'function') п.then(готово, ошибка);
    } catch (е) {
      ошибка(е);
    }
  });
}

export const вWav16кГц: typeof Интерфейс.вWav16кГц = async (запись) => {
  const Офлайн = конструкторОфлайн();
  if (!Офлайн) throw new ОшибкаПодготовкиЗаписи('браузер не умеет декодировать звук (нет OfflineAudioContext)');
  if (!запись || запись.size === 0) throw new ОшибкаПодготовкиЗаписи('пустая запись');
  let буфер: AudioBuffer;
  try {
    const контекст = new Офлайн(1, 1, ЧАСТОТА_ПРОВЕРКИ);
    буфер = await декодировать(контекст, await запись.arrayBuffer());
  } catch (е) {
    throw new ОшибкаПодготовкиЗаписи(`не удалось декодировать запись: ${(е as Error)?.name ?? 'ошибка'}`);
  }
  const каналы: Float32Array[] = [];
  for (let к = 0; к < буфер.numberOfChannels; к += 1) каналы.push(буфер.getChannelData(к));
  const моно = смешатьВМоно(каналы);
  // decodeAudioData обязан отдать буфер в частоте контекста; на всякий случай проверяем.
  if (буфер.sampleRate !== ЧАСТОТА_ПРОВЕРКИ) throw new ОшибкаПодготовкиЗаписи(`частота после декодирования ${буфер.sampleRate}`);
  const wav = new Blob([закодироватьWav(моно, ЧАСТОТА_ПРОВЕРКИ)], { type: 'audio/wav' });
  return { wav, длительностьСек: моно.length / ЧАСТОТА_ПРОВЕРКИ };
};
