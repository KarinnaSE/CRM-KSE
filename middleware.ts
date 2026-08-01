import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { construirCSP, generarNonce, nombreCabeceraCSP } from "@/lib/csp";

/**
 * Protección de rutas (KAR-7, AC#1 capa UI). Un usuario sin sesión que pida
 * cualquier ruta protegida es redirigido a /login antes de renderizar. Un
 * usuario con sesión que pida /login se manda a /seguimientos.
 *
 * `convexAuth.isAuthenticated()` resuelve por nombre a la query
 * `auth:isAuthenticated` del proyecto (convex/auth.ts), NO a la de la librería.
 * Desde KAR-101 esa query aplica el criterio completo vía `currentActiveUser`:
 * JWT válido + sesión viva en `authSessions` + `active === true`. O sea que aquí
 * SÍ se corta el paso a sesiones revocadas y a cuentas desactivadas, no solo a
 * quien no tenga token. La capa de datos (`requireAuthUser`) y el AppShell
 * (`users.me`) usan ese mismo criterio, así que no pueden discrepar.
 */
const isSignInPage = createRouteMatcher(["/login"]);
const isProtectedRoute = createRouteMatcher([
  "/seguimientos(.*)",
  "/clientes(.*)",
  "/usuarios(.*)",
  "/perfil(.*)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated();

  // Las redirecciones van ANTES de montar la CSP: una redirección no renderiza
  // HTML, así que no hay ningún script al que aplicarle un nonce.
  if (isSignInPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/seguimientos");
  }
  if (isProtectedRoute(request) && !authenticated) {
    return nextjsMiddlewareRedirect(request, "/login");
  }

  // CSP con nonce por petición (KAR-103). La cabecera va en DOS sitios y cada
  // uno tiene su motivo:
  //   - en la PETICIÓN, para que Next lea el nonce de `script-src` y se lo
  //     ponga a los scripts que inyecta;
  //   - en la RESPUESTA, para que el navegador aplique la política.
  // Si se pusiera solo en la respuesta, Next no marcaría sus scripts y la
  // página se quedaría en blanco al pasar a modo bloqueo.
  const esDesarrollo = process.env.NODE_ENV === "development";
  const nonce = generarNonce();
  const csp = construirCSP({
    nonce,
    esDesarrollo,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
  });
  const cabecera = nombreCabeceraCSP(esDesarrollo);

  const cabecerasPeticion = new Headers(request.headers);
  cabecerasPeticion.set(cabecera, csp);

  const response = NextResponse.next({
    request: { headers: cabecerasPeticion },
  });
  response.headers.set(cabecera, csp);
  return response;
});

export const config = {
  /**
   * Ejecuta el middleware en TODO salvo los estáticos de Next.
   *
   * El matcher anterior era `"/((?!.*\\..*|_next).*)"`, que excluía cualquier
   * ruta con un PUNTO en el path. Es el patrón que sugiere la documentación de
   * Next, y aquí abría un agujero: como existe `app/(app)/clientes/[id]`, una
   * petición a `/clientes/abc.def` casa con la ruta dinámica y renderiza la
   * aplicación SIN que este middleware corra. O sea, sin cabecera CSP —que es la
   * mitigación del JWT en localStorage (KAR-103)— y sin la redirección a /login.
   *
   * No filtraba datos: `requireAuthUser` corta en la capa de datos y el AppShell
   * no renderiza chrome protegido. Pero dejaba un conjunto de URLs alcanzables
   * sin sesión que esquivaban la política recién desplegada.
   *
   * Ahora solo se excluye lo que de verdad no debe pagar el coste: los estáticos
   * que sirve Next. OJO al excluir cosas de aquí — el proxy de `/api/auth` VIVE
   * dentro de este middleware (`convexAuthNextjsMiddleware` lo intercepta antes
   * que nada), así que dejarlo fuera del matcher rompe iniciar y cerrar sesión.
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
