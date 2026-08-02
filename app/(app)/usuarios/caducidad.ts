/**
 * Formateo de la caducidad de una invitación (KAR-55).
 *
 * POR QUÉ ESTO NO VA INCRUSTADO EN EL JSX. Dos razones:
 *
 * 1. Lo usan DOS sitios —el bloque de "ya hay una invitación viva" del modal y
 *    el aviso persistente del alta—, y dos copias del mismo texto se desvían.
 * 2. Es lo ÚNICO de esta pantalla que se puede comprobar sin navegador. Por eso
 *    `ahora` es un parámetro y no `Date.now()`: sin él, cualquier comprobación
 *    dependería del reloj de quien la ejecuta y dejaría de valer al día
 *    siguiente. Condición del auditor.
 *
 * POR QUÉ HACE FALTA DECIR EL DÍA. El TTL de una invitación son 24 HORAS
 * (`INVITE_TTL_MS`), no los 15 minutos de una recuperación. O sea que la
 * caducidad cae en el día SIGUIENTE la mayor parte de las veces, y escribir solo
 * "hasta las 15:40" sería ambiguo justo en el caso normal.
 */

const MX_TZ = "America/Mexico_City";

/** Día natural en México, como "2026-08-01", para poder comparar. */
function diaEnMexico(instante: number): string {
  // `en-CA` da directamente el formato ISO (YYYY-MM-DD), que es el único que se
  // puede comparar con `===` sin trocear nada.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante));
}

function horaEnMexico(instante: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instante));
}

function fechaCortaEnMexico(instante: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_TZ,
    day: "numeric",
    month: "long",
  }).format(new Date(instante));
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * "hoy a las 15:40", "mañana a las 15:40" o "el 3 de agosto a las 15:40".
 *
 * El "mañana" se calcula comparando DÍAS NATURALES en México, no restando 24
 * horas: a las 23:50 de hoy, algo que caduca dentro de 20 minutos es mañana, y
 * una resta diría que es hoy.
 */
export function formatearCaducidad(expiresAt: number, ahora: number): string {
  const dia = diaEnMexico(expiresAt);
  const hoy = diaEnMexico(ahora);
  const manana = diaEnMexico(ahora + UN_DIA_MS);

  const hora = horaEnMexico(expiresAt);
  if (dia === hoy) return `hoy a las ${hora}`;
  if (dia === manana) return `mañana a las ${hora}`;
  return `el ${fechaCortaEnMexico(expiresAt)} a las ${hora}`;
}
