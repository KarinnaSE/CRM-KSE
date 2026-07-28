import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";

// Correos con doble estado (viejo de provisión original → real para Google). La
// migración mueve del viejo al nuevo conservando el `_id`; `provisionProdUsers`
// usa ambos para NO crear un duplicado tras migrar (idempotencia).
const OWNER_OLD_EMAIL = "marta@ksecrm.mx"; // dueña (KAR-94)
const OWNER_NEW_EMAIL = "karinnase@gmail.com";
const CARLOS_OLD_EMAIL = "carlos@ksecrm.mx"; // vendedor (KAR-95)
const CARLOS_NEW_EMAIL = "karinnaserrano111@gmail.com";

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

    // `existsEmails`: correos cuya presencia significa "esta persona ya está
    // provisionada, no crear". Se incluye el nuevo Y el viejo, de modo que
    // provisionar tras la migración (o antes) NUNCA crea un duplicado, sea cual
    // sea el orden de ejecución (idempotencia).
    const accounts = [
      {
        email: OWNER_NEW_EMAIL,
        existsEmails: [OWNER_NEW_EMAIL, OWNER_OLD_EMAIL],
        name: "Marta López",
        role: "duena" as const,
        secret: martaPwd,
      },
      {
        email: CARLOS_NEW_EMAIL,
        existsEmails: [CARLOS_NEW_EMAIL, CARLOS_OLD_EMAIL],
        name: "Carlos Rueda",
        role: "vendedor" as const,
        secret: carlosPwd,
      },
    ];

    let created = 0;
    for (const a of accounts) {
      let exists = false;
      for (const email of a.existsEmails) {
        if (await ctx.runQuery(internal.provisionUsers.userIdByEmail, { email })) {
          exists = true;
          break;
        }
      }
      if (exists) continue; // ya existe (o ya migrada) → no tocar

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

/**
 * Helper de migración: mueve el correo de un usuario provisionado a `newEmail`
 * CONSERVANDO el mismo `users._id` (no rompe referencias `registeredBy`/
 * `assignedTo`/etc.), para que pueda entrar con Google (que vincula por
 * `users.email`). Idempotente y acotado:
 *   - localiza al usuario por el correo nuevo o el viejo;
 *   - aborta si el rol no coincide con `expectedRole` (guardia de seguridad);
 *   - parchea `users.email` -> `newEmail`;
 *   - renombra el `authAccounts.providerAccountId` del método Password
 *     `oldEmail` -> `newEmail` (la contraseña/secret NO cambia), salvo que ya
 *     exista una cuenta Password con `newEmail` (evita duplicar `authAccounts`).
 * Reversible corriendo el intercambio inverso a mano si hiciera falta.
 */
async function renameUserEmail(
  ctx: MutationCtx,
  {
    oldEmail,
    newEmail,
    expectedRole,
  }: {
    oldEmail: string;
    newEmail: string;
    expectedRole: "duena" | "vendedor";
  },
) {
  const user =
    (await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", newEmail))
      .unique()) ??
    (await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", oldEmail))
      .unique());

  if (user === null) {
    throw new Error(`No se encontró el usuario (${oldEmail} ni ${newEmail}).`);
  }
  if (user.role !== expectedRole) {
    throw new Error(
      `El usuario encontrado no tiene rol "${expectedRole}"; abortando por seguridad.`,
    );
  }

  // 1) Correo del documento de usuario (mismo _id).
  const emailPatched = user.email !== newEmail;
  if (emailPatched) {
    await ctx.db.patch(user._id, { email: newEmail });
  }

  // 2) Cuenta Password: renombrar el providerAccountId (id de login).
  const newAccount = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", newEmail),
    )
    .unique();
  const oldAccount = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", oldEmail),
    )
    .unique();
  const accountRenamed = newAccount === null && oldAccount !== null;
  if (accountRenamed && oldAccount !== null) {
    await ctx.db.patch(oldAccount._id, { providerAccountId: newEmail });
  }

  return { userId: user._id, email: newEmail, emailPatched, accountRenamed };
}

/**
 * Migración de la DUEÑA a `karinnase@gmail.com` (KAR-94).
 * Ejecutar: `npx convex run provisionUsers:migrateOwnerEmail --prod`
 */
export const migrateOwnerEmail = internalMutation({
  args: {},
  handler: async (ctx) =>
    renameUserEmail(ctx, {
      oldEmail: OWNER_OLD_EMAIL,
      newEmail: OWNER_NEW_EMAIL,
      expectedRole: "duena",
    }),
});

/**
 * Migración genérica de correo de un usuario provisionado (KAR-95).
 * Ejecutar (ej. Carlos):
 *   npx convex run provisionUsers:migrateUserEmail --prod \
 *     '{"oldEmail":"carlos@ksecrm.mx","newEmail":"karinnaserrano111@gmail.com","expectedRole":"vendedor"}'
 */
export const migrateUserEmail = internalMutation({
  args: {
    oldEmail: v.string(),
    newEmail: v.string(),
    expectedRole: v.union(v.literal("duena"), v.literal("vendedor")),
  },
  handler: async (ctx, args) => renameUserEmail(ctx, args),
});
