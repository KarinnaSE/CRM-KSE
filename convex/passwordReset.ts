import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { normalizeEmail, validatePassword } from "./authShared";
import {
  CODE_TTL_MS,
  generateNumericCode,
  sendResetCodeEmail,
} from "./passwordResetEmail";

/**
 * Recuperación de contraseña por código (KAR-100). Flujo PROPIO, no el nativo de
 * Convex Auth.
 *
 * POR QUÉ PROPIO. El flujo `reset` de la librería no pasa por ningún límite de
 * intentos: el rate limit solo se activa cuando se envía un secret, y `reset` no
 * lo envía. Peor: dentro de la librería el orden es
 *   1) generar código  2) GUARDARLO (borrando el anterior)  3) enviar el correo,
 * y el único punto de extensión con `ctx` es el (3), cuando el (2) ya está
 * commiteado. O sea que cualquier cuota puesta ahí frena el correo pero NO evita
 * que un anónimo invalide sin parar el código que la usuaria acaba de recibir.
 *
 * Aquí la cuota se consume ANTES de rotar el código. ESE es el arreglo: si
 * alguien reordena los pasos de `requestCode`, la protección desaparece sin que
 * nada falle de forma visible.
 *
 * Los flows `reset` y `reset-verification` de la librería quedan cerrados POR RED
 * en convex/auth.ts (`ALLOWED_FLOWS`), así que este es el único camino.
 */

/** Solicitudes permitidas por correo dentro de la ventana. */
const QUOTA_MAX = 3;
const QUOTA_WINDOW_MS = 15 * 60 * 1000;

/** Intentos de introducir el código antes de invalidarlo. */
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Mensaje ÚNICO para todos los fallos de verificación. Que sea el mismo para
 * "no hay código", "caducado", "sin intentos" y "código incorrecto" evita que la
 * pantalla se convierta en un oráculo.
 */
const INVALID_CODE = "El código no es válido o ha caducado.";

/**
 * HMAC-SHA256 del código con el pepper del deployment, en hexadecimal.
 *
 * Un sha256 pelado no bastaría: solo hay 10^6 códigos posibles, así que quien
 * consiguiera leer la tabla los precomputaría en segundos. Con el pepper (que
 * vive en la config del deployment, no en la base de datos) eso deja de servir.
 *
 * Se calcula en la ACTION y a las mutations les llega ya el hash: así el código
 * en claro nunca entra en el argumento de una mutation.
 */
async function hashCode(code: string): Promise<string> {
  const pepper = process.env.PASSWORD_RESET_PEPPER;
  if (!pepper) {
    throw new Error(
      "Falta PASSWORD_RESET_PEPPER en el entorno del deployment. " +
        "Fíjalo con `npx convex env set PASSWORD_RESET_PEPPER <valor>`.",
    );
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Comparación en tiempo constante de dos hashes hex. Con solo 5 intentos por
 * código el riesgo real de un ataque por tiempos es despreciable, pero cuesta
 * cinco líneas y quita la pregunta de la revisión.
 */
function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ─────────────────────── Acciones públicas ─────────────────────── */

/**
 * Paso 1 — pedir el código.
 *
 * Devuelve `null` SIEMPRE, pase lo que pase: correo desconocido, cuota agotada o
 * envío correcto son indistinguibles desde fuera. Un correo que no está dado de
 * alta no escribe NADA (ni código, ni fila de cuota), así que tampoco deja rastro
 * observable.
 *
 * El orden importa y es el arreglo del hallazgo: la cuota (paso 3) va ANTES de
 * rotar el código (paso 5).
 *
 * OJO al paso 4, que va antes del 5 a propósito: se ENVÍA y solo después se
 * ROTA. Esta acción no es transaccional —las mutations que lanza ya están
 * commiteadas cuando el envío falla—, así que rotar primero significaba que una
 * caída de Resend destruía el código anterior, todavía usable, sin entregar
 * ninguno nuevo. Enviando primero, un fallo de envío deja intacto el código que
 * la usuaria ya tenía. El caso inverso (envía y luego falla `storeCode`) es
 * mucho menos probable —una mutation interna frente a una llamada HTTP externa—
 * y además es benigno: el código anterior sigue sirviendo.
 */
export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // 1) Normalizar.
    const email = normalizeEmail(args.email);
    if (email === "") return null;

    // 2) ¿Existe la cuenta? Si no, salir sin escribir nada.
    const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
      email,
    });
    if (account === null) return null;

    // 3) Cuota. ANTES de tocar el código vigente.
    const permitido = await ctx.runMutation(
      internal.passwordReset.consumeRequestQuota,
      { email },
    );
    if (!permitido) return null;

    // 4) Enviar, a la dirección ALMACENADA en la cuenta. Si esto lanza, no se ha
    //    invalidado nada: el código anterior sigue vivo.
    const code = generateNumericCode();
    const codeHash = await hashCode(code);
    await sendResetCodeEmail(account.providerAccountId, code);

    // 5) Rotar el código ya entregado.
    await ctx.runMutation(internal.passwordReset.storeCode, {
      accountId: account._id,
      codeHash,
      expiresAt: Date.now() + CODE_TTL_MS,
      attemptsLeft: MAX_VERIFY_ATTEMPTS,
    });
    return null;
  },
});

/**
 * Paso 2 — verificar el código y cambiar la contraseña.
 *
 * No deja la sesión iniciada: es el cliente quien inicia sesión acto seguido con
 * la contraseña nueva. Así no hay que replicar el manejo de tokens y cookies que
 * el proxy de Next ya hace por nosotros para `auth:signIn`.
 */
