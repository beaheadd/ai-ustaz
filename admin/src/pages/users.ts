/**
 * Админы (только владелец), журнал действий и мои входы. Владелец 27.11.2026: «меня назначь админом, чтобы потом я
 * другим давал доступ». Роли: владелец — всё и админы; админ — содержимое и статистика; просмотр — только смотрит.
 * Новый админ входит сам: почта → код из письма. Паролей нет.
 */
import { получить, отправить, текстОшибки } from '../api.ts';
import { h, дата, очистить } from '../dom.ts';
import { type Я } from '../roles.ts';

type Админ = { id: number; email: string; роль: Я['роль']; имя: string; отключён: boolean; создан: number; последний_вход: number | null; изОкружения: boolean };
const РОЛИ: Record<Я['роль'], string> = { owner: 'Владелец', admin: 'Админ', viewer: 'Просмотр' };

export async function страницаАдминов(куда: HTMLElement, я: Я): Promise<void> {
  куда.appendChild(h('h1', null, 'Админы'));
  const сообщение = h('p', { class: 'сообщение', role: 'status', 'aria-live': 'polite' });
  const список = h('div');
  const почта = h('input', { type: 'email', id: 'новая-почта', required: true, placeholder: 'brat@example.com', autocomplete: 'off' });
  const имя = h('input', { type: 'text', id: 'новое-имя', placeholder: 'Как подписать (необязательно)', maxlength: 80 });
  const роль = h('select', { id: 'новая-роль' }, (['viewer', 'admin', 'owner'] as const).map((р) => h('option', { value: р, selected: р === 'admin' }, РОЛИ[р])));
  const форма = h('form', { class: 'карта форма' },
    h('h2', null, 'Дать доступ'),
    h('div', { class: 'поле' }, h('label', { for: 'новая-почта' }, 'Почта'), почта),
    h('div', { class: 'поле' }, h('label', { for: 'новое-имя' }, 'Имя'), имя),
    h('div', { class: 'поле' }, h('label', { for: 'новая-роль' }, 'Роль'), роль),
    h('p', { class: 'тихо мелко' }, 'Админ меняет содержимое и видит статистику; «Просмотр» — только смотрит; владелец ещё и управляет админами.'),
    h('button', { type: 'submit', class: 'кнопка главная' }, 'Добавить'));
  форма.addEventListener('submit', async (с) => {
    с.preventDefault();
    try {
      await отправить('/api/admin/users', { email: почта.value, role: роль.value, name: имя.value });
      const кого = почта.value;
      почта.value = '';
      имя.value = '';
      await нарисовать();
      сообщение.textContent = `Добавлен ${кого}. Пусть откроет aiustaz.pro/admin и войдёт по коду из письма.`;
    } catch (е) {
      сообщение.textContent = текстОшибки(е);
    }
  });
  куда.append(сообщение, список, форма);

  async function нарисовать(): Promise<void> {
    const о = await получить<{ админы: Админ[] }>('/api/admin/users');
    очистить(список);
    for (const а of о.админы) {
      const себя = а.email === я.email;
      const выбор = h('select', { 'aria-label': 'Роль ' + а.email, disabled: а.изОкружения || себя },
        (['viewer', 'admin', 'owner'] as const).map((р) => h('option', { value: р, selected: р === а.роль }, РОЛИ[р])));
      выбор.addEventListener('change', () => void изменить({ id: а.id, role: выбор.value }));
      const откл = h('button', { type: 'button', class: 'кнопка', disabled: а.изОкружения || себя }, а.отключён ? 'Включить' : 'Отключить');
      откл.addEventListener('click', () => void изменить({ id: а.id, disabled: !а.отключён }));
      const удалить = h('button', { type: 'button', class: 'кнопка плохо', disabled: а.изОкружения || себя }, 'Удалить');
      удалить.addEventListener('click', async () => {
        if (!window.confirm(`Удалить доступ ${а.email}?`)) return;
        try {
          await отправить('/api/admin/users/remove', { id: а.id });
          сообщение.textContent = `Доступ ${а.email} удалён.`;
          await нарисовать();
        } catch (е) {
          сообщение.textContent = текстОшибки(е);
        }
      });
      список.appendChild(h('article', { class: 'карта админ' + (а.отключён ? ' выкл' : '') },
        h('div', { class: 'чтец-шапка' }, h('h2', null, а.имя || а.email), а.изОкружения ? h('span', { class: 'метка хорошо' }, 'владелец (сервер)') : null,
          а.отключён ? h('span', { class: 'метка плохо' }, 'отключён') : null),
        h('p', { class: 'тихо мелко' }, `${а.email} · добавлен ${дата(а.создан)} · последний вход ${дата(а.последний_вход)}`),
        h('div', { class: 'панель' }, выбор, откл, удалить)));
    }
  }
  async function изменить(данные: Record<string, unknown>): Promise<void> {
    try {
      await отправить('/api/admin/users/update', данные);
      сообщение.textContent = 'Сохранено.';
      await нарисовать();
    } catch (е) {
      сообщение.textContent = текстОшибки(е);
    }
  }
  await нарисовать();
}

export async function страницаЖурнала(куда: HTMLElement): Promise<void> {
  куда.appendChild(h('h1', null, 'Журнал действий'));
  const о = await получить<{ записи: { когда: number; кто: string; действие: string; над: string; подробно: Record<string, unknown> }[] }>('/api/admin/audit?limit=200');
  куда.appendChild(h('div', { class: 'прокрутка' }, h('table', { class: 'таблица' },
    h('thead', null, h('tr', null, h('th', null, 'Когда'), h('th', null, 'Кто'), h('th', null, 'Что'), h('th', null, 'Над чем'))),
    h('tbody', null, о.записи.map((з) => h('tr', null, h('td', null, дата(з.когда)), h('td', null, з.кто || '—'), h('td', null, з.действие), h('td', null, з.над || '—')))))));
  if (!о.записи.length) куда.appendChild(h('p', { class: 'тихо' }, 'Пока пусто.'));
}

export async function страницаСеансов(куда: HTMLElement): Promise<void> {
  куда.appendChild(h('h1', null, 'Мои входы'));
  const список = h('ul', { class: 'сеансы' });
  куда.append(h('p', { class: 'тихо' }, 'Где вы вошли в админку. Чужой или старый вход — завершите.'), список);
  const нарисовать = async () => {
    const о = await получить<{ сеансы: { id: string; создан: number; был: number; устройство: string; этот: boolean }[] }>('/api/admin/sessions');
    очистить(список);
    for (const с of о.сеансы) {
      const кн = h('button', { type: 'button', class: 'кнопка', disabled: с.этот }, с.этот ? 'Этот вход' : 'Завершить');
      кн.addEventListener('click', async () => {
        await отправить('/api/admin/sessions/revoke', { id: с.id });
        await нарисовать();
      });
      список.appendChild(h('li', { class: 'карта' }, h('strong', null, с.устройство || 'устройство'), h('span', { class: 'тихо мелко' }, ` · вход ${дата(с.создан)} · был ${дата(с.был)}`), кн));
    }
  };
  await нарисовать();
}
