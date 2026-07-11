import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { stageValidator } from "./schema";
import { requireAuthUser } from "./authz";

/**
 * Funciones de la entidad Cliente.
 * Todas exigen sesión activa (KAR-7): el que registra ("quién lo registró") lo
 * pone el sistema desde la identidad autenticada, no el cliente.
 */

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
