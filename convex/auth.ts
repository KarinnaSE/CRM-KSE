import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { DataModel } from "./_generated/dataModel";

/**
 * Autenticación de KSE CRM (KAR-7) — Convex Auth, proveedor Password.
 *
 * SOLO SIGN-IN (registro deshabilitado en el BACKEND, no solo en la UI):
 * el `profile` rechaza cualquier `flow` que no sea "signIn", de modo que
 * signUp / reset / email-verification no pueden crear ni tocar cuentas por red.
 * Las cuentas se crean EXCLUSIVAMENTE por provisionamiento interno
 * (convex/seed.ts en dev, convex/provisionUsers.ts en prod) vía `createAccount`.
 *
 * Se usa el proveedor Password estándar (no un ConvexCredentials a medida): así
 * se conservan intactos el hashing Scrypt, `retrieveAccount` y el rate limit del
 * flujo de sign-in; el único añadido es la guarda de `flow` en `profile`.
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordSignInOnly],
});
