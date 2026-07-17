import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { stageValidator } from "./schema";
import { requireAuthUser } from "./authz";

/**
 * Funciones de la entidad Cliente.
 * Todas exigen sesión activa (KAR-7): el que registra ("quién lo registró") lo
 * pone el sistema desde la identidad autenticada, no el cliente.
 */

// Cota dura del historial de la ficha (KAR-17): la ficha es hot-path y la actividad crece
// sin límite. Se traen a lo sumo HISTORY_LIMIT items fusionados + flag hasMore.
const HISTORY_LIMIT = 100;

/**
 * Item del historial de la ficha (KAR-15/17/18/23). Unión DISCRIMINADA por `kind`:
 * cada tipo trae solo sus campos obligatorios (sin opcionales ambiguos). `occurredAt` es el
 * epoch usado para ordenar y mostrar; `author` es el nombre resuelto (fallback
 * "Usuario eliminado" si el usuario ya no existe). La ficha lo expone en DOS listas separadas:
 * `interacciones` (nota + seguimiento) y `ventas`.
 */
type TimelineItem =
  | {
      id: string;
      kind: "nota";
      occurredAt: number;
      author: string;
      channel: "whatsapp" | "email" | "llamada";
      text: string;
    }
  | {
      id: string;
      kind: "seguimiento";
      occurredAt: number;
      author: string;
      reason: string;
      dueDate: number;
      done: boolean;
    }
  | {
      id: string;
      kind: "venta";
      occurredAt: number;
      author: string;
      productType: "formacion" | "consultoria" | "plantilla" | "otro";
      amount: number;
    };

// Subconjuntos por lista: garantiza que las interacciones nunca contengan ventas y viceversa.
type InteractionTimelineItem = Extract<TimelineItem, { kind: "nota" | "seguimiento" }>;
type SaleTimelineItem = Extract<TimelineItem, { kind: "venta" }>;

// Lista todos los clientes (más recientes primero).
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthUser(ctx);
    return await ctx.db.query("clients").order("desc").collect();
  },
});

// Crea un cliente nuevo. Regla: nombre + al menos teléfono o email.
export const create = mutation({
  args: {
    name: v.string(),
    company: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    stage: stageValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx); // registeredBy = sesión (AC#3)

    if (!args.name.trim()) {
      throw new Error("El nombre es obligatorio.");
    }
    if (!args.phone?.trim() && !args.email?.trim()) {
      throw new Error("Ingresa al menos el teléfono o el correo electrónico.");
    }
    return await ctx.db.insert("clients", {
      ...args,
      registeredBy: user._id,
      registeredAt: Date.now(),
    });
  },
});

/**
 * Datos de un cliente para la tarjeta de la Ficha (KAR-17).
 * AUTH PRIMERO (condición del auditor): un anónimo recibe "No autenticado." aunque el id sea
 * malformado. Luego se normaliza el segmento de ruta (string arbitrario) con `normalizeId`:
 * un id inválido o inexistente devuelve `null` (la UI muestra "Cliente no encontrado", sin
 * romper). Devuelve el doc + `registeredByName` (fallback "Usuario eliminado").
 */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireAuthUser(ctx);
    const cid = ctx.db.normalizeId("clients", id);
    if (!cid) return null;
    const client = await ctx.db.get(cid);
    if (!client) return null;
    const registrar = await ctx.db.get(client.registeredBy);
    return { ...client, registeredByName: registrar?.name ?? "Usuario eliminado" };
  },
});

/**
 * Cambia la etapa del pipeline de un cliente (KAR-16). `stage` validado por `stageValidator`
 * (5 valores fijos). No registra entrada en el historial (decisión de producto del MVP). El
 * `id` viene del cliente ya cargado, por eso aquí sí es `v.id`.
 */
export const updateStage = mutation({
  args: { id: v.id("clients"), stage: stageValidator },
  handler: async (ctx, { id, stage }) => {
    await requireAuthUser(ctx);
    const client = await ctx.db.get(id);
    if (!client) throw new ConvexError("El cliente no existe.");
    await ctx.db.patch(id, { stage });
    return { ok: true };
  },
});

