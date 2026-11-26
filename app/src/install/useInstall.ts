/**
 * Хуки установки AI Ustaz на телефон (экран #/install и строка на главной).
 *
 * Контракт:
 *   useУстановка() → { среда, сценарий, естьПредложение, предложить } — среда и сценарий (install/platform.ts)
 *     пересчитываются, когда приходит beforeinstallprompt или appinstalled; предложить() — системное окно Chrome.
 *   useБаннерУстановки() → { показать, скрыть } — баннер вверху главной (components/InstallHint.tsx): на телефоне,
 *     на aiustaz.pro или batr.kz, пока приложение не установлено и баннер не закрыт «×» (ключ aiustaz:install-banner.v1
 *     — только отметка «закрыт», без личных данных). Установили — баннер уходит сам (среда.установлено / appinstalled).
 * Решения владельца 19.11.2026 (установка на экран «Домой») и 26.11.2026 («кнопку установить прям наверху времени
 * намаза поставь… X нажимает — уходит, если устанавливает — тоже уходит»).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { прочитатьJSON, записатьJSON } from '../engine/storage';
import { естьПредложение, подписаться, предложитьУстановку, прочитатьСреду, версия } from './browser';
import { сценарий, этоТелефон, type Сценарий, type Среда } from './platform';

export const КЛЮЧ_БАННЕРА = 'install-banner.v1';

export function useУстановка(): {
  среда: Среда;
  сценарий: Сценарий;
  естьПредложение: boolean;
  предложить: () => Promise<'принято' | 'отклонено' | 'недоступно'>;
} {
  const в = useSyncExternalStore(подписаться, версия, версия);
  return useMemo(() => {
    const среда = прочитатьСреду();
    const есть = естьПредложение();
    return { среда, сценарий: сценарий(среда, есть), естьПредложение: есть, предложить: предложитьУстановку };
    // в — номер изменения: пересчитать после beforeinstallprompt / appinstalled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [в]);
}

export function useБаннерУстановки(): { показать: boolean; скрыть: () => void } {
  const { среда } = useУстановка();
  const [закрыт, установитьЗакрыт] = useState(true);
  useEffect(() => {
    let жив = true;
    void прочитатьJSON<{ закрыт?: boolean } | null>(КЛЮЧ_БАННЕРА, null).then((з) => {
      if (жив) установитьЗакрыт(з?.закрыт === true);
    });
    return () => {
      жив = false;
    };
  }, []);
  const скрыть = useCallback(() => {
    установитьЗакрыт(true);
    void записатьJSON(КЛЮЧ_БАННЕРА, { закрыт: true });
  }, []);
  const показать = !закрыт && (среда.хост === 'свой' || среда.хост === 'batr') && этоТелефон(среда) && !среда.установлено;
  return { показать, скрыть };
}
