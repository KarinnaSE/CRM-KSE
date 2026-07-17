import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuthUser } from "./authz";
import { mxDateStringToEpoch } from "./dates";

/**
 * Ventas de un cliente (KAR-23). Se leen desde la ficha (`clients.historial`), que las expone en
 * una lista independiente; aquí vive solo la ESCRITURA.
 *
 * Regla KAR-7: `requireAuthUser` primero y `registeredBy` sellado desde la sesión.
 * Decisión de producto: el monto es OBLIGATORIO y mayor que 0 (se valida en runtime; el
 * esquema exige número). La fecha se valida/convierte con `mxDateStringToEpoch`.
 */
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    productType: v.union(
      v.literal("formacion"),
      v.literal("consultoria"),
      v.literal("plantilla"),
      v.literal("otro"),
    ),
    amount: v.number(),
    date: v.string(),
  },
  handler: async (ctx, { clientId, productType, amount, date }) => {
    const user = await requireAuthUser(ctx);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ConvexError("El monto debe ser mayor que 0.");
    }

    const client = await ctx.db.get(clientId);
    if (!client) throw new ConvexError("El cliente no existe.");

    return await ctx.db.insert("sales", {
      clientId,
      productType,
      amount,
      date: mxDateStringToEpoch(date),
      registeredBy: user._id, // sellado por sesión (AC KAR-23)
    });
  },
});
