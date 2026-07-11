/** Formateadores de la Ficha (zona de negocio CDMX). */

const MX_TZ = "America/Mexico_City";

/** "10 jul 2026" a partir de un epoch ms, en horario CDMX. */
export function formatMxDate(epoch: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(epoch));
}

/** Monto en pesos mexicanos: "$15,000.00". */
export function formatMxn(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

/** Fecha de HOY (o con desplazamiento en días) como "YYYY-MM-DD" en CDMX, para <input type="date">. */
export function mxDateInputValue(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