export const resetPassword = action({
  args: {
    email: v.string(),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // La política de contraseñas se aplica antes de tocar nada. Este error SÍ es
    // específico: la usuaria necesita saber qué le falta a su contraseña.
    validatePassword(args.newPassword);

    const email = normalizeEmail(args.email);
    const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
      email,
    });
    if (account === null) throw new Error(INVALID_CODE);

    const resultado = await ctx.runMutation(
      internal.passwordReset.consumeCode,
      { accountId: account._id, codeHash: await hashCode(args.code) },
    );
    if (!resultado.ok) throw new Error(INVALID_CODE);

    // Cambia el secreto de la cuenta EXISTENTE. `modifyAccountCredentials` lanza
    // si la cuenta no existe, así que esto no puede crear cuentas: el registro
    // sigue cerrado.
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.providerAccountId, secret: args.newPassword },
    });

    // Sin `except`: caen TODAS las sesiones, también la de quien esté cambiando
    // la contraseña. Vuelve a entrar con el `signIn` del cliente.
    await invalidateSessions(ctx, { userId: resultado.userId });

    // Si un atacante había bloqueado el login a base de fallos, recuperar la
    // contraseña devuelve el acceso EN EL ACTO. Sin esto, la usuaria cambiaría la
    // contraseña y aun así no podría entrar hasta que se recargara el contador
    // (~1 intento cada 6 minutos), que es justo el escenario de bloqueo total.
    await ctx.runMutation(internal.passwordReset.clearSignInLockout, {
      accountId: account._id,
    });

    return null;
  },
});

/* ─────────────────────── Funciones internas ─────────────────────── */

/** Cuenta Password de un correo ya normalizado, o `null`. */
export const accountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    if (account === null) return null;
    // Se devuelve solo lo necesario: nunca el `secret` de la cuenta.
    return {
      _id: account._id,
      userId: account.userId,
      providerAccountId: account.providerAccountId,
    };
  },
});

/**
 * Consume una unidad de cuota. Ventana FIJA.
 *
 * OJO con el tercer caso: cuando la cuota está agotada se rechaza SIN tocar
 * `windowStart` ni `count`. Si el rechazo desplazara la ventana, un atacante
 * golpeando sin parar la mantendría viva indefinidamente y la usuaria legítima no
 * podría recuperar nunca — volveríamos exactamente al problema que arregla este
 * PR, solo que por otra vía.
 */
export const consumeRequestQuota = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const now = Date.now();
    const fila = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (fila === null) {
      await ctx.db.insert("passwordResetRequests", {
        email,
        windowStart: now,
        count: 1,
      });
      return true;
    }
    if (now - fila.windowStart > QUOTA_WINDOW_MS) {
      await ctx.db.patch(fila._id, { windowStart: now, count: 1 });
      return true;
    }
    if (fila.count >= QUOTA_MAX) return false; // sin escribir nada
    await ctx.db.patch(fila._id, { count: fila.count + 1 });
    return true;
  },
});

/**
 * Guarda el código vigente, invalidando el anterior.
 *
 * Borra TODAS las filas de la cuenta, no una: el índice `by_account` no impone
 * unicidad física, así que `.unique()` lanzaría si alguna vez hubiera dos y
 * dejaría la recuperación rota.
 */
export const storeCode = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
    codeHash: v.string(),
    expiresAt: v.number(),
    attemptsLeft: v.number(),
  },
  handler: async (ctx, args) => {
    const previos = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const previo of previos) await ctx.db.delete(previo._id);

    await ctx.db.insert("passwordResetCodes", {
      accountId: args.accountId,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      attemptsLeft: args.attemptsLeft,
    });
  },
});

/**
 * Verifica y consume el código. Un fallo nunca dice cuál de los motivos fue.
 * Cada intento fallido gasta uno de los `MAX_VERIFY_ATTEMPTS`.
 */
export const consumeCode = internalMutation({
  args: { accountId: v.id("authAccounts"), codeHash: v.string() },
  handler: async (ctx, args) => {
    const filas = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Estado inesperado (más de un código para la misma cuenta): se limpia todo
    // y se rechaza. Fail-closed.
    if (filas.length !== 1) {
      for (const fila of filas) await ctx.db.delete(fila._id);
      return { ok: false as const };
    }

    const fila = filas[0];
    if (fila.expiresAt < Date.now() || fila.attemptsLeft <= 0) {
      await ctx.db.delete(fila._id);
      return { ok: false as const };
    }
    if (!equalsConstantTime(fila.codeHash, args.codeHash)) {
      await ctx.db.patch(fila._id, { attemptsLeft: fila.attemptsLeft - 1 });
      return { ok: false as const };
    }

    // Correcto: de un solo uso.
    await ctx.db.delete(fila._id);
    const account = await ctx.db.get(args.accountId);
    if (account === null) return { ok: false as const };
    return { ok: true as const, userId: account.userId };
  },
});

/**
 * Borra el bloqueo por intentos fallidos de inicio de sesión de UNA cuenta.
 * Convex Auth guarda ese contador en `authRateLimits` usando el `_id` de la
 * cuenta como `identifier`. Nunca un barrido de la tabla.
 */
export const clearSignInLockout = internalMutation({
  args: { accountId: v.id("authAccounts") },
  handler: async (ctx, { accountId }) => {
    const fila = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", accountId))
      .unique();
    if (fila !== null) await ctx.db.delete(fila._id);
  },
});
