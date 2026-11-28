/**
 * Реестр экранов: имя маршрута (engine/routes.ts) → компонент.
 * Каждый экран — отдельный файл; компонент получает { параметры } своего маршрута.
 * Новый экран: маршрут в routes.ts → файл здесь → строка в ЭКРАНЫ (typecheck проверит полноту).
 */
import { lazy, type ComponentType } from 'react';
import type { ИмяЭкрана, ПропсыЭкрана } from '../engine/routes';
import { ОПроекте } from './AboutScreen';
import { КартаКурса } from './CourseMapScreen';
import { Главная } from './HomeScreen';
import { Хадисы } from './HadithScreen';
import { РазделХадисов } from './HadithCategoryScreen';
import { Хадис } from './HadithItemScreen';
import { КакОбъясняем } from './HowWeExplainScreen';
import { Урок0 } from './Lesson0Screen';
import { Урок } from './LessonScreen';
import { Лицензии } from './LicensesScreen';
import { Ещё } from './MoreScreen';
import { Онбординг } from './OnboardingScreen';
import { ГородНамаза } from './PrayerCityScreen';
import { ВремяНамаза } from './PrayerTimesScreen';
import { Кибла } from './QiblaScreen';
import { Коран } from './QuranScreen';
import { ПроверкаАята } from './AyahCheckScreen';
import { Сура } from './SuraScreen';
import { Установка } from './InstallScreen';
import { Уведомления } from './NotificationsScreen';
import { Дуа, Зикры } from './DhikrScreen';
import { СчётчикЗикра } from './DhikrCounterScreen';
import { Махраджи } from './MakharijScreen';
import { БукваМахраджаЭкран } from './MakharijLetterScreen';
import { РазделНамаза, УчимсяНамазу } from './NamazLearnScreen';

// Чат AI Ustaz (владелец 27.11.2026) — отдельным чанком: грузится при первом открытии центра меню (App.tsx — Suspense).
const СпроситьУстаза = lazy(() => import('./AskScreen').then((м) => ({ default: м.СпроситьУстаза })));
// Закят (владелец 28.11.2026) — тоже отдельным чанком: калькулятор и его словари на 4 языках не утяжеляют главную.
const Закят = lazy(() => import('./ZakatScreen').then((м) => ({ default: м.Закят })));
// Вход и прогресс (владелец 28.11.2026) — отдельным чанком вместе с синхронизацией и слиянием (account/).
const Аккаунт = lazy(() => import('../account/account').then((м) => ({ default: м.Аккаунт })));

export const ЭКРАНЫ: { [K in ИмяЭкрана]: ComponentType<ПропсыЭкрана<K>> } = {
  главная: Главная,
  онбординг: Онбординг,
  урок0: Урок0,
  картаКурса: КартаКурса,
  урок: Урок,
  какОбъясняем: КакОбъясняем,
  оПроекте: ОПроекте,
  лицензии: Лицензии,
  кибла: Кибла,
  намаз: ВремяНамаза,
  городНамаза: ГородНамаза,
  коран: Коран,
  сура: Сура,
  проверкаАята: ПроверкаАята,
  хадисы: Хадисы,
  разделХадисов: РазделХадисов,
  хадис: Хадис,
  устаз: СпроситьУстаза,
  зикры: Зикры,
  дуа: Дуа,
  зикр: СчётчикЗикра,
  махраджи: Махраджи,
  букваМахраджа: БукваМахраджаЭкран,
  учимсяНамазу: УчимсяНамазу,
  разделНамаза: РазделНамаза,
  закят: Закят,
  ещё: Ещё,
  аккаунт: Аккаунт,
  установка: Установка,
  уведомления: Уведомления,
};
