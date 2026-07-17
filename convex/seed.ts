import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { startOfTodayMx, startOfTomorrowMx } from "./dates";
import { cerrarFollowup } from "./seguimientos";

/**
 * Siembra de datos demo para DESARROLLO (KAR-7).
 * Ejecutar: `npx convex run seed:seedDemo`
 *
 * Es una `internalAction` (NO invocable desde un cliente/frontend), porque
 * `createAccount` de Convex Auth requiere contexto de acción. Orquesta:
 *   1) guarda ALLOW_DEMO_SEED (solo dev),
 *   2) limpieza destructiva (internalMutation clearAll),
 *   3) creación de las 2 cuentas Password (Marta/Carlos) con `createAccount`,
 *   4) inserción de clientes + seguimientos demo (internalMutation insertDemoData).
 *
 * Contraseñas demo FIJAS (dev): marta@ksecrm.mx/marta2026, carlos@ksecrm.mx/carlos2026.
 * En prod NO se usa esta función: ver convex/provisionUsers.ts.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ── Limpieza destructiva (SOLO dev). Incluye las tablas de Convex Auth para que
//    un reseed no deje cuentas/sesiones colgadas. Orden: dependientes primero.
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      "followups",
      "interactions",
      "sales",
      "clients",
      "authRateLimits",
      "authVerifiers",
      "authVerificationCodes",
      "authRefreshTokens",
      "authSessions",
      "authAccounts",
      "users",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

// ── Inserta clientes + seguimientos demo usando ids de usuario ya provisionados.
export const insertDemoData = internalMutation({
  args: { martaId: v.id("users"), carlosId: v.id("users") },
  handler: async (ctx, { martaId: marta, carlosId: carlos }) => {
    // ── Clientes (etapas variadas) ──
    const roberto = await ctx.db.insert("clients", {
      name: "Roberto Méndez", company: "Taquería Los Compadres",
      phone: "5550101", stage: "propuesta_enviada",
      registeredBy: carlos, registeredAt: Date.now(),
    });
    const maria = await ctx.db.insert("clients", {
      name: "María García", company: "Tienda El Sol",
      phone: "5550102", stage: "interesado",
      registeredBy: carlos, registeredAt: Date.now(),
    });
    const juan = await ctx.db.insert("clients", {
      name: "Juan Pérez", company: "Ferretería Central",
      phone: "5550103", stage: "en_conversacion",
      registeredBy: marta, registeredAt: Date.now(),
    });
    const ana = await ctx.db.insert("clients", {
      name: "Ana Ramírez", company: "Café Aroma",
      phone: "5550104", stage: "comprado",
      registeredBy: marta, registeredAt: Date.now(),
    });
    const luis = await ctx.db.insert("clients", {
      name: "Luis Torres", // sin empresa (company opcional)
      phone: "5550105", stage: "interesado",
      registeredBy: carlos, registeredAt: Date.now(),
    });
    const temporal = await ctx.db.insert("clients", {
      name: "Cliente Temporal", company: "Negocio X",
      phone: "5550106", stage: "perdido",
      registeredBy: carlos, registeredAt: Date.now(),
    });

    // ── Cortes de día CDMX ──
    const now = Date.now();
    const startToday = startOfTodayMx(now);
    const startTomorrow = startOfTomorrowMx(now);

    // ── Seguimientos ──
    // 2 pendiente-atrasado
    await ctx.db.insert("followups", {
      clientId: roberto, dueDate: startToday - 15 * HOUR,
      reason: "Enviar cotización revisada; quedó de confirmar ayer.",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });
    await ctx.db.insert("followups", {
      clientId: juan, dueDate: startToday - 2 * DAY,
      reason: "Llamar para retomar la conversación tras la feria.",
      status: "pendiente", assignedTo: marta, createdBy: marta,
    });

    // 3 pendiente-hoy (una de ellas sin responsable)
    await ctx.db.insert("followups", {
      clientId: maria, dueDate: startToday + 9 * HOUR,
      reason: "Demo programada para hoy; confirmar asistencia.",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });
    await ctx.db.insert("followups", {
      clientId: ana, dueDate: startToday + 12 * HOUR,
      reason: "Seguimiento de renovación del paquete de consultoría.",
      status: "pendiente", assignedTo: marta, createdBy: marta,
    });
    await ctx.db.insert("followups", {
      clientId: luis, dueDate: startToday + 16 * HOUR,
      reason: "Enviar información de precios (aún sin responsable asignado).",
      status: "pendiente", createdBy: carlos, // sin assignedTo → "Sin asignar"
    });

    // 3 pendiente-futuro (sección "Próximos", colapsada por defecto en la UI).
    // Fechas escalonadas para validar el orden ascendente por dueDate.
    await ctx.db.insert("followups", {
      clientId: roberto, dueDate: startTomorrow + 10 * HOUR,
      reason: "Reunión de cierre agendada para mañana.",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });
    await ctx.db.insert("followups", {
      clientId: maria, dueDate: startTomorrow + 2 * DAY + 9 * HOUR,
      reason: "Enviar contrato para firma tras la demo.",
      status: "pendiente", assignedTo: marta, createdBy: marta,
    });
    await ctx.db.insert("followups", {
      clientId: luis, dueDate: startTomorrow + 5 * DAY + 14 * HOUR,
      reason: "Llamada de seguimiento la próxima semana.",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });

    // 1 hecho (trazabilidad válida vía cerrarFollowup)
    const doneId = await ctx.db.insert("followups", {
      clientId: maria, dueDate: startToday - DAY,
      reason: "Primer contacto de bienvenida (ya realizado).",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });
    await cerrarFollowup(ctx, doneId, carlos);

    // 1 huérfano: followup pendiente-hoy cuyo cliente se borra a continuación.
    await ctx.db.insert("followups", {
      clientId: temporal, dueDate: startToday + 11 * HOUR,
      reason: "Este seguimiento quedará huérfano (cliente borrado).",
      status: "pendiente", assignedTo: carlos, createdBy: carlos,
    });
    await ctx.db.delete(temporal); // el followup queda huérfano ⇒ se omite

    // ── Historial de María (KAR-15/17/23): notas de canales distintos + una venta ──
    // Junto con sus followups (ya tiene 1 pendiente y 1 hecho arriba) permiten verificar la
    // FUSIÓN del historial y el orden occurredAt DESC + desempate _creationTime DESC (las dos
    // interacciones del mismo día ejercen el desempate).
    await ctx.db.insert("interactions", {
      clientId: maria, channel: "llamada", date: startToday - 3 * DAY,
      text: "Primer contacto. Preguntó por precios del pack básico.",
      authorId: carlos,
    });
    await ctx.db.insert("interactions", {
      clientId: maria, channel: "whatsapp", date: startToday - 2 * DAY,
      text: "Enviada propuesta del pack inicial de 50 unidades con precio por volumen.",
      authorId: marta,
    });
    await ctx.db.insert("interactions", {
      clientId: maria, channel: "email", date: startToday - 2 * DAY, // mismo día ⇒ desempate
      text: "Respondió por correo: interesada, pide una demo antes de decidir.",
      authorId: carlos,
    });
    await ctx.db.insert("sales", {
      clientId: maria, productType: "consultoria", amount: 15000,
      date: startToday - DAY, registeredBy: marta,
    });
    // 2.ª venta de María: monto distinto para validar contador (2) y total ($15,000 + $8,500).
    await ctx.db.insert("sales", {
      clientId: maria, productType: "formacion", amount: 8500,
      date: startToday - 5 * DAY, registeredBy: carlos,
    });

    return { clients: 5, note: "1 cliente borrado a propósito; historial de María sembrado" };
  },
});

// ── Orquestador (SOLO dev). internalAction: createAccount necesita ctx de acción.
export const seedDemo = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.ALLOW_DEMO_SEED) {
      throw new Error(
        "seedDemo deshabilitado: falta la variable ALLOW_DEMO_SEED (solo dev).",
      );
    }

    await ctx.runMutation(internal.seed.clearAll, {});

    const marta = await createAccount(ctx, {
      provider: "password",
      account: { id: "marta@ksecrm.mx", secret: "marta2026" },
      profile: {
        name: "Marta López", email: "marta@ksecrm.mx",
        role: "duena", active: true,
      },
    });
    const carlos = await createAccount(ctx, {
      provider: "password",
      account: { id: "carlos@ksecrm.mx", secret: "carlos2026" },
      profile: {
        name: "Carlos Rueda", email: "carlos@ksecrm.mx",
        role: "vendedor", active: true,
      },
    });

    await ctx.runMutation(internal.seed.insertDemoData, {
      martaId: marta.user._id,
      carlosId: carlos.user._id,
    });

    return { users: 2, clients: 5, note: "seed dev listo" };
  },
});
