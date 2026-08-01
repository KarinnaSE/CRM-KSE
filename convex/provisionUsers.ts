import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { normalizeEmail, validatePassword } from "./authShared";

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

  // OJO — ESTO NO DESVINCULA GOOGLE, y es deliberado (auditoría de login, A9).
  //
  // Tras el primer inicio de sesión con Google, la vinculación deja de depender
  // del correo: vive en `authAccounts` con `providerAccountId` = el `sub` de
  // Google, y `createOrUpdateUser` (convex/auth.ts) cortocircuita con
  // `existingUserId` ANTES de volver a mirar el correo. O sea que cambiarle aquí
  // el correo a alguien NO le quita el acceso por Google.
  //
  // Hoy no es explotable —dos usuarias, migración interna—, pero en cuanto exista
  // gestión de usuarios (KAR-54) sí lo será: quitar a alguien cambiándole el
  // correo lo dejaría entrando igual. Para el caso que haga falta antes de eso
  // está `unlinkGoogleAccount`, abajo. Automatizarlo desde aquí es alcance de
  // KAR-54, no de una función de migración.
  return { userId: user._id, email: newEmail, emailPatched, accountRenamed };
}

/**
 * Desvincula la cuenta de Google de una persona (auditoría de login, A9).
 *
 * Borra las filas `authAccounts` del proveedor `google` de ese usuario, de modo
 * que el siguiente "Continuar con Google" vuelva a pasar por la política de
 * `createOrUpdateUser`: correo verificado que corresponda a un usuario
 * provisionado. Si ya no corresponde, no entra.
 *
 * NO toca `users` ni la cuenta Password: no es una baja, es cortar UN método de
 * acceso. Para quitarle el acceso del todo hay que desactivar la cuenta
 * (`active: false`), que es lo que corta en `beforeSessionCreation`.
 *
 * Ejecutar:
 *   npx convex run provisionUsers:unlinkGoogleAccount --prod '{"email":"…"}'
 */
export const unlinkGoogleAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (user === null) {
      throw new Error(`No existe ningún usuario con el correo ${email}.`);
    }

    // Por usuario y proveedor: nunca un barrido de `authAccounts`.
    const cuentas = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "google"),
      )
      .collect();
    for (const cuenta of cuentas) await ctx.db.delete(cuenta._id);

    return {
      email,
      desvinculadas: cuentas.length,
      note:
        "Google desvinculado. La cuenta Password y las sesiones abiertas NO se " +
        "han tocado: para cortar el acceso del todo, desactiva la cuenta.",
    };
  },
});

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

/**
 * BREAK-GLASS: devolver el acceso a una cuenta bloqueada (KAR-101).
 *
 * Para el caso extremo que motivó el hallazgo A2: alguien deja las cuentas
 * bloqueadas a base de intentos fallidos y la recuperación por correo tampoco
 * está disponible (Resend caído, buzón inaccesible). Cambia la contraseña,
 * tumba las sesiones abiertas y limpia el contador de intentos de ESA cuenta.
 *
 * Ejecutar (runbook completo en el README):
 *   npx convex env set BREAK_GLASS_PASSWORD_MARTA --prod   # SIN el valor: lo pide por stdin
 *   npx convex run provisionUsers:resetUserPassword --prod \
 *     '{"email":"karinnase@gmail.com","envSuffix":"MARTA"}'
 *   npx convex env remove BREAK_GLASS_PASSWORD_MARTA --prod   # ← NO SALTARSE
 *
 * La contraseña llega por variable de entorno y no como argumento de esta
 * función. OJO: eso por sí solo no basta — hay que fijarla OMITIENDO el valor en
 * `env set`, o la contraseña acaba igualmente en el historial del shell y en la
 * lista de procesos, que es justo lo que se quiere evitar.
 *
 * Es de UN SOLO USO: hay que borrarla del deployment justo después, o queda una
 * contraseña válida en la configuración. Por eso el sufijo es explícito y por
 * cuenta: obliga a pensar cuál se borra.
 */
export const resetUserPassword = internalAction({
  args: { email: v.string(), envSuffix: v.string() },
  handler: async (ctx, args) => {
    // El sufijo se acota para que no pueda construirse el nombre de otra
    // variable del deployment (p. ej. la clave de Resend o el pepper).
    if (!/^[A-Z0-9_]{1,32}$/.test(args.envSuffix)) {
      throw new Error(
        "envSuffix inválido: solo mayúsculas, dígitos y guion bajo (máx. 32).",
      );
    }
    const varName = `BREAK_GLASS_PASSWORD_${args.envSuffix}`;
    const secret = process.env[varName];
    if (!secret) {
      throw new Error(
        `Falta ${varName} en el entorno del deployment. Fíjala, ejecuta esto y ` +
          `bórrala inmediatamente después.`,
      );
    }
    // Misma política que el resto del sistema: nada de colar una contraseña
    // débil por la puerta de emergencia.
    validatePassword(secret);

    const email = normalizeEmail(args.email);
    const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
      email,
    });
    if (account === null) {
      throw new Error(`No existe una cuenta Password para ${email}.`);
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.providerAccountId, secret },
    });
    await invalidateSessions(ctx, { userId: account.userId });
    // Solo la fila de ESTA cuenta; nunca un barrido de authRateLimits.
    await ctx.runMutation(internal.passwordReset.clearSignInLockout, {
      accountId: account._id,
    });

    // Aviso a la titular (KAR-106), el último y programado, por el mismo motivo
    // que en passwordReset:resetPassword. Aquí importa especialmente: esta es la
    // puerta de emergencia, la que menos rastro deja, y el aviso la hace visible.
    let avisoProgramado = false;
    try {
      await ctx.scheduler.runAfter(0, internal.passwordChangedEmail.send, {
        to: account.providerAccountId,
        changedAt: Date.now(),
        origen: "soporte",
      });
      avisoProgramado = true;
    } catch (e) {
      console.error(
        "[provisionUsers] La contraseña SÍ se cambió, pero no se pudo programar " +
          "el aviso a la titular.",
        e instanceof Error ? e.message : String(e),
      );
    }

    return {
      email,
      // `avisoProgramado`, NO "avisoEnviado": el envío ocurre después, en otro
      // trabajo. Decir "enviado" sería mentirle al operador en el peor momento
      // posible — y este comando se usa justo cuando algo ya ha ido mal.
      avisoProgramado,
      note:
        `Contraseña cambiada y bloqueo limpiado. BORRA YA ${varName} del ` +
        `deployment. El aviso a la titular se envía aparte: confirma en los ` +
        `registros del deployment que salió (prefijo [passwordChangedEmail]).`,
    };
  },
});
