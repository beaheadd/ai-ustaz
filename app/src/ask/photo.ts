/**
 * Фото для вопроса в чат AI Ustaz: сжатие на телефоне до JPEG ≤ 2 МБ (стороны ≤ 1600 px) — на сервер уходит уже
 * сжатая картинка, там OCR (Tesseract) на нашем сервере в РК и фото сразу удаляется (server/ask_media.py).
 *
 * Источник: beaheadd/aialem@b72d5e5 web/src/educat/ui/AskTutor.jsx (decode, shrinkPhoto) и asktutor.js (fitSize,
 * SHRINK_STEPS) — переписано на TypeScript; изменено: на выходе Blob (canvas.toBlob), а не data-URL; первая ступень
 * 1600 px (мелкий арабский шрифт мусхафа для OCR). docs/источники-кода.md.
 */
export const ФОТО_МАКС_БАЙТ = 2_000_000;
const СТУПЕНИ: readonly (readonly [number, number])[] = [
  [1600, 0.85],
  [1600, 0.7],
  [1280, 0.7],
  [1024, 0.65],
  [900, 0.6],
];

/** Вписать w×h в квадрат «макс» (без увеличения). */
export function вписать(w: number, h: number, макс: number): { w: number; h: number } {
  if (!w || !h) return { w: 0, h: 0 };
  const k = Math.min(1, макс / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

async function раскрыть(файл: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(файл, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* старый браузер — через <img> */
    }
  }
  const адрес = URL.createObjectURL(файл);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((ок, нет) => {
      img.onload = ок;
      img.onerror = нет;
      img.src = адрес;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(адрес), 1000);
  }
}

export async function сжатьФото(файл: Blob): Promise<Blob> {
  const img = await раскрыть(файл);
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih) throw new Error('пусто');
  let итог: Blob | null = null;
  for (const [сторона, качество] of СТУПЕНИ) {
    const { w, h } = вписать(iw, ih, сторона);
    const холст = document.createElement('canvas');
    холст.width = w;
    холст.height = h;
    const к = холст.getContext('2d');
    if (!к) throw new Error('холст');
    к.fillStyle = '#fff';
    к.fillRect(0, 0, w, h);
    к.drawImage(img as CanvasImageSource, 0, 0, w, h);
    итог = await new Promise<Blob | null>((ок) => холст.toBlob(ок, 'image/jpeg', качество));
    if (итог && итог.size <= ФОТО_МАКС_БАЙТ) break;
  }
  try {
    (img as ImageBitmap).close?.();
  } catch {
    /* ок */
  }
  if (!итог || итог.size > ФОТО_МАКС_БАЙТ) throw new Error('большое');
  return итог;
}
