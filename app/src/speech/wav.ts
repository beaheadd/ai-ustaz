/**
 * Запись → WAV 16 кГц моно PCM16 для речевого сервиса — ИНТЕРФЕЙС. Реализации:
 *   wav.web.ts    — браузер: decodeAudioData в OfflineAudioContext(1, …, 16000) + speech/wavEncode.ts;
 *   wav.native.ts — Android/iOS: заглушка (записи на телефоне ещё нет, TODO: expo-audio сразу в WAV 16 кГц).
 *
 * Контракт: вWav16кГц(запись: Blob) → Promise<{ wav: Blob (audio/wav), длительностьСек }>;
 *   ошибка (браузер не умеет декодировать, пустая или испорченная запись) — исключение ОшибкаПодготовкиЗаписи (speech/wavEncode.ts).
 * Ничего не отправляет по сети: отправку делает только speech/check.ts по нажатию «Проверить».
 */

export type ГотовыйWav = { wav: Blob; длительностьСек: number };

export declare function вWav16кГц(запись: Blob): Promise<ГотовыйWav>;
