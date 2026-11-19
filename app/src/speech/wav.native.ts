/**
 * Запись → WAV — Android/iOS. ЗАГЛУШКА: записи на телефоне в прототипе нет (speech/record.native.ts).
 * TODO(expo-audio): писать сразу WAV 16 кГц моно (RecordingPresets с LINEARPCM) и отдавать файл как есть.
 */
import type * as Интерфейс from './wav';
import { ОшибкаПодготовкиЗаписи } from './wavEncode';

export const вWav16кГц: typeof Интерфейс.вWav16кГц = async () => {
  throw new ОшибкаПодготовкиЗаписи('на телефоне подготовка записи ещё не сделана');
};
