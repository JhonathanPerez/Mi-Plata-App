import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PENDING_REMINDER_SETTINGS,
  formatInterval,
  isPendingReminderId,
  MAX_PLANNED,
  normalizeInterval,
  PENDING_REMINDER_ID_BASE,
  planPendingReminders,
  type PendingReminderSettings,
} from './pendingReminders';

const on = (minutes: number): PendingReminderSettings => ({ enabled: true, intervalMinutes: minutes });
const at = (h: number, m = 0, day = 24) => new Date(2026, 8, day, h, m, 0); // sep 2026, hora local
const stamp = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('planPendingReminders', () => {
  it('no programa nada si está apagado o no hay pendientes', () => {
    expect(planPendingReminders({ pendingCount: 3, settings: DEFAULT_PENDING_REMINDER_SETTINGS, now: at(10) })).toEqual([]);
    expect(planPendingReminders({ pendingCount: 0, settings: on(60), now: at(10) })).toEqual([]);
  });

  it('el texto dice el valor si hay una sola compra pendiente y cuántas si hay varias', () => {
    const una = planPendingReminders({ pendingCount: 1, singleAmount: 25000, settings: on(60), now: at(8) });
    expect(una[0]).toMatchObject({
      title: 'Gastos por categorizar',
      body: 'Tienes una compra por $25.000 pendiente por categorizar',
    });
    const varias = planPendingReminders({ pendingCount: 3, singleAmount: null, settings: on(60), now: at(8) });
    expect(varias.every((p) => p.body === 'Tienes 3 compras pendientes por categorizar')).toBe(true);
  });

  it('con una sola compra de valor desconocido no inventa una cifra', () => {
    const plan = planPendingReminders({ pendingCount: 1, settings: on(60), now: at(8) });
    expect(plan[0].body).toBe('Tienes una compra pendiente por categorizar');
  });

  it('avisa cada intervalo a partir de ahora', () => {
    const plan = planPendingReminders({ pendingCount: 2, settings: on(120), now: at(8) });
    expect(plan.slice(0, 4).map((p) => stamp(p.at))).toEqual(['24 10:00', '24 12:00', '24 14:00', '24 16:00']);
  });

  it('nunca avisa de noche: lo que cae entre 10 pm y 8 am pasa a las 8:00 y el conteo sigue desde ahí', () => {
    const plan = planPendingReminders({ pendingCount: 1, settings: on(240), now: at(18) });
    expect(plan.slice(0, 4).map((p) => stamp(p.at))).toEqual(['25 08:00', '25 12:00', '25 16:00', '25 20:00']);
    plan.forEach((p) => {
      const h = p.at.getHours();
      expect(h >= 8 && h < 22).toBe(true);
    });
  });

  it('un aviso justo a las 22:00 se considera de noche', () => {
    const plan = planPendingReminders({ pendingCount: 1, settings: on(240), now: at(18) });
    expect(stamp(plan[0].at)).toBe('25 08:00');
  });

  it('con intervalo diario avisa una vez al día', () => {
    const plan = planPendingReminders({ pendingCount: 1, settings: on(1440), now: at(9) });
    expect(plan.slice(0, 3).map((p) => stamp(p.at))).toEqual(['25 09:00', '26 09:00', '27 09:00']);
  });

  it('limita la cantidad y el horizonte a 7 días', () => {
    const frequent = planPendingReminders({ pendingCount: 1, settings: on(30), now: at(8) });
    expect(frequent).toHaveLength(MAX_PLANNED);
    const daily = planPendingReminders({ pendingCount: 1, settings: on(1440), now: at(9) });
    expect(daily.length).toBeLessThanOrEqual(7);
  });

  it('usa ids únicos dentro del rango reservado', () => {
    const plan = planPendingReminders({ pendingCount: 1, settings: on(60), now: at(8) });
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    plan.forEach((p) => {
      expect(isPendingReminderId(p.id)).toBe(true);
      expect(p.id).toBeLessThan(2_147_483_647);
    });
    expect(plan[0].id).toBe(PENDING_REMINDER_ID_BASE);
    expect(isPendingReminderId(2_000_001_000)).toBe(false);
  });
});

describe('normalizeInterval / formatInterval', () => {
  it('acepta enteros dentro del rango y corrige lo demás', () => {
    expect(normalizeInterval(90)).toBe(90);
    expect(normalizeInterval('180')).toBe(180);
    expect(normalizeInterval(4)).toBe(240);
    expect(normalizeInterval(99999)).toBe(240);
    expect(normalizeInterval('')).toBe(240);
    expect(normalizeInterval('abc')).toBe(240);
    expect(normalizeInterval(60.5)).toBe(240);
  });

  it('escribe el intervalo en español', () => {
    expect(formatInterval(30)).toBe('30 min');
    expect(formatInterval(240)).toBe('4 h');
    expect(formatInterval(90)).toBe('1 h 30 min');
    expect(formatInterval(1440)).toBe('1 día');
    expect(formatInterval(2880)).toBe('2 días');
  });
});
