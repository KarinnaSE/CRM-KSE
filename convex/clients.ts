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
 * Item del historial unificado de la ficha (KAR-15/17/18/23). Unión DISCRIMINADA por `kind`:
 * cada tipo trae solo sus campos obligatorios (sin opcionales ambiguos). `occurredAt` es el
 * epoch usado para ordenar y mostrar; `author` es el nombre resuelto (fallback
 * "Usuario eliminado" si el usuario ya no existe).
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
 * Historial UNIFICADO de la actividad de un cliente (KAR-15/17/18/23): notas + seguimientos +
 * ventas, fusionados en un solo stream cronológico (más reciente primero).
 *
 * AUTH PRIMERO; luego `normalizeId` (id malformado → historial vacío controlado).
 * ACOTADO (hot-path): de cada fuente se traen a lo sumo HISTORY_LIMIT+1 filas por su índice
 * `by_client` (orden por `_creationTime` desc), se fusionan, se ORDENA por `occurredAt` desc y,
 * a igualdad, `_creationTime` desc, se corta a HISTORY_LIMIT y se expone `hasMore`. Los autores
 * se resuelven con un cache para no repetir `db.get`.
 */
export const historial = query({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    await requireAuthUser(ctx);
    const cid = ctx.db.normalizeId("clients", clientId);
    if (!cid) return { items: [] as TimelineItem[], hasMore: false };

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

    const rows: { item: TimelineItem; ct: number }[] = [];

    for (const i of interactions) {
      rows.push({
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
      rows.push({
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
    for (const s of sales) {
      rows.push({
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

    // Orden: occurredAt DESC, desempate _creationTime DESC (lo más reciente primero).
    rows.sort((a, b) => b.item.occurredAt - a.item.occurredAt || b.ct - a.ct);

    const hasMore = rows.length > HISTORY_LIMIT;
    return { items: rows.slice(0, HISTORY_LIMIT).map((r) => r.item), hasMore };
  },
});
