/**
 * SVG-примитивы дизайн-системы — нативная сборка: react-native-svg (MIT, версия SDK 58).
 * Веб — svg.web.tsx: те же имена, но обычные элементы <svg> браузера (react-dom), без react-native-svg:
 * его веб-часть с разбором transform и Animated весит ~230 КБ и не влезает в бюджет check-dist.
 *
 * Контракт: Svg, G, Path, Circle, Rect, Defs, RadialGradient, Stop, Pattern, ClipPath — подмножество
 * react-native-svg. Использовать только эти свойства (их понимают обе реализации):
 *   Svg: width, height, viewBox, style (только position/left/top);
 *   G / Path / Circle / Rect: d, cx, cy, r, x, y, width, height, rx, transform (строка), fill, stroke,
 *     strokeWidth, strokeLinecap, strokeLinejoin, opacity, clipPath (строка url(#…));
 *   RadialGradient: id, gradientUnits, cx, cy, r, fx, fy; Stop: offset, stopColor, stopOpacity;
 *   Pattern: id, patternUnits, x, width, height; ClipPath: id.
 * Экраны эти примитивы не используют напрямую — только компоненты дизайн-системы (Значок, Орнамент, …).
 */
export { default as Svg, Circle, ClipPath, Defs, Ellipse, G, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
