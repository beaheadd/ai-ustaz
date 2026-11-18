/**
 * Прогресс-бар урока: «Задание 3 из 10».
 *
 * Контракт: <ПрогрессУрока текущий={3} всего={10} подпись? />
 *   текущий — номер текущего задания (1…всего); подпись (по умолчанию true) — текст над полосой.
 * Только прогресс внутри урока: без очков, жизней и наград (CLAUDE.md, правило 9).
 */
import { View } from 'react-native';
import { useПеревод } from '../i18n';
import { useТема } from '../theme';
import { Текст } from './Text';

export function ПрогрессУрока({ текущий, всего, подпись = true }: { текущий: number; всего: number; подпись?: boolean }) {
  const { t } = useПеревод();
  const { цвет, радиус, отступ } = useТема();
  const n = Math.max(0, Math.min(текущий, всего));
  const доля = всего > 0 ? n / всего : 0;
  const надпись = t('прогресс.задание', { текущий: n, всего });
  return (
    <View style={{ gap: отступ.xs }}>
      {подпись ? <Текст вид="мелкий">{надпись}</Текст> : null}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={надпись}
        accessibilityValue={{ min: 0, max: всего, now: n }}
        style={{ height: 8, borderRadius: радиус.круг, backgroundColor: цвет.акцентМягкий, overflow: 'hidden' }}
      >
        <View style={{ width: `${Math.round(доля * 100)}%`, height: '100%', backgroundColor: цвет.акцент, borderRadius: радиус.круг }} />
      </View>
    </View>
  );
}
