import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

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

  if (isSignInPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/seguimientos");
  }
  if (isProtectedRoute(request) && !authenticated) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  // Ejecuta el middleware en todo salvo estáticos y archivos con extensión.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
