/**
 * Слой «Сообщить об ошибке» (App.tsx, над экраном): чип «⚠ Ошибка» у выделенного текста и лист сообщения.
 *
 * Владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“. И написать, какая там ошибка».
 * - Веб: выделили текст где угодно (Коран, хадис, зикр, урок, время намаза, ответ чата) — по selectionchange рядом с
 *   выделением (ниже, а у низа экрана — выше) появляется чип «⚠ Ошибка»; выделение снято — чип уходит (с задержкой,
 *   чтобы нажатие на сам чип успело). Нажатие — лист с цитатой (≤ 500 символов). В полях ввода и в самом листе чипа нет.
 * - Без выделения: сообщитьОбОшибке() из «Ещё», меню суры и хадиса, листа аята (feedback/core.ts).
 * - Лист (FeedbackSheet.tsx) — отдельный ленивый чанк: грузится при первом открытии, в основном чанке только чип.
 * testID: ошибка-чип, ошибка-лист (в листе).
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useНавигация } from '../engine/navigation';
import { useПеревод } from '../i18n';
import { useТема } from '../theme';
import { Текст } from '../components/Text';
import { слушатьСообщения, type ЗапросСообщения } from './core';

const ЛистСообщения = lazy(() => import('./FeedbackSheet').then((м) => ({ default: м.ЛистСообщения })));

const НАДПИСЬ: Record<string, string> = { ru: 'Ошибка', kk: 'Қате', uz: 'Xato', en: 'Mistake' };
const ПОДПИСЬ: Record<string, string> = {
  ru: 'Сообщить об ошибке в выделенном тексте',
  kk: 'Белгіленген мәтіндегі қате туралы хабарлау',
  uz: 'Belgilangan matndagi xato haqida xabar berish',
  en: 'Report a mistake in the selected text',
};
const ШИРИНА_ЧИПА = 124;
const ВЫСОТА_ЧИПА = 44;
const МАКС_ЦИТАТА = 500;

type Чип = { цитата: string; x: number; y: number };

export function СлойСообщения() {
  const { язык } = useПеревод();
  const { цвет, отступ, тень } = useТема();
  const { текущий } = useНавигация();
  const [чип, установитьЧип] = useState<Чип | null>(null);
  const [открыт, установитьОткрыт] = useState<ЗапросСообщения | null>(null);
  const открытСсылка = useRef(false);
  открытСсылка.current = открыт !== null;

  useEffect(() => слушатьСообщения((з) => {
    установитьЧип(null);
    установитьОткрыт(з);
  }), []);

  // Сменился экран («назад» браузера, ссылка) — чип и лист прочь: сообщение относится к прежнему экрану.
  useEffect(() => {
    установитьЧип(null);
    установитьОткрыт(null);
  }, [текущий.ключ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let таймер: ReturnType<typeof setTimeout> | undefined;
    const спрятать = () => {
      clearTimeout(таймер);
      таймер = setTimeout(() => установитьЧип(null), 600);
    };
    const приВыделении = () => {
      if (открытСсылка.current) return;
      const в = document.getSelection();
      const текст = в && !в.isCollapsed && в.rangeCount ? в.toString().replace(/\s+/g, ' ').trim() : '';
      if (текст.length < 2) return спрятать();
      const узел = в!.anchorNode;
      const эл = узел instanceof Element ? узел : узел?.parentElement;
      if (!эл || эл.closest('input, textarea, [contenteditable="true"], [data-testid="ошибка-лист"]')) return спрятать();
      const п = в!.getRangeAt(0).getBoundingClientRect();
      const ш = window.innerWidth;
      const в_ = window.innerHeight;
      if (п.bottom < 0 || п.top > в_) return установитьЧип(null); // прокрутили — выделение за краем окна
      const x = Math.max(8, Math.min(ш - ШИРИНА_ЧИПА - 8, п.left + п.width / 2 - ШИРИНА_ЧИПА / 2));
      // Ниже выделения (у Android над ним — системное меню «Копировать»); у низа экрана (меню, плеер) — выше.
      let y = п.bottom + 10;
      if (y + ВЫСОТА_ЧИПА > в_ - 140) y = п.top - ВЫСОТА_ЧИПА - 10;
      y = Math.max(8, Math.min(в_ - ВЫСОТА_ЧИПА - 8, y));
      clearTimeout(таймер);
      установитьЧип({ цитата: текст.slice(0, МАКС_ЦИТАТА), x, y });
    };
    // Прокрутка: выделение едет вместе с текстом — чип за ним (не чаще кадра).
    let кадр = 0;
    const приПрокрутке = () => {
      if (кадр) return;
      кадр = requestAnimationFrame(() => {
        кадр = 0;
        приВыделении();
      });
    };
    document.addEventListener('selectionchange', приВыделении);
    document.addEventListener('scroll', приПрокрутке, true);
    return () => {
      clearTimeout(таймер);
      cancelAnimationFrame(кадр);
      document.removeEventListener('selectionchange', приВыделении);
      document.removeEventListener('scroll', приПрокрутке, true);
    };
  }, []);

  return (
    <>
      {чип && !открыт ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ПОДПИСЬ[язык] ?? ПОДПИСЬ.en}
          onPress={() => {
            установитьОткрыт({ цитата: чип.цитата });
            установитьЧип(null);
            try {
              document.getSelection()?.removeAllRanges();
            } catch {
              // нечего снимать
            }
          }}
          testID="ошибка-чип"
          style={({ pressed }) => ({
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
            left: чип.x,
            top: чип.y,
            width: ШИРИНА_ЧИПА,
            height: ВЫСОТА_ЧИПА,
            borderRadius: ВЫСОТА_ЧИПА / 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: отступ.xs,
            backgroundColor: pressed ? цвет.акцентНажат : цвет.акцент,
            zIndex: 50,
            ...тень(2),
          })}
        >
          <Текст цвет={цвет.акцентТекст} стиль={{ fontWeight: '600' }} selectable={false}>
            {'⚠ ' + (НАДПИСЬ[язык] ?? НАДПИСЬ.en)}
          </Текст>
        </Pressable>
      ) : null}
      {открыт ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }} pointerEvents="box-none">
          <Suspense fallback={null}>
            <ЛистСообщения запрос={открыт} закрыть={() => установитьОткрыт(null)} />
          </Suspense>
        </View>
      ) : null}
    </>
  );
}
