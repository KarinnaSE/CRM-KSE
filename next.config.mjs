/**
 * Cabeceras de seguridad (KAR-101, hallazgo B3). Se aplican a TODAS las rutas.
 *
 * Aquí solo quedan las que NO dependen de la petición. La CSP se fue a
 * `middleware.ts` en KAR-103, porque lleva un nonce distinto en cada petición y
 * un `connect-src` que depende de `NEXT_PUBLIC_CONVEX_URL`, y ninguna de las dos
 * cosas se puede expresar en una cabecera estática.
 *
 * Ya no se emite `Content-Security-Policy` desde aquí, ni siquiera el
 * `frame-ancestors` que había antes: dos cabeceras con el mismo nombre se
 * INTERSECAN —gana la más restrictiva—, y eso convierte cualquier depuración
 * futura en un acertijo. `frame-ancestors 'none'` está ahora en `lib/csp.ts`.
 */
const securityHeaders = [
  // Segundo candado antiframing. `frame-ancestors`, que es el estándar actual,
  // va en la CSP del middleware; esto cubre a los navegadores que aún no lo
  // aplican.
  { key: "X-Frame-Options", value: "DENY" },
  // Impide que el navegador adivine el tipo de contenido (evita que una
  // respuesta acabe ejecutándose como script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtrar la ruta completa a terceros; entre orígenes, solo el dominio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa ninguna de estas capacidades.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Railway sirve por HTTPS. 2 años, subdominios incluidos.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
