/**
 * Точка входа Expo (package.json "main"): регистрирует корневой компонент App.
 * registerRootComponent = AppRegistry.registerComponent('main', () => App) + настройка среды
 * (веб, Expo Go, нативная сборка). Логики здесь нет — она в App.tsx и src/.
 */
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
