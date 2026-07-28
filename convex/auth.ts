import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import type { WithoutSystemFields } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { DataModel, Doc } from "./_generated/dataModel";

/**
 * Autenticación de KSE CRM — Convex Auth. Dos métodos que CONVIVEN:
 *   1) Password (KAR-7): email + contraseña.
 *   2) Google OAuth (KAR-94): "Continuar con Google".
 *
 * REGISTRO CERRADO POR DISEÑO (backend, no solo UI). NADIE se crea cuenta solo:
 * las cuentas se provisionan internamente (convex/seed.ts dev, convex/provisionUsers.ts
 * prod) vía `createAccount`. Ni sign-up de Password ni Google pueden crear un
 * usuario nuevo sin rol.
 *
 * - Password: `PasswordSignInOnly` rechaza cualquier `flow` != "signIn", de modo
 *   que sign-up / reset / verificación no crean ni tocan cuentas por red. Se usa
 *   el proveedor Password estándar para conservar Scrypt, `retrieveAccount` y el
 *   rate limit del sign-in; el único añadido es la guarda de `flow`.
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
const PasswordSignInOnly = Password<DataModel>({
  profile(params) {
    if (params.flow !== "signIn") {
      throw new Error(
        "El registro está deshabilitado. Solo se permite iniciar sesión.",
      );
    }
    return { email: params.email as string };
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
  providers: [PasswordSignInOnly, GoogleProvider],
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

      // ── Password (provisión interna + sign-in) ── comportamiento de siempre.
      //    Sign-in: la cuenta ya existe → se devuelve su usuario.
      //    Provisión (createAccount de seed/prod): se crea el usuario con su
      //    perfil (name/email/role/active).
      if (args.existingUserId !== null) return args.existingUserId;
      return await db.insert(
        "users",
        args.profile as WithoutSystemFields<Doc<"users">>,
      );
    },
  },
});
