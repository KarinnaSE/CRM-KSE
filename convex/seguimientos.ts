import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { startOfTodayMx, startOfTomorrowMx } from "./dates";

/**
 * Pantalla principal: Seguimientos (KAR-22) y sus funciones
 * KAR-20 (pendientes de hoy), KAR-21 (atrasados) y KAR-19 (marcar hecho).
 *
 * `followups.status` es la ÚNICA fuente de verdad del estado; `completedAt`/
 * `completedBy` son trazabilidad derivada. Visibilidad compartida: Marta y
 * Carlos ven y operan la misma cola (organización única, sin multi-tenant).
 */

// Máximo de ítems visibles por sección (guardarraíl anti-sobrecarga).
const SECTION_LIMIT = 50;
// Cota de filas a escanear por sección: acota el peor caso si hubiera muchos
// huérfanos (clientes borrados) al frente de la cola. Con datos sanos nunca
// se alcanza; es solo un tope de seguridad.
const SCAN_CAP = 500;

/**
 * Único punto de escritura del cierre de un seguimiento. Fija status +
 * trazabilidad de forma atómica, garantizando el invariante.
 *
 * ATENCIÓN: helper compartido SOLO dentro de `convex/` (lo importan `completar`
 * y `seed`). NO es una función Convex registrada (no es query/mutation), así que
 * no es invocable por red. Toda escritura de cierre debe pasar por aquí para no
 * degradar el invariante; la validación de identidad/estado vive en el llamador
 * (hoy `completar`; con auth real, la validación de `ctx.auth` seguirá ahí).
 */
export async function cerrarFollowup(
  ctx: MutationCtx,
  id: Id<"followups">,
  actorId: Id<"users">,
): Promise<void> {
  await ctx.db.patch(id, {
    status: "hecho",
    completedAt: Date.now(),
    completedBy: actorId,
  });
}

type Item = {
  id: Id<"followups">;
  clientId: Id<"clients">;
  clientName: string;
  company: string;
  stage: Doc<"clients">["stage"];
  reason: string;
  assignee: string;
  dueDate: number;
};

/**
 * Convierte un followup en Item resolviendo cliente y responsable.
 * Devuelve `null` si el cliente fue borrado (huérfano ⇒ se omite la fila).
 * Cachea clientes y usuarios para no repetir `db.get` en la misma consulta.
 */
async function toItem(
  ctx: QueryCtx,
  f: Doc<"followups">,
  clientCache: Map<string, Doc<"clients"> | null>,
  userCache: Map<string, Doc<"users"> | null>,
): Promise<Item | null> {
  let client = clientCache.get(f.clientId);
  if (client === undefined) {
    client = await ctx.db.get(f.clientId);
    clientCache.set(f.clientId, client);
  }
  if (!client) return null; // cliente borrado → se omite, sin crash

  let assignee = "Sin asignar";
  if (f.assignedTo) {
    let user = userCache.get(f.assignedTo);
    if (user === undefined) {
      user = await ctx.db.get(f.assignedTo);
      userCache.set(f.assignedTo, user);
    }
    if (user) assignee = user.name;
  }

  return {
    id: f._id,
    clientId: f.clientId,
    clientName: client.name,
    company: client.company ?? "",
    stage: client.stage,
    reason: f.reason,
    assignee,
    dueDate: f.dueDate,
  };
}

/**
 * Recorre PEREZOSAMENTE un range-scan (streaming, no `.take` fijo) y junta
 * hasta `SECTION_LIMIT` ítems VÁLIDOS, saltando huérfanos sobre la marcha.
 * `hasMore` = existe al menos un ítem válido más allá del límite (por eso se
 * detiene al encontrar el válido nº 51). Así los huérfanos dentro de los
 * primeros 50 no reducen lo mostrado ni disparan un falso "Todo al día".
 * `SCAN_CAP` acota el peor caso (muchos huérfanos seguidos).
 */
async function collectSection(
  ctx: QueryCtx,
  rows: AsyncIterable<Doc<"followups">>,
  clientCache: Map<string, Doc<"clients"> | null>,
  userCache: Map<string, Doc<"users"> | null>,
): Promise<{ items: Item[]; hasMore: boolean }> {
  const items: Item[] = [];
  let hasMore = false;
  let scanned = 0;
  for await (const f of rows) {
    scanned++;
    const item = await toItem(ctx, f, clientCache, userCache);
    if (item) {
      if (items.length < SECTION_LIMIT) {
        items.push(item);
      } else {
        hasMore = true; // hay un válido más allá del corte
        break;
      }
    }
    if (scanned >= SCAN_CAP) break; // tope de seguridad
  }
  return { items, hasMore };
}

/**
 * KAR-20 + KAR-21: pendientes atrasados y de hoy.
 * Range-scan indexado por `by_status_dueDate` (excluye "hecho" y futuros en
 * backend, no en memoria). Orden `dueDate` asc + desempate `_creationTime`
 * (implícito en el índice). Máx 50 VÁLIDOS por sección + flag `hasMore`.
 */
export const pendientes = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const startToday = startOfTodayMx(now);
    const startTomorrow = startOfTomorrowMx(now);

    const clientCache = new Map<string, Doc<"clients"> | null>();
    const userCache = new Map<string, Doc<"users"> | null>();

    // Atrasados: pendiente y dueDate < inicio de hoy.
    const overdue = await collectSection(
      ctx,
      ctx.db
        .query("followups")
        .withIndex("by_status_dueDate", (q) =>
          q.eq("status", "pendiente").lt("dueDate", startToday),
        ),
      clientCache,
      userCache,
    );

    // Para hoy: pendiente y inicio de hoy <= dueDate < inicio de mañana.
    const today = await collectSection(
      ctx,
      ctx.db
        .query("followups")
        .withIndex("by_status_dueDate", (q) =>
          q
            .eq("status", "pendiente")
            .gte("dueDate", startToday)
            .lt("dueDate", startTomorrow),
        ),
      clientCache,
      userCache,
    );

    return {
      overdue: overdue.items,
      today: today.items,
      counts: { overdue: overdue.items.length, today: today.items.length },
      hasMore: { overdue: overdue.hasMore, today: today.hasMore },
    };
  },
});

/**
 * KAR-19: marcar un seguimiento como hecho, desde la lista.
 * Idempotente: si ya está "hecho", no-op (no pisa la trazabilidad). El actor
 * se valida contra `users` (se reemplazará por identidad real de auth, KAR-7).
 */
export const completar = mutation({
  args: {
    id: v.id("followups"),
    actorId: v.id("users"),
  },
  handler: async (ctx, { id, actorId }) => {
    const actor = await ctx.db.get(actorId);
    if (!actor) throw new Error("Usuario no válido.");

    const followup = await ctx.db.get(id);
    if (!followup) throw new Error("El seguimiento no existe.");

    // compare-and-set: solo cerrar si sigue pendiente (evita doble cierre).
    if (followup.status === "hecho") return { ok: true };

    await cerrarFollowup(ctx, id, actorId);
    return { ok: true };
  },
});
