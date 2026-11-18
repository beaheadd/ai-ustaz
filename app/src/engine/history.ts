/**
 * Связь стека навигации с платформой — НАТИВНАЯ версия (Android/iOS).
 * Веб-версия — history.web.ts (Metro выбирает её сам по расширению .web.ts).
 *
 * Контракт (одинаковый для обеих версий; используется только из engine/navigation.ts):
 *   прочитатьНачальныйСтек(): string[] | null — стек hash-адресов при запуске (null — начать с главной);
 *   записатьСтек(стек, способ): void            — отразить новый стек ('push' | 'replace');
 *   шагНазад(шагов): boolean                    — true: платформа сама вернётся и сообщит через подписку;
 *                                                 false: навигация меняет стек сама;
 *   подписатьсяНаИсторию(обработчик): отписка   — обработчик(стек | null, hash) при «назад/вперёд» платформы;
 *   подписатьсяНаКнопкуНазад(обработчик): отписка — системная кнопка «назад» (Android);
 *                                                 обработчик возвращает true, если событие обработано.
 */
import { BackHandler } from 'react-native';

export function прочитатьНачальныйСтек(): string[] | null {
  return null;
}

export function записатьСтек(_стек: readonly string[], _способ: 'push' | 'replace'): void {
  // На телефоне адресной строки нет — стек живёт только в состоянии навигации.
}

export function шагНазад(_шагов: number): boolean {
  return false;
}

export function подписатьсяНаИсторию(_обработчик: (стек: string[] | null, хэш: string) => void): () => void {
  return () => {};
}

export function подписатьсяНаКнопкуНазад(обработчик: () => boolean): () => void {
  const подписка = BackHandler.addEventListener('hardwareBackPress', обработчик);
  return () => подписка.remove();
}
