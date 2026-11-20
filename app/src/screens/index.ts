/**
 * Реестр экранов: имя маршрута (engine/routes.ts) → компонент.
 * Каждый экран — отдельный файл; компонент получает { параметры } своего маршрута.
 * Новый экран: маршрут в routes.ts → файл здесь → строка в ЭКРАНЫ (typecheck проверит полноту).
 */
import type { ComponentType } from 'react';
import type { ИмяЭкрана, ПропсыЭкрана } from '../engine/routes';
import { ОПроекте } from './AboutScreen';
import { КартаКурса } from './CourseMapScreen';
import { Главная } from './HomeScreen';
import { Хадисы } from './HadithScreen';
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
import { СпроситьУстаза } from './AskScreen';

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
  устаз: СпроситьУстаза,
  ещё: Ещё,
  установка: Установка,
  уведомления: Уведомления,
};
