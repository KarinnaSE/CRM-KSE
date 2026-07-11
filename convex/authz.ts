import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Helpers de autorización backend (KAR-7). NO son funciones Convex de red.
 *
 * Regla de oro: TODA query/mutation que lea o escriba datos del CRM debe
 * empezar por `requireAuthUser(ctx)` (o `requireOwner(ctx)` si es
 * administrativa). Allowlist justificada (sin este guard): `auth.ts`, `seed.ts`,
 * `provisionUsers.ts` (internas) y `users.me` (sonda de sesión que devuelve
 * `null` en vez de lanzar).
 */

/**
 * Exige sesión válida Y cuenta activa. FAIL-CLOSED: solo `active === true`
 * autoriza; `false`, `undefined`, usuario inexistente o huérfano → sin acceso.
 */
export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No autenticado.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("No autenticado.");
  if (user.active !== true) throw new Error("Cuenta sin acceso.");
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
