import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import type { WithoutSystemFields } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

/**
 * Autenticación de KSE CRM — Convex Auth. Dos métodos que CONVIVEN:
 *   1) Password (KAR-7): email + contraseña, con recuperación por código (KAR-96).
 *   2) Google OAuth (KAR-94): "Continuar con Google".
 *
 * REGISTRO CERRADO POR DISEÑO (backend, no solo UI). NADIE se crea cuenta solo:
 * las cuentas se provisionan internamente (convex/seed.ts dev, convex/provisionUsers.ts
 * prod) vía `createAccount`. Ni sign-up de Password ni Google pueden crear un
 * usuario nuevo sin rol.
 *
 * - Password: `PasswordWithReset` limita los `flow` admitidos a iniciar sesión y
 *   recuperar contraseña (ver `ALLOWED_FLOWS`), de modo que el sign-up sigue
 *   cerrado por red. Se usa el proveedor Password estándar para conservar
 *   Scrypt, `retrieveAccount` y el rate limit del sign-in.
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
 * Flujos de Password admitidos por red. `signUp` (y `email-verification`) quedan
 * FUERA a propósito: el registro está cerrado.
 *
 * `reset` y `reset-verification` son la recuperación de contraseña (KAR-96). No
 * abren el registro: `reset` exige que la cuenta Password ya exista, así que un
 * correo no provisionado no puede crear nada.
 */
const ALLOWED_FLOWS = new Set(["signIn", "reset", "reset-verification"]);

const PasswordWithReset = Password<DataModel>({
  // Envío del código de recuperación (OTP por correo, vía Resend).
  reset: ResendOTPPasswordReset,
  /**
   * OJO: `profile()` se ejecuta en TODOS los flows, antes de que el proveedor
   * ramifique por `flow`. Es el punto correcto para cerrar el registro y para
   * normalizar el correo.
   */
  profile(params) {
    const flow = params.flow;
    if (typeof flow !== "string" || !ALLOWED_FLOWS.has(flow)) {
      throw new Error(
        "El registro está deshabilitado. Solo se permite iniciar sesión o " +
          "recuperar la contraseña.",
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

// Normaliza un correo para comparar de forma consistente (trim + minúsculas).
function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordWithReset, GoogleProvider],
  callbacks: {
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

      // ── Password ── Sign-in, recuperación de contraseña y provisión interna.
      //    Si la cuenta ya existe (sign-in, o verificación del código de reset
      //    sobre una cuenta existente) → se devuelve su usuario, sin tocar nada.
      if (args.existingUserId !== null) return args.existingUserId;

      // Llegar aquí significa "crear un usuario nuevo", y eso SOLO es legítimo
      // en la provisión interna por credenciales (`createAccount` de seed.ts /
      // provisionUsers.ts). En la verificación de un código de correo Convex Auth
      // invoca este callback con `type: "verification"`; crear un usuario ahí
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
