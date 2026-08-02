/**
 * AUTORIDAD ÚNICA SOBRE A DÓNDE VA ALGUIEN CUANDO SE QUEDA SIN SESIÓN (KAR-112).
 *
 * Nadie más decide ese destino. Si algún camino de la aplicación escribe
 * `/login` o `/login?error=…` a mano, ese camino puede divergir de los demás
 * sin que falle nada — y esa divergencia es exactamente el fallo que este
 * módulo existe para evitar.
 *
 * ── EL PROBLEMA ───────────────────────────────────────────────────────────
 *
 * Una sesión puede terminar por motivos muy distintos, y el cliente NO puede
 * distinguirlos: `users.me` devuelve `null` tanto si la cuenta está inactiva
 * como si la sesión ya no existe, porque `currentActiveUser` los colapsa a
 * propósito (ver convex/authz.ts). Encima, el final de una sesión se nota por
 * DOS señales que llegan en orden impredecible —`isAuthenticated` pasa a falso,
 * y `users.me` pasa a `null`— y cada una dispara una rama distinta del AppShell.
 *
 * Con el destino escrito a mano en cada rama, el mensaje acababa dependiendo de
 * qué señal ganara la carrera. Medido en KAR-55 y KAR-112, el resultado era el
 * peor posible y estaba al revés:
 *
 *   - cerrar sesión normalmente enseñaba "Tu cuenta no tiene acceso", que es
 *     FALSO;
 *   - que te desactivaran la cuenta con la sesión abierta no enseñaba NADA,
 *     que es justo cuando había algo que decir.
 *
 * ── LO QUE NO SE HACE ─────────────────────────────────────────────────────
 *
 * No se intenta GANAR la carrera. Una carrera ganada casi siempre sigue siendo
 * una carrera. Lo que se hace es que su resultado dé igual: todos los caminos
 * leen esta marca y calculan el destino con la MISMA función, así que el orden
 * en que corran deja de decidir nada.
 *
 * Tampoco se intenta adivinar POR QUÉ terminó la sesión. El texto involuntario
 * es neutro —"Tu sesión se cerró"— y es cierto en todos los casos: que te
 * desactiven corta la sesión igual que revocarla. Decir el motivo exacto
 * exigiría que el backend lo revelara, y esa es superficie nueva en auth a
 * cambio de precisión en un mensaje. Además chocaría con la opacidad del login
 * (KAR-111), que es deliberada. Ver la decisión completa en KAR-112.
 *
 * ⚠️ VARIABLE DE MÓDULO, NO ESTADO DE REACT, Y ESTO ES EL CENTRO DE TODO.
 * Un `useState` no se puede leer hasta el render siguiente: un efecto que
 * corriera antes vería el valor viejo y volveríamos a tener la carrera que se
 * quiere quitar. Una variable de módulo se escribe y se lee de forma síncrona,
 * en el mismo tick.
 *
 * ── LA INVARIANTE, y hay que respetarla al pie de la letra ────────────────
 *
 *   Desde el instante ANTERIOR a la operación que puede invalidar la sesión, y
 *   hasta que la navegación ocurre, el destino es el mismo lo ejecute quien lo
 *   ejecute.
 *
 * De ahí salen las tres reglas de uso:
 *   1. `marcar()` va ANTES del primer `await` que pueda invalidar la sesión.
 *      Después ya es tarde: entre medias cabe el efecto.
 *   2. `limpiar()` va en TODOS los caminos en los que al final no hubo salida
 *      (un error, o una operación que no llegó a cambiar nada). Una marca que
 *      se queda puesta silencia un aviso legítimo más adelante.
 *   3. NINGÚN camino escribe el destino a mano. Se pide con `destinoDeSalida()`.
 *
 * Puntos de uso hoy: `components/nav/AppShell.tsx` (las dos ramas de salida y
 * el cierre de sesión) y `app/(app)/usuarios/UsuarioModal.tsx` (la dueña se
 * cambia su propio correo, que borra sus sesiones).
 *
 * NO cubre el middleware (`middleware.ts`), que corre en el servidor y no
 * comparte este módulo: allí no hay sesión de la que salir, solo una petición
 * sin credenciales que se manda a `/login`. Es correcto que esté aparte.
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
 * A dónde va quien se queda sin sesión. Ver la regla 3: esto no se replica.
 *
 * Si la persona lo pidió (cerrar sesión, cambiarse el correo) no hay nada que
 * explicarle y se va a `/login` limpio. Si no lo pidió, se le dice lo único que
 * es cierto en todos los casos, sin detallar el motivo.
 */
export function destinoDeSalida(): string {
  return haySalidaIntencionada() ? "/login" : "/login?error=sesion";
}
