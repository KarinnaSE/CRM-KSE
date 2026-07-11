import { httpRouter } from "convex/server";
import { auth } from "./auth";

/**
 * Rutas HTTP de Convex Auth (verificación de JWT y, si se configura, OAuth).
 * Registra siempre `/.well-known/openid-configuration` y `/.well-known/jwks.json`.
 */
const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
