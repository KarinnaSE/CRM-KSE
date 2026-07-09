import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Modelo de datos de KSE CRM.
 * Alineado con el PRD (Notion) y el proyecto CRM-MVP en Linear.
 * Incluye los ajustes de la etapa "Detalle-Diseño" (2026-07-07):
 *   - clients.company (Empresa / negocio, opcional) — KAR-5
 *   - users.active (estado activo/inactivo) — KAR-6 / KAR-89
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
  // ── Usuario ── Marta (dueña) y Carlos (vendedor); ampliable desde la app.
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("duena"), v.literal("vendedor")),
    active: v.boolean(), // por defecto true; inactivo no puede iniciar sesión
  }).index("by_email", ["email"]),

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
