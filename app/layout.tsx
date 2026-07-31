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
    // RIESGO ACEPTADO A CONCIENCIA (KAR-102 hallazgo H2; investigado en KAR-103).
    //
    // Sin `storage`, la librería guarda el JWT de acceso en `localStorage`, donde
    // cualquier XSS podría leerlo y usarlo como Bearer contra Convex. Lo dejamos
    // así, y conviene saber por qué.
    //
    // 1) `storage="inMemory"` —el arreglo evidente— NO FUNCIONA, y no por culpa
    //    de esta aplicación: es un fallo de @convex-dev/auth 0.0.94, que es la
    //    última versión publicada. Tres piezas encadenadas:
    //
    //      · dist/nextjs/client.js:32 — la opción no pasa un almacén en memoria,
    //        pasa `null`.
    //      · dist/react/client.js:285 — el `??` cae a `inMemoryStorage()`, dentro
    //        de un `useMemo` cuya única dependencia es ese `null` constante, así
    //        que el almacén se crea UNA sola vez.
    //      · `useInMemoryStorage` — su `getItem` cierra sobre el objeto de estado
    //        del momento de creación, o sea el `{}` inicial. Las escrituras van a
    //        estado de React, pero ese `getItem` memorizado sigue leyendo el
    //        objeto viejo.
    //
    //    Resultado: el almacén es DE SOLO ESCRITURA; `getItem` devuelve siempre
    //    `undefined`. Por eso, en el arranque del token
    //    (dist/react/client.js:219-243), la condición `!timeFetched` es siempre
    //    cierta y el cliente adopta a ciegas el estado que le manda el servidor,
    //    sin poder releer lo que acaba de guardar. En el instante posterior a
    //    `signIn`, cuando ese estado todavía viene sin token, se desconecta solo.
    //
    //    MEDIDO en KAR-103, mismo servidor y misma base que el control: el
    //    backend SÍ crea la sesión (`auth:store type: signIn`, 193 ms) y tres
    //    segundos después el propio cliente la borra (`auth:store type: signOut`),
    //    tras dos `No autenticado.` en las queries. De ahí la observación de
    //    KAR-102 de que `authSessions` "quedaba vacía": no es que no se cree, es
    //    que se destruye sola.
    //
    //    NO se puede sortear desde aquí: el tipo de la opción es cerrado
    //    (`"localStorage" | "inMemory"`, dist/nextjs/client.d.ts:5), así que no
    //    se puede inyectar un almacén propio, y parchear el interior de la
    //    librería de autenticación cambiaría un riesgo conocido y acotado por uno
    //    desconocido. Si alguna vez arreglan `useInMemoryStorage`, esto vuelve a
    //    ser un cambio de una línea.
    //    (Y ojo: la opción va en ESTE proveedor, no en `ConvexAuthNextjsProvider`
    //    de app/providers.tsx, que la ignora en silencio.)
    //
    // 2) El daño está acotado y medido. Un XSS se lleva el JWT de acceso, que
    //    dura 30 minutos (`jwt.durationMs` en convex/auth.ts) y NO puede
    //    renovar: el refresh token real vive solo en la cookie httpOnly — el que
    //    se guarda en `localStorage` es literalmente la cadena "dummy",
    //    comprobado en el navegador. Además `currentActiveUser` valida la sesión
    //    contra `authSessions`, así que revocarla corta el acceso robado en el
    //    acto.
    //
    // 3) Y desde KAR-103 hay una CSP con `script-src` basada en nonce, en modo
    //    BLOQUEO en producción (lib/csp.ts). Ataca la probabilidad del XSS en vez
    //    de su consecuencia: para leer este token hay que vencer antes esa
    //    política.
    <ConvexAuthNextjsServerProvider>
      <html lang="es" className={dmSans.variable}>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
