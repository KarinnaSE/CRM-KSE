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
 * El enforcement de `active` NO ocurre aquí (el middleware solo valida la
 * sesión/token); las cuentas inactivas se cierran en la capa de datos
 * (requireAuthUser) y en el AppShell (users.me → signOut).
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
