import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Providers } from "./providers";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KSE CRM",
  description:
    "CRM para no perder ventas por falta de seguimiento. Clientes, seguimientos y ventas en un solo lugar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // RIESGO ACEPTADO A CONCIENCIA (KAR-102, hallazgo H2 de la auditoría).
    //
    // Sin `storage`, la librería guarda el JWT de acceso en `localStorage`, donde
    // cualquier XSS podría leerlo y usarlo como Bearer contra Convex. Lo dejamos
    // así, y conviene saber por qué:
    //
    // 1) `storage="inMemory"` —el arreglo evidente— ROMPE EL LOGIN en esta app.
    //    Comprobado con las dos variantes sobre el mismo servidor: con inMemory
    //    el inicio de sesión rebota a /login?error=disabled y no persiste
    //    sesión; con el valor por defecto entra a /seguimientos. El motivo es
    //    que tras `signIn` se hace una navegación completa y el token en memoria
    //    no sobrevive. Arreglarlo de verdad exige rehacer cómo el cliente
    //    recupera el token tras esa navegación, no cambiar esta línea.
    //    (Y ojo: la opción va en ESTE proveedor, no en `ConvexAuthNextjsProvider`
    //    de app/providers.tsx, que la ignora en silencio.)
    //
    // 2) El daño está acotado y medido. Un XSS se lleva el JWT de acceso, que
    //    dura 30 minutos (`jwt.durationMs` en convex/auth.ts) y NO puede
    //    renovar: el refresh token real vive solo en la cookie httpOnly — el que
    //    se guarda en `localStorage` es literalmente la cadena "dummy".
    //    Además `currentActiveUser` valida la sesión contra `authSessions`, así
    //    que revocarla corta el acceso robado en el acto.
    //
    // La mitigación que de verdad reduce esto es una CSP con `script-src`, que
    // ataca la probabilidad del XSS en vez de su consecuencia. Queda pendiente
    // junto con la investigación de `inMemory`.
    <ConvexAuthNextjsServerProvider>
      <html lang="es" className={dmSans.variable}>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
