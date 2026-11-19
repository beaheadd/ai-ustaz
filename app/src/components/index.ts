/**
 * Общие компоненты — единая точка импорта: import { Экран, Кнопка } from '../components';
 * Пропсы каждого — в шапке его файла и в app/ARCHITECTURE.md (раздел «Дизайн-система»).
 * Новые экраны собираются только из этих компонентов и токенов темы (docs/дизайн/03-дизайн-система.md).
 */
export { АрабскийТекст, type РазмерАрабского, type СвойстваАрабского } from './ArabicText';
export { Плашка, type ВидПлашкиМетки, type СвойстваПлашки } from './Badge';
export { Кнопка, type ВидКнопки, type СвойстваКнопки } from './Button';
export { Карточка, type ВидКарточки, type СвойстваКарточки } from './Card';
export { Значок, ИМЕНА_ЗНАЧКОВ, ЗНАЧКИ_НАМАЗА, этоЗначок, type ИмяЗначка, type СвойстваЗначка } from './Icon';
export { ПереключательЯзыка } from './LanguageSwitch';
export { ПрогрессУрока } from './LessonProgress';
export { СтрокаСписка, type СвойстваСтроки } from './ListRow';
export { ПояснениеМикрофона } from './MicPrivacyNotice';
export { Орнамент, ОрнаментПолоса, type ВидОрнамента, type СвойстваОрнамента, type СвойстваПолосы } from './Ornament';
export { ПлашкаПрототипа, type ВидПлашки } from './PrototypeBanner';
export { ПанельЗаписи, type СвойстваПанелиЗаписи } from './RecordPanel';
export { НижнееМеню, ВЫСОТА_МЕНЮ } from './BottomNav';
export { Экран, useПрокрутка, прокрутитьЭкранВверх, type СвойстваЭкрана } from './Screen';
export { Вкладки, type Вкладка, type СвойстваВкладок } from './Tabs';
export { Текст, стильТекста, type ВидТекста, type СвойстваТекста } from './Text';
export { ПереключательТемы } from './ThemeSwitch';
export { ЭмблемаУстаза, type ВариантЭмблемы, type СвойстваЭмблемы, type СостояниеЭмблемы } from './UstazEmblem';
export { РепликаУстаза, type СвойстваРеплики } from './UstazReply';
// Время намаза (components/prayer): «Арка дня», выбор города, «урок после намаза».
export { КарточкаНамаза, ВыборГорода, ПриглашениеПослеНамаза, useПриглашениеПослеНамаза, порядокБлоков, type СвойстваКарточкиНамаза, type СвойстваВыбораГорода, type СвойстваПриглашения } from './prayer';
