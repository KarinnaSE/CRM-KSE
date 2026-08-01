import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import type { WithoutSystemFields } from "convex/server";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import { normalizeEmail, validatePassword } from "./authShared";
import { currentActiveUser } from "./authz";

/**
 * Autenticación de KSE CRM — Convex Auth. Dos métodos que CONVIVEN:
 *   1) Password (KAR-7): email + contraseña.
 *   2) Google OAuth (KAR-94): "Continuar con Google".
 *
 * La recuperación de contraseña por código NO vive aquí: es un flujo propio, en
 * convex/passwordReset.ts (KAR-100). Ver allí el motivo.
 *
 * REGISTRO CERRADO POR DISEÑO (backend, no solo UI). NADIE se crea cuenta solo:
 * las cuentas se provisionan internamente (convex/seed.ts dev, convex/provisionUsers.ts
 * prod) vía `createAccount`. Ni sign-up de Password ni Google pueden crear un
 * usuario nuevo sin rol.
 *
 * - Password: `PasswordSignInOnly` limita los `flow` admitidos a iniciar sesión
 *   (ver `ALLOWED_FLOWS`), de modo que el sign-up sigue cerrado por red. Se usa
 *   el proveedor Password estándar para conservar Scrypt, `retrieveAccount` y el
 *   rate limit del sign-in.
 * - Google: el proveedor entra por el flujo OIDC estándar, pero la POLÍTICA de
 *   acceso vive en `callbacks.createOrUpdateUser` (ver abajo): solo se admite un
 *   correo verificado que YA corresponda a un usuario provisionado; en cualquier
 *   otro caso se lanza (rechazo) SIN crear usuario.
 *
 * NOTA: al definir `createOrUpdateUser` a medida, ESTE callback reemplaza toda la
 * lógica por defecto de creación/enlace de Convex Auth (incluido el hook
 * `afterUserCreatedOrUpdated`, que ya no se invoca). Por eso el callback también
 * es responsable de crear el usuario en la provisión Password.
 */

/**
 * Flujos de Password admitidos por red. TODO lo demás queda fuera:
 *
 * - `signUp` y `email-verification`: el registro está cerrado.
 * - `reset` y `reset-verification`: la recuperación la sirve convex/passwordReset.ts.
 *   Cerrarlos aquí NO es cosmético — es lo que impide que alguien llame a
 *   `auth:signIn` directamente con `flow: "reset"` y se salte la cuota, que es
 *   justamente el agujero que arregla KAR-100.
 */
const ALLOWED_FLOWS = new Set(["signIn"]);

const PasswordSignInOnly = Password<DataModel>({
  // Política de contraseñas compartida con la UI y con el flujo de recuperación.
  validatePasswordRequirements: validatePassword,
  /**
   * OJO: `profile()` se ejecuta en TODOS los flows, antes de que el proveedor
   * ramifique por `flow`. Es el punto correcto para cerrar el registro y para
   * normalizar el correo.
   */
  profile(params) {
    const flow = params.flow;
    if (typeof flow !== "string" || !ALLOWED_FLOWS.has(flow)) {
      throw new Error(
        "El registro está deshabilitado. Solo se permite iniciar sesión.",
      );
    }
    // Convex Auth NO normaliza `providerAccountId`: compara la cadena tal cual.
    // Las cuentas se provisionan en minúsculas, así que sin este `normalizeEmail`
    // un correo escrito con mayúsculas o espacios no encontraría su cuenta.
    return { email: normalizeEmail(params.email) };
  },
});

/**
 * Proveedor Google (OIDC). Se define `profile()` para PROPAGAR `email_verified`
 * hasta el callback (el mapping OIDC por defecto no lo incluye) y se fuerza el
 * selector de cuenta. El objeto se devuelve vía variable (no literal directo)
 * para que el campo extra `emailVerified` sobreviva el chequeo de tipos.
 */
