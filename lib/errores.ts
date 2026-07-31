import { ConvexError } from "convex/values";

/**
 * Traduce el error de una llamada al backend en algo que enseñarle a la usuaria.
 *
 * LA REGLA, que es lo importante de este archivo: **un `ConvexError` es un fallo
 * PREVISTO y su mensaje está escrito para quien lo va a leer; cualquier otra
 * cosa es un imprevisto y NO se le enseña.**
 *
 * No es una convención nuestra, es cómo funciona Convex: el `data` de un
 * `ConvexError` viaja íntegro hasta el cliente, mientras que el mensaje de un
 * `Error` normal se REDACTA en producción. Así que un `Error` que llegue aquí
 * trae un texto inútil, y lo correcto es sustituirlo por `fallback`.
 *
 * De ahí se sigue lo que hay que tener en cuenta al escribir backend: lanzar un
 * `ConvexError` es decidir que ese mensaje se le puede enseñar a quien llame.
 * Para un fallo de configuración o un imprevisto, `Error` normal.
 *
 * (Hasta KAR-98 esta función estaba copiada, idéntica, en dos pantallas de
 * clientes, y el login iba camino de ser la tercera. Se conserva el nombre y la
 * firma que ya tenían para que el movimiento no cambiara ninguna llamada.)
 */
export function backendMessage(e: unknown, fallback: string): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  return fallback;
}
