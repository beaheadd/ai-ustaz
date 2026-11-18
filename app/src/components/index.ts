/**
 * Общие компоненты — единая точка импорта: import { Экран, Кнопка } from '../components';
 * Пропсы каждого — в шапке его файла и в app/ARCHITECTURE.md.
 */
export { АрабскийТекст, type РазмерАрабского, type СвойстваАрабского } from './ArabicText';
export { Кнопка, type ВидКнопки, type СвойстваКнопки } from './Button';
export { Карточка, type СвойстваКарточки } from './Card';
export { ПереключательЯзыка } from './LanguageSwitch';
export { ПрогрессУрока } from './LessonProgress';
export { ПояснениеМикрофона } from './MicPrivacyNotice';
export { ПлашкаПрототипа, type ВидПлашки } from './PrototypeBanner';
export { ПанельЗаписи, type СвойстваПанелиЗаписи } from './RecordPanel';
export { Экран, type СвойстваЭкрана } from './Screen';
export { Текст, type ВидТекста, type СвойстваТекста } from './Text';
