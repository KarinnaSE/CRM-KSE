/**
 * Cabeceras de seguridad (KAR-101, hallazgo B3). Se aplican a TODAS las rutas.
 *
 * Lo que NO está aquí: una CSP completa con `script-src`. Next inyecta scripts
 * inline y exigiría generar un nonce por petición en el middleware; queda como
 * seguimiento. La CSP que sí se pone se limita a `frame-ancestors`, que no
 * depende de nonces y tapa el agujero concreto: hasta ahora la pantalla de login
 * se podía embeber en un iframe (clickjacking sobre el formulario).
 */
const securityHeaders = [
  // Doble candado antiframing: `frame-ancestors` es el estándar actual y
  // X-Frame-Options cubre a los navegadores que aún no lo aplican.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
