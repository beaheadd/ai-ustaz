/**
 * WAV PCM16 моно — ЧИСТЫЕ функции (без браузера и без импортов: их проверяет scripts/test-speech.mjs в node).
 * Используются в speech/wav.web.ts: запись MediaRecorder (webm/ogg/mp4) → decodeAudioData на 16 кГц →
 * смешатьВМоно → закодироватьWav → в речевой сервис (POST /api/speech/v1/proverka, поле audio).
 *
 * Контракт:
 *   ЧАСТОТА_ПРОВЕРКИ = 16000 — частота, которую ждёт речевой сервис (speech/aiustaz_speech/audio.py);
 *   смешатьВМоно(каналы: Float32Array[]) → Float32Array — среднее каналов (один канал — копия);
 *   закодироватьWav(отсчёты, частота) → ArrayBuffer — RIFF/WAVE, PCM 16 бит, 1 канал, little-endian;
 *     значения вне [-1, 1] обрезаются, NaN/∞ → 0;
 *   ОшибкаПодготовкиЗаписи — исключение wav.web.ts (здесь, а не в wav.ts: Metro подставляет вместо './wav'
 *     платформенный файл, и общий класс должен жить в файле без платформенных вариантов).
 */

export class ОшибкаПодготовкиЗаписи extends Error {
  constructor(сообщение: string) {
    super(сообщение);
    this.name = 'ОшибкаПодготовкиЗаписи';
  }
}

export const ЧАСТОТА_ПРОВЕРКИ = 16_000;

export function смешатьВМоно(каналы: readonly Float32Array[]): Float32Array {
  if (каналы.length === 0) return new Float32Array(0);
  const длина = Math.min(...каналы.map((к) => к.length));
  const итог = new Float32Array(длина);
  if (каналы.length === 1) {
    итог.set(каналы[0].subarray(0, длина));
    return итог;
  }
  for (const канал of каналы) for (let i = 0; i < длина; i += 1) итог[i] += канал[i];
  for (let i = 0; i < длина; i += 1) итог[i] /= каналы.length;
  return итог;
}

export function закодироватьWav(отсчёты: Float32Array, частота: number): ArrayBuffer {
  if (!Number.isInteger(частота) || частота <= 0) throw new RangeError('частота должна быть целым числом > 0');
  const байтДанных = отсчёты.length * 2;
  const буфер = new ArrayBuffer(44 + байтДанных);
  const в = new DataView(буфер);
  const строка = (смещение: number, т: string) => {
    for (let i = 0; i < т.length; i += 1) в.setUint8(смещение + i, т.charCodeAt(i));
  };
  строка(0, 'RIFF');
  в.setUint32(4, 36 + байтДанных, true);
  строка(8, 'WAVE');
  строка(12, 'fmt ');
  в.setUint32(16, 16, true); // размер блока fmt
  в.setUint16(20, 1, true); // PCM
  в.setUint16(22, 1, true); // моно
  в.setUint32(24, частота, true);
  в.setUint32(28, частота * 2, true); // байт в секунду
  в.setUint16(32, 2, true); // байт на отсчёт
  в.setUint16(34, 16, true); // бит на отсчёт
  строка(36, 'data');
  в.setUint32(40, байтДанных, true);
  for (let i = 0; i < отсчёты.length; i += 1) {
    const x = отсчёты[i];
    const с = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    в.setInt16(44 + i * 2, с < 0 ? Math.round(с * 0x8000) : Math.round(с * 0x7fff), true);
  }
  return буфер;
}
