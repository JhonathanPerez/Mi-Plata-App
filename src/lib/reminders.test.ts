import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_SETTINGS,
  normalizeHour,
  normalizeLeadDays,
  planReminders,
  reminderId,
  type ReminderCard,
  type ReminderSettings,
} from './reminders';

const on = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({ ...DEFAULT_REMINDER_SETTINGS, enabled: true, ...over });
const NOW = new Date(2026, 8, 20, 10, 0, 0); // 20 sep 2026, 10:00 (hora local)
const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;

const cards: ReminderCard[] = [
  {
    methodId: 'pm_nubank',
    name: 'Nubank',
    statements: [
      { period: '2026-08', dueDate: '2026-09-20', unpaidTotal: 684000, closed: true }, // vence hoy
      { period: '2026-09', dueDate: '2026-10-20', unpaidTotal: 96400, closed: false }, // ciclo abierto
    ],
  },
  { methodId: 'pm_davibank', name: 'Davibank', statements: [{ period: '2026-09', dueDate: '2026-10-13', unpaidTotal: 233600, closed: true }] },
];

describe('planReminders', () => {
  it('no programa nada si los avisos están apagados', () => {
    expect(planReminders({ cards, settings: DEFAULT_REMINDER_SETTINGS, now: NOW })).toEqual([]);
  });

  it('avisa 1 día antes y el mismo día, a la hora elegida, y descarta lo que ya pasó', () => {
    const plan = planReminders({ cards, settings: on(), now: NOW });
    // El extracto de agosto de Nubank vence hoy: ya pasó la hora de 9:00 y el aviso de ayer también.
    expect(plan.map((p) => `${p.methodId} ${stamp(p.at)}`)).toEqual([
      'pm_davibank 2026-10-12 09:00',
      'pm_davibank 2026-10-13 09:00',
      'pm_nubank 2026-10-19 09:00',
      'pm_nubank 2026-10-20 09:00',
    ]);
  });

  it('incluye "3 días antes" y respeta la hora', () => {
    const plan = planReminders({ cards, settings: on({ leadDays: [3, 1, 0], hour: 18 }), now: NOW });
    const davi = plan.filter((p) => p.methodId === 'pm_davibank').map((p) => stamp(p.at));
    expect(davi).toEqual(['2026-10-10 18:00', '2026-10-12 18:00', '2026-10-13 18:00']);
  });

  it('un aviso que todavía no llegó hoy sí se programa', () => {
    const early = new Date(2026, 8, 20, 7, 0, 0);
    const plan = planReminders({ cards, settings: on({ leadDays: [0] }), now: early });
    expect(plan[0]).toMatchObject({ methodId: 'pm_nubank', period: '2026-08' });
    expect(stamp(plan[0].at)).toBe('2026-09-20 09:00');
  });

  it('el texto cambia según el momento y según el extracto esté cerrado o abierto', () => {
    const plan = planReminders({ cards, settings: on({ leadDays: [3, 1, 0] }), now: NOW });
    const find = (methodId: string, lead: number, period: string) => plan.find((p) => p.methodId === methodId && p.leadDays === lead && p.period === period)!;
    expect(find('pm_davibank', 3, '2026-09')).toMatchObject({
      title: 'Pago de Davibank',
      body: 'Tu extracto de septiembre ($233.600) vence en 3 días (mar 13 oct).',
    });
    expect(find('pm_davibank', 1, '2026-09').body).toBe('Tu extracto de septiembre ($233.600) vence mañana.');
    expect(find('pm_davibank', 0, '2026-09')).toMatchObject({ title: 'Hoy vence el pago de Davibank', body: 'Tu extracto de septiembre ($233.600) vence hoy.' });
    // Ciclo abierto: sin cifra prometida.
    expect(find('pm_nubank', 1, '2026-09').body).toBe('El pago de Nubank vence mañana. Revisa cuánto debes antes de pagar.');
  });

  it('no avisa de extractos sin deuda', () => {
    const empty: ReminderCard[] = [{ methodId: 'x', name: 'X', statements: [{ period: '2026-09', dueDate: '2026-10-13', unpaidTotal: 0, closed: true }] }];
    expect(planReminders({ cards: empty, settings: on(), now: NOW })).toEqual([]);
  });

  it('los identificadores son estables, distintos entre sí y de 31 bits', () => {
    const plan = planReminders({ cards, settings: on({ leadDays: [3, 1, 0] }), now: NOW });
    const ids = plan.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isInteger(id) && id >= 1000 && id < 2_147_483_647)).toBe(true);
    expect(reminderId('pm_nubank', '2026-09', 1)).toBe(reminderId('pm_nubank', '2026-09', 1));
    expect(reminderId('pm_nubank', '2026-09', 1)).not.toBe(reminderId('pm_nubank', '2026-09', 0));
  });

  it('nunca programa más de 60 avisos', () => {
    const many: ReminderCard[] = Array.from({ length: 30 }, (_, i) => ({
      methodId: `m${i}`,
      name: `T${i}`,
      statements: [{ period: '2027-01', dueDate: '2027-02-20', unpaidTotal: 1000, closed: true }],
    }));
    expect(planReminders({ cards: many, settings: on({ leadDays: [3, 1, 0] }), now: NOW })).toHaveLength(60);
  });
});

describe('ajustes de avisos', () => {
  it('días de anticipación: solo los permitidos, sin repetir, nunca vacíos', () => {
    expect(normalizeLeadDays('1,0')).toEqual([1, 0]);
    expect(normalizeLeadDays('0,3,1,1')).toEqual([3, 1, 0]);
    expect(normalizeLeadDays('7,9')).toEqual([1, 0]); // nada válido → valor por defecto
    expect(normalizeLeadDays('')).toEqual([1, 0]);
    expect(normalizeLeadDays(null)).toEqual([1, 0]);
  });
  it('hora: solo las ofrecidas', () => {
    expect(normalizeHour('18')).toBe(18);
    expect(normalizeHour('7')).toBe(9);
    expect(normalizeHour('abc')).toBe(9);
  });
});
