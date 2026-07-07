import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { stageValidator } from "./schema";

/**
 * Funciones de ejemplo para la entidad Cliente.
 * Sirven como plantilla al construir las pantallas (Lista, Nuevo, Ficha).
 * NOTA: `./_generated` lo crea `npx convex dev` la primera vez.
 */

// Lista todos los clientes (más recientes primero).
export const list = query({
  args: {},
  handler: async (ctx) => {
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
    registeredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) {
      throw new Error("El nombre es obligatorio.");
    }
    if (!args.phone?.trim() && !args.email?.trim()) {
      throw new Error("Ingresa al menos el teléfono o el correo electrónico.");
    }
    return await ctx.db.insert("clients", {
      ...args,
      registeredAt: Date.now(),
    });
  },
});
