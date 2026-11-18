/**
 * Локальное хранилище (AsyncStorage; в браузере — localStorage).
 *
 * Контракт:
 *   прочитатьJSON<T>(ключ, поУмолчанию): Promise<T>  — никогда не бросает;
 *   записатьJSON(ключ, значение): Promise<boolean>     — false, если хранилище недоступно;
 *   удалитьКлюч(ключ): Promise<void>.
 * Ключи автоматически получают префикс «aiustaz:» (на batr.kz общий origin с сайтом BATR).
 *
 * Правила: только локально, ничего не отправляется. Хранить можно только номера уроков,
 * результаты, даты и настройки — никаких персональных данных и записей голоса.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ПРЕФИКС = 'aiustaz:';

export async function прочитатьJSON<T>(ключ: string, поУмолчанию: T): Promise<T> {
  try {
    const строка = await AsyncStorage.getItem(ПРЕФИКС + ключ);
    if (строка == null) return поУмолчанию;
    return JSON.parse(строка) as T;
  } catch {
    return поУмолчанию;
  }
}

export async function записатьJSON(ключ: string, значение: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ПРЕФИКС + ключ, JSON.stringify(значение));
    return true;
  } catch {
    return false;
  }
}

export async function удалитьКлюч(ключ: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(ПРЕФИКС + ключ);
  } catch {
    // хранилище недоступно (приватный режим и т. п.) — нечего удалять
  }
}
