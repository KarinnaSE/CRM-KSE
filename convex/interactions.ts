import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuthUser } from "./authz";
import { mxDateStringToEpoch } from "./dates";

/**
 * Interacciones / notas de un cliente (KAR-15). Se leen desde el historial unificado de la
 * ficha (`clients.historial`); aquí vive solo la ESCRITURA.
 *
 * Regla KAR-7: `requireAuthUser` primero y `authorId` sellado desde la sesión (nunca de args).
 * La fecha llega como "YYYY-MM-DD" y se valida/convierte en el servidor con
 * `mxDateStringToEpoch` (fail-closed).
 */
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    text: v.string(),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("email"),
      v.literal("llamada"),
    ),
    date: v.string(),
  },
  handler: async (ctx, { clientId, text, channel, date }) => {
    const user = await requireAuthUser(ctx);

    if (!text.trim()) throw new ConvexError("El texto es obligatorio.");

    const client = await ctx.db.get(clientId);
    if (!client) throw new ConvexError("El cliente no existe.");

    return await ctx.db.insert("interactions", {
      clientId,
      text: text.trim(),
      channel,
      date: mxDateStringToEpoch(date),
      authorId: user._id, // sellado por sesión (AC KAR-15)
    });
  },
});
