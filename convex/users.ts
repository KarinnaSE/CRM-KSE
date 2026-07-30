import { query } from "./_generated/server";
import { currentActiveUser } from "./authz";

/**
 * Entidad Usuario. La gestión completa (alta/edición, activar/desactivar,
 * eliminar y la regla de una sola dueña) se implementará en KAR-54 / KAR-89
 * (con `requireOwner`, ver convex/authz.ts).
 */

/**
 * Usuario de la sesión actual, o `null`. Es la única función de `users` sin
 * `requireAuthUser`: `null` es la respuesta legítima para anónimo, no un error.
 *
 * Comparte criterio con `requireAuthUser` y con el `isAuthenticated` de
 * `auth.ts` a través de `currentActiveUser`, así que la UI nunca puede creerse
 * dentro cuando la capa de datos ya la ha echado. Fail-closed: sin sesión,
 * sesión revocada o caducada, usuario inexistente o `active !== true` → `null`.
 */
export const me = query({
  args: {},
  handler: async (ctx) => await currentActiveUser(ctx),
});
