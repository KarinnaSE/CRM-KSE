import { query } from "./_generated/server";

/**
 * Funciones de ejemplo para la entidad Usuario.
 * La gestión completa (alta/edición, activar/desactivar, eliminar y la regla
 * de una sola dueña) se implementará en KAR-54 / KAR-89.
 * NOTA: `./_generated` lo crea `npx convex dev` la primera vez.
 */

// Lista los usuarios activos.
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.active);
  },
});
