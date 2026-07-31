import { ConvexError } from "convex/values";

/**
 * Cortes de día en zona horaria de negocio (America/Mexico_City) para
 * clasificar seguimientos en "atrasado" / "hoy" / "futuro".
 *
 * CDMX es UTC−6 fijo (sin DST desde 2022), así que el offset se aplica como
 * una constante. `dueDate` se guarda como epoch ms UTC (número absoluto).
 * Comparación semiabierta [inicio, fin): un dueDate en el corte de medianoche
 * cae en "hoy" (inicio inclusivo), nunca en dos secciones a la vez.
 *
 * Si CDMX volviera a observar DST, sustituir esta fórmula fija por una tz-db.
 */

const MX_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC−6
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms del inicio del día de hoy (00:00 CDMX) para el instante `now`. */
export function startOfTodayMx(now: number): number {
  return Math.floor((now - MX_OFFSET_MS) / DAY_MS) * DAY_MS + MX_OFFSET_MS;
}

/** Epoch ms del inicio de mañana (00:00 CDMX del día siguiente). */
export function startOfTomorrowMx(now: number): number {
  return startOfTodayMx(now) + DAY_MS;
}

/**
 * Convierte una fecha "YYYY-MM-DD" (la que emite un <input type="date">) al epoch ms de
 * MEDIANOCHE CDMX de ese día. FAIL-CLOSED: valida el formato exacto, el calendario real y un
 * rango razonable de año; ante cualquier anomalía lanza "Fecha inválida." (mensaje homogéneo,
 * sin filtrar detalles internos). Es la ÚNICA vía por la que las mutations aceptan fechas del
 * cliente: nunca se confía en el string crudo.
 *
 * - Formato: exactamente /^\d{4}-\d{2}-\d{2}$/ (rechaza "2026-1-5", "2026/07/10", "", etc.).
 * - Calendario real: round-trip con Date.UTC para rechazar días imposibles (2026-02-31,
 *   2026-13-01, 2026-00-10 → JS los normalizaría; aquí se rechazan).
 * - Rango: año entre 2000 y 2100 (guardarraíl anti valores absurdos/manipulados).
 * - Resultado finito garantizado.
 *
 * El epoch resultante es consistente con startOfTodayMx: una fecha "hoy en CDMX" cae en la
 * sección "hoy" de la pantalla de Seguimientos.
 */
export function mxDateStringToEpoch(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError("Fecha inválida.");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7)); // 1-12
  const day = Number(value.slice(8, 10)); // 1-31
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ConvexError("Fecha inválida.");
  }
  const utcMidnight = Date.UTC(year, month - 1, day);
  // Round-trip: si el día no existe en el calendario, Date.UTC lo normaliza y los campos no
  // coinciden → se rechaza (p. ej. 2026-02-31 → 3 mar).
  const check = new Date(utcMidnight);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new ConvexError("Fecha inválida.");
  }
  const ms = utcMidnight + MX_OFFSET_MS;
  if (!Number.isFinite(ms)) throw new Error("Fecha inválida.");
  return ms;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Fecha y hora legibles en zona de negocio, para meter en un correo (KAR-106).
 * Ejemplo: "30 de julio de 2026 a las 16:42 (hora de Ciudad de México)".
 *
 * Se apoya en el mismo desfase fijo que el resto del módulo en vez de usar
 * `Intl.DateTimeFormat` con `timeZone`, para no depender de que el runtime traiga
 * la base de datos de zonas horarias completa. Es una suposición que no hace
 * falta hacer, y si CDMX volviera a observar horario de verano habría que tocar
 * este archivo de todas formas (ver la cabecera).
 *
 * El desplazamiento se aplica al instante y luego se leen los campos en UTC: así
 * `getUTCHours()` devuelve la hora de CDMX sin depender de la zona horaria del
 * proceso, que en un servidor puede ser cualquiera.
 */
export function formatMxDateTime(epoch: number): string {
  const local = new Date(epoch - MX_OFFSET_MS);
  const dia = local.getUTCDate();
  const mes = MESES[local.getUTCMonth()];
  const anio = local.getUTCFullYear();
  const hora = String(local.getUTCHours()).padStart(2, "0");
  const minuto = String(local.getUTCMinutes()).padStart(2, "0");
  return `${dia} de ${mes} de ${anio} a las ${hora}:${minuto} (hora de Ciudad de México)`;
}
