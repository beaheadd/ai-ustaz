/**
 * SVG-примитивы дизайн-системы — веб: обычные элементы <svg> браузера через react-dom.
 * Контракт и список свойств — в svg.tsx (нативная версия на react-native-svg).
 * React DOM сам переводит strokeWidth → stroke-width, stopColor → stop-color и т. д.;
 * пространство имён SVG ставит браузер (элементы внутри <svg>). Ни одного внешнего запроса.
 */
import { createElement, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Свойства = { children?: ReactNode; [имя: string]: unknown };

function элемент(тег: string) {
  const Компонент = ({ children, ...свойства }: Свойства) => createElement(тег, свойства, children);
  Компонент.displayName = тег;
  return Компонент;
}

export function Svg({ children, style, ...свойства }: Свойства & { style?: StyleProp<ViewStyle> }) {
  const плоский = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  return createElement('svg', { ...свойства, style: { display: 'block', flexShrink: 0, ...плоский } }, children);
}

export const G = элемент('g');
export const Path = элемент('path');
export const Circle = элемент('circle');
export const Rect = элемент('rect');
export const Defs = элемент('defs');
export const RadialGradient = элемент('radialGradient');
export const Stop = элемент('stop');
export const Pattern = элемент('pattern');
export const ClipPath = элемент('clipPath');
