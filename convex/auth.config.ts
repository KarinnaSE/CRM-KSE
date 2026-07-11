/**
 * Configuración de proveedores de identidad para Convex Auth.
 * `CONVEX_SITE_URL` la inyecta Convex automáticamente en cada deployment.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
