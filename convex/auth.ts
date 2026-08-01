import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import type { WithoutSystemFields } from "convex/server";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
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
      const db = (ctx as unknown as MutationCtx).db;
      const user = await db.get(userId as Doc<"users">["_id"]);
      if (user === null || user.active !== true) {
        throw new Error("Cuenta sin acceso.");
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

      /**
       * ÚLTIMA LÍNEA DE DEFENSA DE LAS DOS INVARIANTES DEL CONJUNTO DE USUARIOS
       * (KAR-54 / KAR-89). Están aquí y no (solo) en convex/users.ts por un
       * motivo concreto: este callback corre DENTRO de la misma transacción que
       * el `db.insert` de abajo, así que es el único punto donde comprobar y
       * escribir no se pueden separar. `users.crear` valida antes lo mismo, pero
       * en otra transacción; entre su comprobación y este insert cabe otra alta.
       *
       * Los mensajes NO son para la usuaria: Convex redacta el texto de un
       * `Error` en producción. El mensaje que se lee lo da `users.crear`.
       */
      const perfil = args.profile as WithoutSystemFields<Doc<"users">>;

      // 1) Correo único. No es higiene: el login con Google resuelve el usuario
      //    con `.withIndex("email").unique()` (arriba, en la rama oauth), y
      //    `.unique()` LANZA si hay dos filas. Dos usuarios con el mismo correo
      //    no degradan el login de Google, lo rompen con un error.
      const correo = normalizeEmail(perfil.email);
      if (correo !== "") {
        const existente = await db
          .query("users")
          .withIndex("email", (q) => q.eq("email", correo))
          .first();
        if (existente !== null) {
          throw new Error(`Ya existe un usuario con el correo ${correo}.`);
        }
      }

      // 2) Una sola dueña. Recorrido completo de `users` y no un índice: la
      //    tabla tiene un puñado de filas, esto solo corre al CREAR usuarios
      //    (nunca en un inicio de sesión), y leer la tabla entera mete todas sus
      //    filas en el read-set de la transacción, que es justo lo que hace que
      //    dos altas simultáneas con rol dueña no puedan pasar las dos.
      if (perfil.role === "duena") {
        const duenaActual = await db
          .query("users")
          .filter((q) => q.eq(q.field("role"), "duena"))
          .first();
        if (duenaActual !== null) {
          throw new Error("Ya existe una cuenta con rol dueña.");
        }
      }

      return await db.insert("users", perfil);
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
