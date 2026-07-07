"use client";

import { ReactNode, useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

/**
 * Proveedor de Convex para toda la app.
 *
 * `NEXT_PUBLIC_CONVEX_URL` la escribe automáticamente `npx convex dev`
 * en tu `.env.local`. Mientras aún no esté configurada (primer arranque
 * antes de conectar Convex), la app sigue funcionando: simplemente no se
 * monta el proveedor y las queries/mutations no estarán disponibles todavía.
 */
export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  }, []);

  if (!client) {
    if (typeof window !== "undefined") {
      console.warn(
        "[KSE CRM] NEXT_PUBLIC_CONVEX_URL no está configurada. " +
          "Ejecuta `npx convex dev` para conectar la base de datos.",
      );
    }
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
