"use client";

import { ReactNode, useMemo } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

/**
 * Proveedor de Convex + Convex Auth para toda la app (KAR-7).
 *
 * FAIL-CLOSED: si falta `NEXT_PUBLIC_CONVEX_URL`, NO se monta el proveedor ni
 * se renderiza contenido protegido; se muestra un error de configuración
 * visible. En auth real, faltar la URL de Convex no debe degradar en silencio.
 */
export function Providers({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const client = useMemo(
    () => (url ? new ConvexReactClient(url) : null),
    [url],
  );

  if (!client) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-error-600">
            Error de configuración
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Falta <code>NEXT_PUBLIC_CONVEX_URL</code>. La aplicación no puede
            iniciar sesión ni cargar datos hasta que esté configurada.
          </p>
        </div>
      </main>
    );
  }

  // OJO: `ConvexAuthNextjsProvider` NO acepta `storage`; solo desestructura
  // `{ client, children }`. La opción se pasa en `ConvexAuthNextjsServerProvider`
  // (app/layout.tsx), que es quien la reenvía al proveedor cliente. Ponerla aquí
  // se ignora en silencio.
  return (
    <ConvexAuthNextjsProvider client={client}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
