/** Кто вошёл и что ему можно (как server/admin.py РОЛИ: viewer < admin < owner). */
export type Я = { email: string; роль: 'owner' | 'admin' | 'viewer'; имя: string };
const УРОВЕНЬ = { viewer: 0, admin: 1, owner: 2 } as const;
export const можно = (я: Я, роль: Я['роль']): boolean => УРОВЕНЬ[я.роль] >= УРОВЕНЬ[роль];
