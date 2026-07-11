import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Entidad Usuario. La gestión completa (alta/edición, activar/desactivar,
 * eliminar y la regla de una sola dueña) se implementará en KAR-54 / KAR-89
 * (con `requireOwner`, ver convex/authz.ts).
 */

/**
 * Usuario de la sesión actual, o `null`. FAIL-CLOSED para cuentas sin acceso:
 * si no hay sesión, o el usuario no existe, o `active !== true`, devuelve `null`
 * (nunca expone otros usuarios ni un usuario inactivo). Es la única función de
 * `users` sin `requireAuthUser`: `null` es la respuesta legítima para anónimo.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    if (!id) return null;
    const user = await ctx.db.get(id);
    if (!user || user.active !== true) return null;
    return user;
  },
});
