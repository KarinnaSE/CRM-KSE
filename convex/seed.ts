import { mutation } from "./_generated/server";
import { startOfTodayMx, startOfTomorrowMx } from "./dates";
import { cerrarFollowup } from "./seguimientos";

/**
 * Siembra de datos demo para la pantalla de Seguimientos.
 * Ejecutar: `npx convex run seed:seedDemo`
 *
 * Idempotente: limpia usuarios, clientes y seguimientos y los recrea.
 * Cubre cada caso del contrato: atrasado, hoy, futuro (excluido), hecho (con
 * trazabilidad válida vía cerrarFollowup), sin responsable ("Sin asignar") y
 * huérfano (cliente borrado ⇒ la fila se omite en la query).
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    // ── Limpieza (idempotencia) ──
    // Se borran primero las tablas dependientes (interactions, sales) para no
    // dejar filas colgando que apunten a clientes/usuarios eliminados.
    for (const table of [
      "followups",
      "interactions",
      "sales",
      "clients",
      "users",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }

    // ── Usuarios ──
    const marta = await ctx.db.insert("users", {
      name: "Marta López",
      email: "marta@ksecrm.mx",
      role: "duena",
      active: true,
    });
    const carlos = await ctx.db.insert("users", {
      name: "Carlos Rueda",
      email: "carlos@ksecrm.mx",
      role: "vendedor",
      active: true,
    });

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

    // 1 pendiente-futuro (excluido de la pantalla)
    await ctx.db.insert("followups", {
      clientId: roberto, dueDate: startTomorrow + 10 * HOUR,
      reason: "Reunión de cierre agendada para mañana.",
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

    return { users: 2, clients: 5, note: "seed listo (1 cliente borrado a propósito)" };
  },
});
