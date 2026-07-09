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
