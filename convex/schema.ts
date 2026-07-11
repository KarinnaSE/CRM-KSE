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
