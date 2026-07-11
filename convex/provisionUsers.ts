import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";

/**
 * Provisionamiento de las cuentas de PRODUCCIÓN (KAR-7).
 * Ejecutar: `npx convex run provisionUsers:provisionProdUsers --prod`
 *
 * `internalAction` (NO invocable desde cliente/frontend). Idempotente y NO
 * destructivo: crea Marta/Carlos SOLO si no existen; no borra nada, no cierra
 * sesiones, no resetea contraseñas ya fijadas.
 *
 * Las contraseñas iniciales salen de variables de entorno del deployment prod
 * (`MARTA_INITIAL_PASSWORD`, `CARLOS_INITIAL_PASSWORD`), únicas/fuertes y NO
 * versionadas. Si faltan → lanza (fail-closed). La rotación/reset seguro de
 * contraseñas queda para la gestión de usuarios (KAR-54).
 */

// Busca el id de un usuario por email (índice `email`), o `null`.
export const userIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    return user?._id ?? null;
  },
});

export const provisionProdUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    const martaPwd = process.env.MARTA_INITIAL_PASSWORD;
    const carlosPwd = process.env.CARLOS_INITIAL_PASSWORD;
    if (!martaPwd || !carlosPwd) {
      throw new Error(
        "Faltan MARTA_INITIAL_PASSWORD / CARLOS_INITIAL_PASSWORD en el entorno.",
      );
    }

    const accounts = [
      { email: "marta@ksecrm.mx", name: "Marta López", role: "duena" as const, secret: martaPwd },
      { email: "carlos@ksecrm.mx", name: "Carlos Rueda", role: "vendedor" as const, secret: carlosPwd },
    ];

    let created = 0;
    for (const a of accounts) {
      const existing = await ctx.runQuery(internal.provisionUsers.userIdByEmail, {
        email: a.email,
      });
      if (existing) continue; // ya existe → no tocar (idempotente, no destructivo)

      await createAccount(ctx, {
        provider: "password",
        account: { id: a.email, secret: a.secret },
        profile: { name: a.name, email: a.email, role: a.role, active: true },
      });
      created++;
    }

    return { created, note: "provisionamiento prod idempotente" };
  },
});
