import { getAuthSessionId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Helpers de autorización backend (KAR-7). NO son funciones Convex de red.
 *
 * Regla de oro: TODA query/mutation que lea o escriba datos del CRM debe
 * empezar por `requireAuthUser(ctx)` (o `requireOwner(ctx)` si es
 * administrativa). Allowlist justificada (sin este guard): `auth.ts`, `seed.ts`,
 * `provisionUsers.ts` (internas), `passwordReset.ts` (recuperación anónima por
 * diseño) y `users.me` (sonda de sesión que devuelve `null` en vez de lanzar).
 */

/**
 * Usuario de la sesión actual si —y solo si— TODO se cumple: hay un JWT válido,
 * la SESIÓN sigue existiendo y no ha caducado, y la cuenta está activa. Si no,
 * `null`.
 *
 * Lo de comprobar la sesión no es redundante (KAR-101). Convex Auth firma un JWT
 * de duración fija y `getUserIdentity()` solo verifica esa firma: no mira
 * `authSessions`. Sin este `db.get`, cerrar sesión o cambiar la contraseña —que
 * borran filas de `authSessions`— no revocaban nada de verdad, y un JWT robado
 * seguía dando acceso completo hasta que caducara.
 *
 * Es el criterio ÚNICO de "sesión buena". Lo usan `requireAuthUser` (capa de
 * datos), `users.me` (la UI) y el `isAuthenticated` de `auth.ts` (el middleware),
 * para que las tres capas no puedan discrepar.
 */
export async function currentActiveUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const sessionId = await getAuthSessionId(ctx);
  if (sessionId === null) return null;

  const session = await ctx.db.get(sessionId);
  if (session === null || session.expirationTime < Date.now()) return null;

  const user = await ctx.db.get(session.userId);
  // FAIL-CLOSED: solo `active === true` autoriza; `false`, `undefined` o un
  // usuario borrado dejando la sesión huérfana → sin acceso.
  return user !== null && user.active === true ? user : null;
}

/** Exige sesión vigente Y cuenta activa. Lanza si no. */
export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await currentActiveUser(ctx);
  if (user === null) throw new Error("No autenticado.");
  return user;
}

/** Exige que la sesión sea de la dueña. Para funciones administrativas. */
export async function requireOwner(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireAuthUser(ctx);
  if (user.role !== "duena") throw new Error("Requiere rol dueña.");
  return user;
}
