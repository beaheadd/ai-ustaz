/**
 * Чтецы: кто есть, есть ли разрешение и условия, скачано ли на наш сервер, включён ли в приложении, кто по умолчанию.
 * Владелец 27.11.2026: «записи всех чтецов, записи должны быть там… добавляли, убирали, отключали». Изменения —
 * POST /api/admin/content/reciters (админ и владелец), каждая публикация — с версией и sha256 (server/content_admin.py).
 * Новый чтец без договора/разрешения здесь не включается: список и права — content/audio-sources.json (правило 3).
 */
import { получить, отправить, текстОшибки } from '../api.ts';
import { h, число, очистить } from '../dom.ts';
import { адресАята, зеркало, играть, стоп, чтецы, type Зеркало } from '../content.ts';
import { можно, type Я } from '../roles.ts';

type Настройки = { версия: number; sha256: string; чтецы: { включены: string[] | null; поУмолчанию: string | null } };

export async function страницаЧтецов(куда: HTMLElement, я: Я): Promise<void> {
  куда.appendChild(h('h1', null, 'Чтецы'));
  const тело = h('div');
  const сообщение = h('p', { class: 'сообщение', role: 'status', 'aria-live': 'polite' });
  куда.append(сообщение, тело);
  const нарисовать = async () => {
    const [все, зеркала, админ] = await Promise.all([чтецы(), зеркало(), получить<{ config: Настройки }>('/api/admin/content')]);
    const н = админ.config;
    очистить(тело);
    const разрешённые = все.filter((ч) => ч.разрешено);
    const включены = new Set(н.чтецы.включены ?? разрешённые.map((ч) => ч.id));
    const поУмолчанию = н.чтецы.поУмолчанию ?? разрешённые[0]?.id ?? null;
    const правка = можно(я, 'admin');
    тело.appendChild(h('p', { class: 'тихо' }, `Настройки приложения: версия ${н.версия}, sha256 `, h('code', null, н.sha256.slice(0, 12) + '…'),
      '. Приложение берёт их при запуске (до 5 минут кэша).'));
    const сохранить = async (вкл: string[], по: string | null) => {
      try {
        const о = await отправить<{ версия: number }>('/api/admin/content/reciters', { включены: вкл, поУмолчанию: по });
        сообщение.textContent = `Сохранено. Версия настроек ${о.версия}.`;
        await нарисовать();
      } catch (е) {
        сообщение.textContent = текстОшибки(е);
      }
    };
    const список = h('div', { class: 'чтецы' });
    for (const ч of все) {
      const с = ч.cdn;
      const з = с ? (зеркала as Зеркало[]).find((м) => м.edition === с.издание && м.bitrate === с.битрейт) : undefined;
      const вкл = ч.разрешено && включены.has(ч.id);
      const образец = адресАята(ч, зеркала, 1, 1, 1);
      const слушать = h('button', { type: 'button', class: 'кнопка', disabled: !образец }, '▶ аль-Фатиха 1:1');
      слушать.addEventListener('click', () => {
        if (слушать.textContent?.startsWith('■')) {
          стоп();
          слушать.textContent = '▶ аль-Фатиха 1:1';
          return;
        }
        if (образец) играть(образец, () => (слушать.textContent = '▶ аль-Фатиха 1:1'));
        слушать.textContent = '■ стоп';
      });
      const галочка = h('input', { type: 'checkbox', id: 'вкл-' + ч.id, checked: вкл, disabled: !правка || !ч.разрешено });
      галочка.addEventListener('change', () => {
        const новые = new Set(включены);
        if (галочка.checked) новые.add(ч.id);
        else новые.delete(ч.id);
        const по = поУмолчанию && новые.has(поУмолчанию) ? поУмолчанию : ([...новые][0] ?? null);
        void сохранить(разрешённые.map((р) => р.id).filter((id) => новые.has(id)), по);
      });
      const поУмолч = h('input', { type: 'radio', name: 'по-умолчанию', id: 'умолч-' + ч.id, checked: ч.id === поУмолчанию, disabled: !правка || !вкл });
      поУмолч.addEventListener('change', () => void сохранить([...включены], ч.id));
      список.appendChild(h('article', { class: 'карта чтец' + (вкл ? '' : ' выкл') },
        h('div', { class: 'чтец-шапка' },
          h('h2', null, ч.кари.ru, ч.кари.ar ? h('span', { class: 'араб', lang: 'ar', dir: 'rtl' }, ' ' + ч.кари.ar) : null),
          ч.разрешено ? h('span', { class: 'метка хорошо' }, 'разрешено') : h('span', { class: 'метка' }, 'нет разрешения')),
        h('dl', { class: 'свойства' },
          h('dt', null, 'Источник'), h('dd', null, с ? `AlQuran Cloud: ${с.издание}, ${с.битрейт} кбит/с` : ч.база ? `свой сервер: ${ч.база}` : '—'),
          h('dt', null, 'На нашем сервере'), h('dd', null, з ? `${з.count === 6236 ? 'весь Коран' : `${число(з.count)} из 6236`} · ${число(Math.round(з.bytes / 1048576))} МБ` : 'ещё не скачан — играет с CDN'),
          h('dt', null, 'Условия'), h('dd', null, ч.условия ?? '—', ч.дата_разрешения ? ` (с ${ч.дата_разрешения})` : '')),
        h('div', { class: 'панель' },
          h('label', { for: 'вкл-' + ч.id, class: 'переключ' }, галочка, ' Включён в приложении'),
          h('label', { for: 'умолч-' + ч.id, class: 'переключ' }, поУмолч, ' По умолчанию'),
          слушать)));
    }
    тело.append(список);
    if (!правка) тело.appendChild(h('p', { class: 'тихо' }, 'У вас роль «просмотр» — менять нельзя.'));
  };
  await нарисовать();
}
