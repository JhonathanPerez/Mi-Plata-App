import { describe, expect, it } from "vitest";
import {
  CAPTURE_NOTIFICATION_TITLE,
  PENDING_REMINDER_TITLE,
  captureNotificationBody,
  pendingReminderBody,
} from "./captureCopy";

describe("captureCopy", () => {
  it("el título anuncia el gasto detectado con el emoji de dólar", () => {
    expect(CAPTURE_NOTIFICATION_TITLE).toBe("Nuevo gasto detectado 💸");
  });

  it("el cuerpo incluye el comercio cuando se reconoció", () => {
    expect(captureNotificationBody(25000, "Rappi")).toBe(
      "Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo.",
    );
    expect(captureNotificationBody(1250000, "Mercado Libre")).toBe(
      "Nueva compra por $1.250.000 en Mercado Libre. Abre Mi Plata para categorizarlo.",
    );
  });

  it("sin comercio (null, vacío o solo espacios) muestra solo el valor", () => {
    const solo = "Nueva compra por $25.000. Abre Mi Plata para categorizarlo.";
    expect(captureNotificationBody(25000, null)).toBe(solo);
    expect(captureNotificationBody(25000, undefined)).toBe(solo);
    expect(captureNotificationBody(25000, "")).toBe(solo);
    expect(captureNotificationBody(25000, "   ")).toBe(solo);
  });

  it("el cuerpo incluye el valor de la compra formateado en pesos", () => {
    expect(captureNotificationBody(25000)).toBe(
      "Nueva compra por $25.000. Abre Mi Plata para categorizarlo.",
    );
    expect(captureNotificationBody(1250000)).toBe(
      "Nueva compra por $1.250.000. Abre Mi Plata para categorizarlo.",
    );
    expect(captureNotificationBody(350)).toBe(
      "Nueva compra por $350. Abre Mi Plata para categorizarlo.",
    );
  });
});

describe("pendingReminderBody", () => {
  it("con una sola compra pendiente dice su valor", () => {
    expect(PENDING_REMINDER_TITLE).toBe("Gastos por categorizar");
    expect(pendingReminderBody(1, 25000)).toBe(
      "Tienes una compra por $25.000 pendiente por categorizar",
    );
    expect(pendingReminderBody(1, 1250000)).toBe(
      "Tienes una compra por $1.250.000 pendiente por categorizar",
    );
  });

  it("con varias dice cuántas son, sin valores", () => {
    expect(pendingReminderBody(2)).toBe(
      "Tienes 2 compras pendientes por categorizar",
    );
    expect(pendingReminderBody(12, 25000)).toBe(
      "Tienes 12 compras pendientes por categorizar",
    );
  });

  it("con una sola de valor desconocido no inventa una cifra", () => {
    const solo = "Tienes una compra pendiente por categorizar";
    expect(pendingReminderBody(1)).toBe(solo);
    expect(pendingReminderBody(1, null)).toBe(solo);
    expect(pendingReminderBody(1, 0)).toBe(solo);
  });
});
