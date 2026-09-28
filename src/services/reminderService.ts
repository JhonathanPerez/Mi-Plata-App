import { SETTING_KEYS } from '@/config/constants';
import { notifyDataChanged } from '@/lib/dataBus';
import { todayIso } from '@/lib/dates';
import {
  DEFAULT_REMINDER_SETTINGS,
  normalizeHour,
  normalizeLeadDays,
  planReminders,
  type PlannedReminder,
  type ReminderCard,
  type ReminderSettings,
} from '@/lib/reminders';
import {
  DEFAULT_PENDING_REMINDER_SETTINGS,
  normalizeInterval,
  planPendingReminders,
  type PendingReminderSettings,
  type PlannedPendingReminder,
} from '@/lib/pendingReminders';
import { pendingCaptureRepository } from '@/repositories/pendingCaptureRepository';
import { settingsRepository } from '@/repositories/settingsRepository';
import { cardService } from './cardService';

export const reminderService = {
  async getSettings(): Promise<ReminderSettings> {
    const [enabled, leadDays, hour] = await Promise.all([
      settingsRepository.get(SETTING_KEYS.reminders),
      settingsRepository.get(SETTING_KEYS.reminderLeadDays),
      settingsRepository.get(SETTING_KEYS.reminderHour),
    ]);
    return {
      enabled: enabled === '1',
      leadDays: leadDays === null ? [...DEFAULT_REMINDER_SETTINGS.leadDays] : normalizeLeadDays(leadDays),
      hour: hour === null ? DEFAULT_REMINDER_SETTINGS.hour : normalizeHour(hour),
    };
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.reminders, enabled ? '1' : '0');
    notifyDataChanged();
  },

  async setLeadDays(days: number[]): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.reminderLeadDays, normalizeLeadDays(days).join(','));
    notifyDataChanged();
  },

  async setHour(hour: number): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.reminderHour, String(normalizeHour(hour)));
    notifyDataChanged();
  },

  async getPendingSettings(): Promise<PendingReminderSettings> {
    const [enabled, minutes] = await Promise.all([
      settingsRepository.get(SETTING_KEYS.pendingReminders),
      settingsRepository.get(SETTING_KEYS.pendingReminderMinutes),
    ]);
    return {
      enabled: enabled === '1',
      intervalMinutes: minutes === null ? DEFAULT_PENDING_REMINDER_SETTINGS.intervalMinutes : normalizeInterval(minutes),
    };
  },

  async setPendingEnabled(enabled: boolean): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.pendingReminders, enabled ? '1' : '0');
    notifyDataChanged();
  },

  async setPendingInterval(minutes: number): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.pendingReminderMinutes, String(normalizeInterval(minutes)));
    notifyDataChanged();
  },

  /** Los avisos de "gastos por categorizar" que deben estar programados ahora (ninguno si no hay pendientes). */
  async buildPendingPlan(now: Date = new Date()): Promise<PlannedPendingReminder[]> {
    const settings = await reminderService.getPendingSettings();
    if (!settings.enabled) return [];
    const pendingCount = await pendingCaptureRepository.countPending();
    return planPendingReminders({ pendingCount, settings, now });
  },

  /** Los avisos que deberían estar programados ahora mismo (según extractos y ajustes). */
  async buildPlan(now: Date = new Date()): Promise<PlannedReminder[]> {
    const settings = await reminderService.getSettings();
    if (!settings.enabled) return [];
    const overviews = await cardService.listOverviews(todayIso(now));
    const cards: ReminderCard[] = overviews
      .filter((overview) => overview.configured)
      .map((overview) => ({
        methodId: overview.method.id,
        name: overview.method.name,
        statements: [...overview.payable, ...(overview.open ? [overview.open] : [])].map((statement) => ({
          period: statement.period,
          dueDate: statement.dueDate,
          unpaidTotal: statement.unpaidTotal,
          closed: statement.closed,
        })),
      }));
    return planReminders({ cards, settings, now });
  },
};
