/**
 * Marca de "esta salida la hemos provocado nosotros" (KAR-55, M1).
 *
 * EL PROBLEMA QUE RESUELVE. `users.actualizar` borra las sesiones de la dueña
 * cuando esta se cambia su PROPIO correo. Es correcto y es deliberado, pero deja
 * a la pantalla con un token cuyo respaldo ya no existe: `users.me` pasa a
 * `null`, y el efecto de AppShell interpreta ese `null` como "cuenta sin acceso"
 * y manda a `/login?error=disabled`. La dueña acabaría leyendo "Tu cuenta no
 * tiene acceso" justo después de una operación que salió perfectamente.
 *
 * LO QUE NO SE HACE: intentar que la pantalla redirija ANTES que AppShell. Eso
 * es una carrera, y una carrera no es una garantía. La pantalla y el chrome son
 * dos caminos asíncronos y cualquiera puede llegar primero.
 *
 * LO QUE SE HACE: que el resultado de la carrera dé igual. Los dos caminos leen
 * esta marca y calculan el MISMO destino, así que el orden en que corran deja de
 * decidir nada. La carrera sigue existiendo; lo que se elimina es que importe.
 *
 * ⚠️ VARIABLE DE MÓDULO, NO ESTADO DE REACT, Y ESTO ES EL CENTRO DEL ARREGLO.
 * Un `useState` no se puede leer hasta el render siguiente: un efecto que corriera
 * antes vería el valor viejo y volveríamos a tener exactamente la carrera que se
 * quiere quitar. Una variable de módulo se escribe y se lee de forma síncrona, en
 * el mismo tick.
 *
 * LA INVARIANTE, y hay que respetarla al pie de la letra al tocar esto:
 *
 *   Desde el instante ANTERIOR a llamar a la mutación que puede invalidar la
 *   sesión, y hasta que la navegación ocurre, el destino de cualquier salida es
 *   `/login` sin parámetro de error, la ejecute la pantalla o el efecto de
 *   AppShell.
 *
 * De ahí salen las dos reglas de uso:
 *   1. `marcar()` va ANTES del primer `await` que pueda invalidar la sesión.
 *      Después del `await` ya es tarde: entre medias cabe el efecto.
 *   2. `limpiar()` va en TODOS los caminos en los que al final no hubo salida
 *      (error, o la operación no llegó a cambiar nada). Una marca que se queda
 *      puesta enmascara un "sin acceso" de verdad más adelante.
 */

let intencionada = false;

/** Ver la regla 1 de la cabecera: antes del `await`, nunca después. */
export function marcarSalidaIntencionada(): void {
  intencionada = true;
}

export function haySalidaIntencionada(): boolean {
  return intencionada;
}

/** Ver la regla 2 de la cabecera: en todos los caminos sin salida. */
export function limpiarSalidaIntencionada(): void {
  intencionada = false;
}

/**
 * Destino de una salida por sesión perdida. Lo comparten la pantalla y AppShell
 * A PROPÓSITO: es lo que hace que el orden entre los dos no cambie el resultado.
 * Si algún día hay otro sitio que eche a alguien a /login, tiene que pasar por
 * aquí.
 */
export function destinoDeSalida(): string {
  return haySalidaIntencionada() ? "/login" : "/login?error=disabled";
}