/**
 * Historial de la actividad de un cliente (KAR-15/17/18/23), en DOS listas separadas para que las
 * ventas se vean fácilmente y no queden revueltas con el resto:
 *   - `interacciones`: notas + seguimientos, fusionados y cronológicos (más reciente primero).
 *   - `ventas`: solo ventas, cronológicas, con `ventasTotal` (suma de montos).
 *
 * AUTH PRIMERO; luego `normalizeId` (id malformado → ambas listas vacías, contrato completo).
 * ACOTADO (hot-path): de cada fuente se traen a lo sumo HISTORY_LIMIT+1 filas por su índice
 * `by_client` (orden por `_creationTime` desc); cada lista se ORDENA por `occurredAt` desc y, a
 * igualdad, `_creationTime` desc, se corta a HISTORY_LIMIT y expone su `hasMore`. Los autores se
 * resuelven con un cache para no repetir `db.get`.
 *
 * `ventasTotal` suma las ventas MOSTRADAS (tras el corte a HISTORY_LIMIT): exacto con ≤100 ventas
 * (caso real). Si `hasMore.ventas`, es el total de las mostradas (la UI lo señala con "+"). LIMITACIÓN HEREDADA: al
 * acotar por `_creationTime` y ordenar por `occurredAt`, con >101 filas en una fuente y fechas
 * backdated/future-dated el corte no garantiza estrictamente las 100 más recientes por `occurredAt`.
 */
export const historial = query({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    await requireAuthUser(ctx);
    const cid = ctx.db.normalizeId("clients", clientId);
    if (!cid) {
      return {
        interacciones: [] as InteractionTimelineItem[],
        ventas: [] as SaleTimelineItem[],
        ventasTotal: 0,
        hasMore: { interacciones: false, ventas: false },
      };
    }

    const cap = HISTORY_LIMIT + 1;
    const [interactions, followups, sales] = await Promise.all([
      ctx.db
        .query("interactions")
        .withIndex("by_client", (q) => q.eq("clientId", cid))
        .order("desc")
        .take(cap),
      ctx.db
        .query("followups")
        .withIndex("by_client", (q) => q.eq("clientId", cid))
        .order("desc")
        .take(cap),
      ctx.db
        .query("sales")
        .withIndex("by_client", (q) => q.eq("clientId", cid))
        .order("desc")
        .take(cap),
    ]);

    // Resolución de autor con cache (fallback "Usuario eliminado" si no existe).
    const userCache = new Map<string, Doc<"users"> | null>();
    const nameOf = async (userId: Id<"users"> | undefined): Promise<string> => {
      if (!userId) return "Usuario eliminado";
      let u = userCache.get(userId);
      if (u === undefined) {
        u = await ctx.db.get(userId);
        userCache.set(userId, u);
      }
      return u?.name ?? "Usuario eliminado";
    };

    // Orden común: occurredAt DESC, desempate _creationTime DESC (lo más reciente primero).
    const byRecency = <T extends TimelineItem>(
      a: { item: T; ct: number },
      b: { item: T; ct: number },
    ) => b.item.occurredAt - a.item.occurredAt || b.ct - a.ct;

    // ── Interacciones: notas + seguimientos ──
    const interRows: { item: InteractionTimelineItem; ct: number }[] = [];
    for (const i of interactions) {
      interRows.push({
        ct: i._creationTime,
        item: {
          id: i._id,
          kind: "nota",
          occurredAt: i.date,
          author: await nameOf(i.authorId),
          channel: i.channel,
          text: i.text,
        },
      });
    }
    for (const f of followups) {
      const done = f.status === "hecho";
      // Autor: si está hecho, quien lo cerró (fallback a quien lo creó); si no, el creador.
      const authorId = done ? f.completedBy ?? f.createdBy : f.createdBy;
      interRows.push({
        ct: f._creationTime,
        item: {
          id: f._id,
          kind: "seguimiento",
          occurredAt: f.dueDate,
          author: await nameOf(authorId),
          reason: f.reason,
          dueDate: f.dueDate,
          done,
        },
      });
    }
    interRows.sort(byRecency);
    const interHasMore = interRows.length > HISTORY_LIMIT;

    // ── Ventas ──
    const ventaRows: { item: SaleTimelineItem; ct: number }[] = [];
    for (const s of sales) {
      ventaRows.push({
        ct: s._creationTime,
        item: {
          id: s._id,
          kind: "venta",
          occurredAt: s.date,
          author: await nameOf(s.registeredBy),
          productType: s.productType,
          amount: s.amount,
        },
      });
    }
    ventaRows.sort(byRecency);
    const ventaHasMore = ventaRows.length > HISTORY_LIMIT;
    const ventas = ventaRows.slice(0, HISTORY_LIMIT).map((r) => r.item);
    const ventasTotal = ventas.reduce((sum, v) => sum + v.amount, 0);

    return {
      interacciones: interRows.slice(0, HISTORY_LIMIT).map((r) => r.item),
      ventas,
      ventasTotal,
      hasMore: { interacciones: interHasMore, ventas: ventaHasMore },
    };
  },
});