const GoogleProvider = Google({
  authorization: { params: { prompt: "select_account" } },
  profile(googleProfile) {
    const user = {
      id: googleProfile.sub,
      name: googleProfile.name,
      email: googleProfile.email,
      image: googleProfile.picture,
      emailVerified: googleProfile.email_verified === true,
    };
    return user;
  },
});

/**
 * Ventana de supresión del aviso de acceso: como mucho uno cada 24 h por cuenta.
 *
 * Ver el porqué en la cabecera de convex/newSignInEmail.ts. En corto: sin señal
 * de IP ni de dispositivo no se puede distinguir un acceso "nuevo" de la rutina,
 * y un aviso por cada inicio de sesión se convierte en ruido que se archiva sin
 * leer.
 */
const AVISO_ACCESO_SUPRESION_MS = 24 * 60 * 60 * 1000;

/**
 * Programa el aviso de acceso si toca.
 *
 * ORDEN: primero se PROGRAMA y después se escribe la marca de supresión.
 *
 * Al revés —marca primero— hay un fallo silencioso: si `runAfter` lanza, el
 * `catch` de quien llama se lo traga, la marca ya escrita queda commiteada con la
 * transacción, y el aviso se suprime durante 24 h sin que se haya enviado nunca.
 * O sea, justo el caso en el que más falta hace la alerta es aquel en el que se
 * pierde sin dejar rastro visible.
 *
 * Con este orden el peor caso es un aviso DUPLICADO —programado y sin marca—, que
 * es infinitamente más benigno que una alerta silenciada.
 *
 * Y no debilita la protección contra dos inicios de sesión simultáneos: una
 * mutation de Convex es una transacción serializable, así que dos ejecuciones que
 * lean y escriban la misma fila entran en conflicto y una se reintenta, mire
 * donde mire el orden interno de las operaciones.
 */
