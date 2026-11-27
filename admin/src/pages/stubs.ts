import { получить } from '../api.ts';
import { h, число } from '../dom.ts';

/** Раздел, который делаем следующим шагом: что будет и почему пока так. */
export async function страницаЗаготовки(куда: HTMLElement, заголовок: string, текст: string, подписки = false): Promise<void> {
  куда.appendChild(h('h1', null, заголовок));
  куда.appendChild(h('p', { class: 'карта тихая' }, текст));
  if (подписки) {
    const с = await получить<{ уведомления: { подписок: number } }>('/api/admin/stats?days=1');
    куда.appendChild(h('div', { class: 'плитки' }, h('div', { class: 'плитка' }, h('span', { class: 'подпись' }, 'Активных подписок'),
      h('strong', { class: 'значение' }, число(с.уведомления.подписок)))));
  }
}
