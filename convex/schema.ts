import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Modelo de datos de KSE CRM.
 * Alineado con el PRD (Notion) y el proyecto CRM-MVP en Linear.
 *
 * Autenticación (KAR-7): se incluyen las tablas de Convex Auth (`authTables`)
 * y se PERSONALIZA la tabla `users` inlinando los campos base opcionales de
 * `authTables.users` (según la versión instalada de @convex-dev/auth) y
 * añadiendo los campos de dominio `role` / `active`. El acceso es fail-closed:
 * solo `active === true` autoriza (ver convex/authz.ts).
 */

// Las 5 etapas fijas del pipeline (no texto libre).
export const stageValidator = v.union(
  v.literal("interesado"),
  v.literal("en_conversacion"),
  v.literal("propuesta_enviada"),
  v.literal("comprado"),
  v.literal("perdido"),
);

export default defineSchema({
  // ── Tablas de Convex Auth (authAccounts, authSessions, authRefreshTokens,
  //    authVerificationCodes, authVerifiers, authRateLimits). `users` se
  //    sobreescribe justo debajo, así que se excluye del spread.
  ...(() => {
    const { users: _authUsers, ...rest } = authTables;
    return rest;
  })(),

  // ── Usuario ── Marta (dueña) y Carlos (vendedor).
  // Inlina los campos base de `authTables.users` (todos opcionales) + dominio.
  users: defineTable({
    // Base de Convex Auth (v0.0.94):
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Dominio KSE (opcionales en el esquema; el provisionamiento SIEMPRE los
    // rellena. En runtime, active!==true niega el acceso — fail-closed):
    role: v.optional(v.union(v.literal("duena"), v.literal("vendedor"))),
    active: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // ── Recuperación de contraseña (KAR-100) ──
  // Almacenamiento PROPIO del código, en vez de `authVerificationCodes` de
  // Convex Auth. Motivo: la librería rota el código ANTES de darnos cualquier
  // punto donde comprobar una cuota, así que un anónimo podía invalidar sin
  // límite el código que la usuaria legítima acababa de recibir.

  // Código vigente de una cuenta. Como mucho uno, y la invariante ya no es la de
  // KAR-100: un código VIVO no se rota nunca (esa es la defensa del hallazgo A1);
  // los caducados se limpian al preparar el envío siguiente. Ver `prepararEnvio`.
  passwordResetCodes: defineTable({
    accountId: v.id("authAccounts"),
    // HMAC-SHA256(código, PASSWORD_RESET_PEPPER). No se guarda el código en
    // claro, y el pepper evita que 10^8 hashes se precomputen en una tabla.
    codeHash: v.string(),
    expiresAt: v.number(), // epoch ms
    // Intentos restantes, con RECARGA continua (ver consumeCode). No es un cupo
    // que se agota: un cupo agotable es algo que un atacante puede vaciar para
    // dejar sin recuperación a la usuaria legítima.
    attemptsLeft: v.number(),
    // Momento del último intento, para calcular la recarga. OPCIONAL a propósito:
    // añadirlo como obligatorio dejaría fuera del esquema las filas que ya
    // existan en el deployment y el push fallaría. Cuando falta se usa
    // `_creationTime`, que Convex pone en todos los documentos, así que no hace
    // falta migración ninguna.
    lastAttemptTime: v.optional(v.number()), // epoch ms
  }).index("by_account", ["accountId"]),

  // Cuota de solicitudes por correo, en ventana fija. Solo se escribe fila para
  // correos que SÍ tienen cuenta, así que la tabla queda acotada al número de
  // usuarios reales y un atacante con correos aleatorios no puede inflarla.
  passwordResetRequests: defineTable({
    email: v.string(), // normalizado
    windowStart: v.number(), // epoch ms
    count: v.number(),
  }).index("by_email", ["email"]),

  // ── Aviso de inicio de sesión (auditoría de login, hallazgo A10) ──
  // Última vez que se avisó a cada persona de un acceso a su cuenta. Existe solo
  // para SUPRIMIR avisos repetidos: sin señal de IP ni de dispositivo —Convex no
  // las expone en una mutation— un aviso "de acceso nuevo" degenera en un aviso
  // de TODOS los accesos, y varios correos al día enseñan a ignorarlos, que es lo
  // contrario de lo que se busca. Con un tope de uno cada 24 h, el acceso de un
  // intruso sigue disparando aviso salvo que la titular ya hubiera entrado ese
  // mismo día.
  signInNotices: defineTable({
    userId: v.id("users"),
    lastNotifiedAt: v.number(), // epoch ms
  }).index("by_user", ["userId"]),

  // ── Cliente ── dato central del CRM.
  clients: defineTable({
    name: v.string(),
    company: v.optional(v.string()), // Empresa / negocio (opcional) — KAR-5
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    stage: stageValidator,
    registeredBy: v.id("users"),
    registeredAt: v.number(), // epoch ms
  })
    .index("by_stage", ["stage"])
    .index("by_registeredBy", ["registeredBy"])
    .searchIndex("search_name", { searchField: "name" }),

  // ── Interacción / Nota ── qué se habló y por qué canal.
  interactions: defineTable({
    clientId: v.id("clients"),
    text: v.string(),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("llamada"),
    ),
    date: v.number(),
    authorId: v.id("users"),
  }).index("by_client", ["clientId"]),

  // ── Seguimiento ── recordatorio de volver a contactar.
  followups: defineTable({
    clientId: v.id("clients"),
    dueDate: v.number(),
    reason: v.string(),
    status: v.union(v.literal("pendiente"), v.literal("hecho")),
    assignedTo: v.optional(v.id("users")),
    createdBy: v.id("users"),
    // Trazabilidad derivada del cierre (KAR-19). Invariante: ambos presentes
    // ⟺ status==="hecho"; ausentes ⟺ "pendiente". Se escriben atómicamente
    // junto con `status` (único punto de escritura: helper cerrarFollowup).
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.id("users")),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status"])
    // Range-scan de la pantalla principal: pendientes ordenados por fecha.
    .index("by_status_dueDate", ["status", "dueDate"]),

  // ── Venta ── asociada a un cliente.
  sales: defineTable({
    clientId: v.id("clients"),
    productType: v.union(
      v.literal("formacion"),
      v.literal("consultoria"),
      v.literal("plantilla"),
      v.literal("otro"),
    ),
    amount: v.number(),
    date: v.number(),
    registeredBy: v.id("users"),
  }).index("by_client", ["clientId"]),
});