async function programarAvisoDeAcceso(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<void> {
  // `users.email` es opcional en el esquema. Sin dirección no hay a quién avisar,
  // y no es un error: se sale en silencio.
  const to = user.email;
  if (!to) return;

  const ahora = Date.now();
  const fila = await ctx.db
    .query("signInNotices")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();

  if (fila !== null && ahora - fila.lastNotifiedAt < AVISO_ACCESO_SUPRESION_MS) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.newSignInEmail.send, {
    to,
    at: ahora,
  });

  if (fila === null) {
    await ctx.db.insert("signInNotices", {
      userId: user._id,
      lastNotifiedAt: ahora,
    });
  } else {
    await ctx.db.patch(fila._id, { lastNotifiedAt: ahora });
  }
}

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [PasswordSignInOnly, GoogleProvider],
  /**
   * Vida del JWT (KAR-101). Por defecto es 1 hora; se baja a 30 minutos para
   * acortar la ventana en la que un token robado sigue sirviendo. La renovación
   * es automática y transparente: el middleware de Next refresca cuando queda
   * menos de 1 minuto o del 10% de vida.
   */
  jwt: { durationMs: 30 * 60 * 1000 },
  callbacks: {
    /**
     * Punto ÚNICO donde se corta el acceso de una cuenta desactivada (KAR-101).
     *
     * `createSession` es el único sitio de la librería que crea sesiones, y lo
     * invocan por igual el login con contraseña, el de Google y la verificación
     * de códigos: cubrir este callback los cubre los tres a la vez. Antes,
     * `active` solo se miraba en la capa de datos y en el AppShell, así que una
     * cuenta desactivada llegaba a tener un JWT válido y atravesaba el
     * middleware; ahora falla en el propio inicio de sesión.
     *
     * FAIL-CLOSED: cualquier cosa que no sea `active === true` lanza.
     */
    async beforeSessionCreation(ctx, { userId }) {
      const mutationCtx = ctx as unknown as MutationCtx;
      const user = await mutationCtx.db.get(userId as Doc<"users">["_id"]);
      if (user === null || user.active !== true) {
        throw new Error("Cuenta sin acceso.");
      }

      // Aviso de acceso a la titular (auditoría de login, hallazgo A10). Va
      // DESPUÉS del control de acceso: solo se avisa de sesiones que de verdad
      // se van a crear.
      //
      // Este try/catch NO PUEDE convertirse jamás en un `throw`. Estamos dentro
      // del único punto que crea sesiones: si el aviso propagara un error, un
      // fallo de correo dejaría a las dos usuarias sin poder entrar. El aviso es
      // una red de detección, no un control de acceso, y esa jerarquía tiene que
      // notarse en el código.
      try {
        await programarAvisoDeAcceso(mutationCtx, user);
      } catch (e) {
        console.error(
          "[auth] La sesión SÍ se creó, pero no se pudo programar el aviso de " +
            "inicio de sesión.",
          e instanceof Error ? e.message : String(e),
        );
      }
    },
    /**
     * Punto único de la política de acceso. Se ejecuta tanto en la provisión
     * Password (`createAccount`) como en el sign-in de Google. El `ctx` llega
     * tipado contra `AnyDataModel`; lo casteamos al `MutationCtx` del proyecto
     * para consultar/insertar en `users` con tipos.
     */
    async createOrUpdateUser(ctx, args) {
      const db = (ctx as unknown as MutationCtx).db;

      // ── Google (OIDC) ── registro CERRADO: solo un correo verificado que ya
      //    sea de un usuario provisionado puede entrar; si no, se rechaza.
      if (args.type === "oauth") {
        // Reautenticación con Google ya vinculado antes → mismo usuario.
        if (args.existingUserId !== null) return args.existingUserId;

        if (args.profile.emailVerified !== true) {
          throw new Error("El correo de Google no está verificado.");
        }
        const email = normalizeEmail(args.profile.email);
        if (email === "") {
          throw new Error("Google no proporcionó un correo.");
        }
        // Vincula por correo al usuario YA provisionado (misma fila `users`,
        // conserva rol/active y todas sus referencias). No crea usuarios.
        const user = await db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .unique();
        if (user === null) {
          throw new Error("Cuenta de Google no autorizada.");
        }
        return user._id;
      }

      // ── Password ── Sign-in y provisión interna. Si la cuenta ya existe
      //    (sign-in) → se devuelve su usuario, sin tocar nada.
      if (args.existingUserId !== null) return args.existingUserId;

      // Llegar aquí significa "crear un usuario nuevo", y eso SOLO es legítimo
      // en la provisión interna por credenciales (`createAccount` de seed.ts /
      // provisionUsers.ts). Ante cualquier otro `type` —p. ej. la verificación
      // de un código de correo, que llega como `verification`— crear un usuario
      // abriría el registro por la puerta de atrás. FAIL-CLOSED.
      if (args.type !== "credentials") {
        throw new Error("Cuenta no autorizada.");
      }
      return await db.insert(
        "users",
        args.profile as WithoutSystemFields<Doc<"users">>,
      );
    },
  },
});

/**
 * Sonda de sesión del MIDDLEWARE (KAR-101). Sustituye a propósito a la que
 * devuelve `convexAuth()`, que solo comprobaba que el JWT estuviera firmado y
 * vigente (`return ident !== null`) — nunca miraba `authSessions` ni `active`.
 *
 * ⚠️ EL NOMBRE ES PARTE DEL CONTRATO. `convexAuthNextjsMiddleware` la invoca por
 * cadena, `fetchQuery("auth:isAuthenticated")`, así que este export tiene que
 * llamarse exactamente `isAuthenticated` y vivir en este archivo. Si no
 * coincide, el middleware captura el error, devuelve `false` y DEJA A TODO EL
 * MUNDO FUERA, además sin ruido: no falla el build ni los tipos. Al renombrar o
 * mover algo aquí, comprobar `auth.isAuthenticated` en
 * convex/_generated/api.d.ts.
 *
 * Delega en `currentActiveUser` para que el middleware, la capa de datos
 * (`requireAuthUser`) y la UI (`users.me`) apliquen literalmente el mismo
 * criterio.
 */
export const isAuthenticated = query({
  args: {},
  handler: async (ctx) => (await currentActiveUser(ctx)) !== null,
});
