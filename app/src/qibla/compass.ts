/**
 * Компас в браузере: разрешение (iOS — только по нажатию), подписка на события ориентации, сглаживание,
 * поправка на склонение, честное «компаса нет» по таймауту. Окно передаётся параметром — тест в node
 * без браузера (scripts/test-qibla.mjs).
 *
 * Контракт:
 *   нуженЗапросРазрешения(окно) → есть DeviceOrientationEvent.requestPermission (iOS 13+; в новых Chrome тоже) И экран
 *       сенсорный (navigator.maxTouchPoints > 0): показать «Включить компас». На ноутбуке без сенсора — нет
 *       (компаса там нет, кнопка только сбила бы с толку).
 *   естьСобытияОриентации(окно) → есть ли DeviceOrientationEvent вообще (нет — нативно, старые браузеры)
 *   запроситьДоступКомпаса(окно) → Promise<'разрешено' | 'отказ' | 'нет-датчика'>
 *       ВЫЗЫВАТЬ ПРЯМО ИЗ ОБРАБОТЧИКА НАЖАТИЯ, без await перед ним: iOS иначе отклоняет запрос молча.
 *   слушатьКомпас(окно, приДанных, { склонение, таймаутМс = 3000 }) → остановить()
 *       приДанных({ состояние: 'есть', курсМагнитный, курсИстинный, точность, разброс, вертикально, источник })
 *       приДанных({ состояние: 'нет-компаса' }) — за таймаут ни одного события с абсолютным курсом
 *         (ноутбук, Chrome без датчика, отказ). Слушать продолжает: придёт курс позже — будет 'есть'.
 * Платформы: iOS Safari — deviceorientation с webkitCompassHeading; Android Chrome — deviceorientationabsolute
 * (относительное deviceorientation отбрасывается). Оба курса — магнитные, склонение прибавляем всегда.
 * Ничего не отправляет и не сохраняет; геолокация не нужна (склонение — из выбранного города).
 * Нативно (без DeviceOrientationEvent) — 'нет-датчика' и схема; TODO: expo-sensors / expo-location heading.
 */
import { истинныйКурс, курсИзСобытия, новыйСглаживатель, уголЭкрана, type ИсточникКурса, type ОкноОриентации, type СобытиеОриентации } from './qibla';

/** Окно браузера в объёме, нужном компасу (в тестах — EventTarget с полями). */
export type ОкноКомпаса = ОкноОриентации & {
  addEventListener: (тип: string, обработчик: (е: Event) => void) => void;
  removeEventListener: (тип: string, обработчик: (е: Event) => void) => void;
  DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } | (abstract new (...а: never[]) => unknown);
  ondeviceorientationabsolute?: unknown;
  navigator?: { maxTouchPoints?: number };
};

export type ДанныеКомпаса =
  | {
      состояние: 'есть';
      курсМагнитный: number;
      курсИстинный: number;
      точность: number | null;
      разброс: number;
      вертикально: boolean;
      источник: ИсточникКурса;
    }
  | { состояние: 'нет-компаса' };

type КлассСобытия = { requestPermission?: () => Promise<string> };

function классСобытия(окно: ОкноКомпаса | null | undefined): КлассСобытия | null {
  const D = окно?.DeviceOrientationEvent as unknown;
  return D ? (D as КлассСобытия) : null;
}

export function естьСобытияОриентации(окно: ОкноКомпаса | null | undefined): boolean {
  return классСобытия(окно) !== null;
}

export function нуженЗапросРазрешения(окно: ОкноКомпаса | null | undefined): boolean {
  return typeof классСобытия(окно)?.requestPermission === 'function' && (окно?.navigator?.maxTouchPoints ?? 0) > 0;
}

export async function запроситьДоступКомпаса(окно: ОкноКомпаса | null | undefined): Promise<'разрешено' | 'отказ' | 'нет-датчика'> {
  const D = классСобытия(окно);
  if (!D) return 'нет-датчика';
  if (typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted' ? 'разрешено' : 'отказ';
    } catch {
      return 'отказ';
    }
  }
  return 'разрешено'; // Android Chrome, Firefox: событие приходит без запроса (нужен HTTPS)
}

export function слушатьКомпас(
  окно: ОкноКомпаса,
  приДанных: (д: ДанныеКомпаса) => void,
  { склонение = 0, таймаутМс = 3000 }: { склонение?: number; таймаутМс?: number } = {},
): () => void {
  const сглаживатель = новыйСглаживатель(0.25);
  let былКурс = false;
  // Chrome Android шлёт и относительное deviceorientation (absolute=false), и deviceorientationabsolute;
  // курсИзСобытия отбрасывает относительное. iOS шлёт только deviceorientation с webkitCompassHeading.
  const события = ['deviceorientation'];
  if ('ondeviceorientationabsolute' in окно) события.unshift('deviceorientationabsolute');
  const обработчик = (е: Event) => {
    const к = курсИзСобытия(е as unknown as СобытиеОриентации, уголЭкрана(окно));
    if (!к) return;
    былКурс = true;
    const сглаженный = сглаживатель.добавить(к.курс);
    приДанных({
      состояние: 'есть',
      курсМагнитный: сглаженный,
      курсИстинный: истинныйКурс(сглаженный, склонение),
      точность: к.точность,
      разброс: сглаживатель.разброс(),
      вертикально: к.вертикально,
      источник: к.источник,
    });
  };
  for (const и of события) окно.addEventListener(и, обработчик);
  const таймер = setTimeout(() => {
    if (!былКурс) приДанных({ состояние: 'нет-компаса' });
  }, таймаутМс);
  return () => {
    clearTimeout(таймер);
    for (const и of события) окно.removeEventListener(и, обработчик);
  };
}
