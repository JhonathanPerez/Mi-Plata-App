import { useEffect, useState } from "react";
import { useToast } from "@/app/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { errorMessage } from "@/lib/errors";
import { haptics } from "@/lib/haptics";
import {
  formatInterval,
  INTERVAL_PRESETS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
} from "@/lib/pendingReminders";
import { exactAlarmBridge } from "@/lib/localNotifications";
import { reminderService } from "@/services/reminderService";
import {
  disablePendingReminders,
  enablePendingReminders,
  syncReminders,
} from "@/services/reminderSync";
import { useReminderStatus } from "./useReminderStatus";

type Unit = "minutes" | "hours";

/** Cómo mostrar un valor guardado en el campo «Otro»: en horas si es exacto, si no en minutos. */
function toFieldValue(minutes: number): { unit: Unit; text: string } {
  return minutes % 60 === 0
    ? { unit: "hours", text: String(minutes / 60) }
    : { unit: "minutes", text: String(minutes) };
}

/** Contenido de la pantalla «Recordatorio de pendientes»: interruptor y opciones del aviso periódico de gastos capturados que siguen sin categoría. */
export function PendingReminderCard() {
  const toast = useToast();
  const {
    pendingSettings,
    permission,
    exactAlarm,
    supported,
    refresh,
    pendingActive,
  } = useReminderStatus();
  const minutes = pendingSettings?.intervalMinutes ?? 240;
  const isPreset = (INTERVAL_PRESETS as readonly number[]).includes(minutes);

  // "Otro" queda abierto mientras el valor guardado no sea una opción rápida (o si el usuario lo pidió).
  const [customOpen, setCustomOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>("hours");
  const [valueText, setValueText] = useState("");
  useEffect(() => {
    if (!isPreset) setCustomOpen(true);
    const field = toFieldValue(minutes);
    setUnit(field.unit);
    setValueText(field.text);
  }, [minutes, isPreset]);

  const onToggle = async (next: boolean) => {
    if (!supported) {
      toast.show(
        "El recordatorio funciona en la app instalada en el teléfono.",
        "info",
      );
      return;
    }
    try {
      if (next) {
        const result = await enablePendingReminders();
        await refresh();
        if (!result.ok) {
          toast.show(
            result.permission === "denied"
              ? "El permiso de notificaciones está bloqueado. Actívalo en Ajustes del teléfono ▸ Apps ▸ Mi Plata ▸ Notificaciones."
              : "Sin el permiso de notificaciones no se puede enviar el recordatorio.",
            "error",
          );
          return;
        }
        toast.show("Recordatorio activado");
      } else {
        await disablePendingReminders();
        toast.show("Recordatorio desactivado");
      }
    } catch (error) {
      toast.show(errorMessage(error), "error");
    }
  };

  const choose = async (value: number) => {
    void haptics.tap();
    await reminderService.setPendingInterval(value);
    void syncReminders();
  };

  const commitCustom = async (
    nextUnit: Unit = unit,
    nextText: string = valueText,
  ) => {
    const amount = Number(nextText);
    const total = Math.round(amount) * (nextUnit === "hours" ? 60 : 1);
    if (
      nextText.trim() === "" ||
      !Number.isFinite(amount) ||
      total < MIN_INTERVAL_MINUTES ||
      total > MAX_INTERVAL_MINUTES
    ) {
      toast.show(
        `Elige entre ${formatInterval(MIN_INTERVAL_MINUTES)} y ${formatInterval(MAX_INTERVAL_MINUTES)}.`,
        "info",
      );
      const field = toFieldValue(minutes);
      setUnit(field.unit);
      setValueText(field.text);
      return;
    }
    if (total !== minutes) await choose(total);
  };

  const hint = !supported
    ? "Solo funciona en la app instalada en el teléfono."
    : permission === "denied"
      ? "El permiso de notificaciones está bloqueado. Actívalo en Ajustes del teléfono ▸ Apps ▸ Mi Plata ▸ Notificaciones."
      : "Un aviso cada cierto tiempo mientras haya gastos sin categoría.";

  return (
    <>
      <div className="card">
        <Toggle
          checked={pendingActive}
          onChange={(next) => void onToggle(next)}
          label="Recordarme los gastos por categorizar"
          hint={hint}
        />
      </div>

      {pendingActive && pendingSettings && (
        <>
          <section className="section">
            <h2 className="section__title">Cada cuánto</h2>
            <div className="card stack">
              <div
                className="chip-row"
                role="group"
                aria-label="Cada cuánto recordar"
              >
                {INTERVAL_PRESETS.map((value) => (
                  <Chip
                    key={value}
                    selected={minutes === value}
                    onClick={() => {
                      setCustomOpen(false);
                      void choose(value);
                    }}
                  >
                    {formatInterval(value)}
                  </Chip>
                ))}
                <Chip
                  selected={customOpen || !isPreset}
                  onClick={() => setCustomOpen(true)}
                >
                  Otro
                </Chip>
              </div>

              {(customOpen || !isPreset) && (
                <div className="field">
                  <label
                    className="field__label"
                    htmlFor="pending-reminder-value"
                  >
                    Otro tiempo
                  </label>
                  <input
                    id="pending-reminder-value"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={valueText}
                    onChange={(event) => setValueText(event.target.value)}
                    onBlur={() => void commitCustom()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <Segmented<Unit>
                    label="Unidad de tiempo"
                    value={unit}
                    onChange={(next) => {
                      setUnit(next);
                      void commitCustom(next, valueText);
                    }}
                    options={[
                      { value: "minutes", label: "Minutos" },
                      { value: "hours", label: "Horas" },
                    ]}
                  />
                  <p className="field__hint">
                    Desde {formatInterval(MIN_INTERVAL_MINUTES)} hasta{" "}
                    {formatInterval(MAX_INTERVAL_MINUTES)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {exactAlarm === "denied" && (
            <Notice
              tone="warning"
              title="Android puede retrasar los recordatorios"
              action={
                <Button
                  variant="secondary"
                  onClick={() => void exactAlarmBridge.openSettings()}
                >
                  Permitir alarmas exactas
                </Button>
              }
            >
              Activa «Alarmas y recordatorios» para Mi Plata y lleguen a su
              hora.
            </Notice>
          )}

          {/* Mismas horas de silencio que QUIET_FROM_HOUR y QUIET_UNTIL_HOUR en lib/pendingReminders. */}
          <Notice tone="info">
            No se envían notificaciones entre las 10 p.m. y 8 a.m
          </Notice>
        </>
      )}
    </>
  );
}
