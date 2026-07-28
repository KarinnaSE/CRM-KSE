import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";

// Correos de la dueña: el viejo (provisión original) y el real (KAR-94). La
// migración `migrateOwnerEmail` mueve del viejo al nuevo conservando el `_id`;
// `provisionProdUsers` los usa para NO crear una segunda dueña tras migrar.
const OWNER_OLD_EMAIL = "marta@ksecrm.mx";
const OWNER_NEW_EMAIL = "karinnase@gmail.com";

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
    // provisionada, no crear". Para la dueña se incluyen el nuevo Y el viejo, de
    // modo que provisionar tras `migrateOwnerEmail` (o antes) NUNCA crea una
    // segunda dueña, sea cual sea el orden de ejecución (idempotencia M1).
    const accounts = [
      {
        email: OWNER_NEW_EMAIL,
        existsEmails: [OWNER_NEW_EMAIL, OWNER_OLD_EMAIL],
        name: "Marta López",
        role: "duena" as const,
        secret: martaPwd,
      },
      {
        email: "carlos@ksecrm.mx",
        existsEmails: ["carlos@ksecrm.mx"],
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
 * Migración de PROD: mover el correo de la dueña a `karinnase@gmail.com` (KAR-94)
 * para que pueda entrar con Google, CONSERVANDO el mismo `users._id` (no rompe
 * ninguna referencia `registeredBy`/`assignedTo`/etc.).
 * Ejecutar: `npx convex run provisionUsers:migrateOwnerEmail --prod`
 *
 * Idempotente (localiza a la dueña por el correo nuevo o el viejo) y acotada:
 * aborta si la cuenta encontrada no es `role: "duena"`. Hace dos cosas:
 *   1) `users.email` -> `karinnase@gmail.com` (minúsculas, casa con normalizeEmail).
 *   2) renombra el `authAccounts.providerAccountId` del método Password
 *      `marta@ksecrm.mx` -> `karinnase@gmail.com` (la contraseña/secret NO cambia,
 *      así el login por contraseña sigue funcionando con el correo nuevo).
 * Reversible corriendo el intercambio inverso a mano si hiciera falta.
 */
export const migrateOwnerEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    const owner =
      (await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", OWNER_NEW_EMAIL))
        .unique()) ??
      (await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", OWNER_OLD_EMAIL))
        .unique());

    if (owner === null) {
      throw new Error(
        `No se encontró la dueña (${OWNER_OLD_EMAIL} ni ${OWNER_NEW_EMAIL}).`,
      );
    }
    if (owner.role !== "duena") {
      throw new Error(
        "La cuenta encontrada no es la dueña; abortando por seguridad.",
      );
    }

    // 1) Correo del documento de usuario (mismo _id).
    const emailPatched = owner.email !== OWNER_NEW_EMAIL;
    if (emailPatched) {
      await ctx.db.patch(owner._id, { email: OWNER_NEW_EMAIL });
    }

    // 2) Cuenta Password: renombrar el providerAccountId (id de login).
    //    Si ya existe una cuenta Password con el correo NUEVO (p. ej. una corrida
    //    previa la renombró), no se toca nada: evita duplicar `authAccounts` ante
    //    ejecuciones parciales/manuales.
    const newAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", OWNER_NEW_EMAIL),
      )
      .unique();
    const oldAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", OWNER_OLD_EMAIL),
      )
      .unique();
    const accountRenamed = newAccount === null && oldAccount !== null;
    if (accountRenamed && oldAccount !== null) {
      await ctx.db.patch(oldAccount._id, {
        providerAccountId: OWNER_NEW_EMAIL,
      });
    }

    return {
      ownerId: owner._id,
      email: OWNER_NEW_EMAIL,
      emailPatched,
      accountRenamed,
      note: "migración dueña -> karinnase@gmail.com (mismo _id)",
    };
  },
});
