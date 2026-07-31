/**
 * Content Security Policy con nonce por petición (KAR-103).
 *
 * POR QUÉ. El JWT de acceso vive en `localStorage` y un XSS podría leerlo. Ese
 * riesgo está aceptado a conciencia y acotado —30 minutos, sin renovación,
 * cortable revocando la sesión—, pero hasta ahora la única CSP era
 * `frame-ancestors 'none'`: no había `script-src`, así que un XSS se ejecutaba
 * sin ningún obstáculo. Esto ataca la PROBABILIDAD del XSS, que es la mitad que
 * de verdad mueve la aguja.
 *
 * POR QUÉ AQUÍ Y NO EN next.config.mjs. Por dos motivos que no se pueden
 * salvar con una cabecera estática: el nonce cambia en cada petición, y
 * `connect-src` depende de `NEXT_PUBLIC_CONVEX_URL`, que es distinta en
 * desarrollo y en producción.
 *
 * CÓMO LLEGA EL NONCE A LOS SCRIPTS. El middleware pone esta cabecera también en
 * las cabeceras de la PETICIÓN. Next la lee ahí
 * (`next/dist/server/app-render/app-render.js`), extrae el `'nonce-…'` de
 * `script-src` y se lo pone a los scripts que inyecta. Si esta cabecera dejara
 * de llevar el nonce en `script-src`, Next dejaría de marcarlos y la página se
 * quedaría en blanco en modo bloqueo.
 */

/**
 * `true` = solo informar, `false` = bloquear de verdad.
 *
 * Es un interruptor de UN solo sitio a propósito: cambiar de modo tiene que ser
 * un cambio de una línea, visible en el diff y fácil de revertir.
 *
 * VALOR ESPERADO POR PASO DE DESPLIEGUE:
 *   PR 1 (primer despliegue) ....... true   ← nada se bloquea, solo se observa
 *   commit siguiente, ya validado .. false  ← bloqueo real
 *
 * El motivo de no empezar bloqueando es que una CSP mal calibrada no degrada la
 * aplicación: la rompe, y deja a las dos usuarias fuera sin forma de avisar.
 * En DESARROLLO se trabaja siempre en bloqueo (ver `construirCSP`), que es donde
 * interesa que las violaciones duelan.
 */
export const CSP_REPORT_ONLY = false;

/**
 * Nombre de la cabecera, derivado de UNA SOLA fuente.
 *
 * Que sea una función y no dos constantes sueltas es deliberado: si el nombre se
 * escribiera en dos sitios, un despiste podría emitir a la vez
 * `Content-Security-Policy` y `…-Report-Only`, que es lo peor de los dos mundos
 * —el navegador aplicaría la bloqueante y el informe daría una falsa sensación
 * de estar solo observando—.
 *
 * DESARROLLO BLOQUEA SIEMPRE, pase lo que pase con `CSP_REPORT_ONLY`. El modo
 * informe existe para no romper producción mientras se valida, y ahí tiene todo
 * el sentido; en local sería contraproducente, porque las violaciones dejarían
 * de doler justo donde interesa que duelan y se descubrirían en producción.
 */
export function nombreCabeceraCSP(esDesarrollo: boolean): string {
  const soloInformar = CSP_REPORT_ONLY && !esDesarrollo;
  return soloInformar
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

/** Nonce nuevo por petición. Nunca reutilizado ni derivado de nada adivinable. */
export function generarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 sin depender de Buffer: el middleware corre en el runtime Edge.
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Construye la cabecera. PURA: no lee el entorno ni el reloj, para poder
 * comprobar cada directiva en una prueba sin levantar un navegador.
 */
export function construirCSP({
  nonce,
  esDesarrollo,
  convexUrl,
}: {
  nonce: string;
  esDesarrollo: boolean;
  convexUrl: string | undefined;
}): string {
  // Convex se habla por HTTPS y por WebSocket contra el mismo host.
  //
  // El esquema se deriva con `new URL` en vez de con un reemplazo de texto: un
  // `replace(/^https:/…)` sobre una URL que no fuera https no habría fallado,
  // habría metido dos veces el mismo origen y dejado la aplicación sin
  // WebSocket, que es peor que fallar. Si el valor no es una URL válida se
  // omite y se registra: la CSP sale con `'self'` y la aplicación fallará por
  // otros motivos, porque el proveedor de Convex ya es fail-closed.
  const convex: string[] = [];
  if (convexUrl) {
    try {
      const url = new URL(convexUrl);
      const esquemaWs = url.protocol === "http:" ? "ws:" : "wss:";
      convex.push(url.origin);
      convex.push(`${esquemaWs}//${url.host}`);
    } catch {
      console.error(
        `[csp] NEXT_PUBLIC_CONVEX_URL no es una URL válida (${convexUrl}); ` +
          `connect-src saldrá sin Convex y la aplicación no podrá hablar con el backend.`,
      );
    }
  }

  const directivas = [
    "default-src 'self'",

    // `strict-dynamic` es lo que permite que los chunks que Next carga desde su
    // script de arranque hereden la confianza sin enumerarlos uno a uno. Los
    // navegadores que lo entienden ignoran `'self'`; se deja por los que no.
    //
    // `'unsafe-eval'` SOLO en desarrollo: `next dev` compila con eval para los
    // source maps. Si aparece en producción, la CSP queda de adorno.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      esDesarrollo ? " 'unsafe-eval'" : ""
    }`,

    // CONCESIÓN CONSCIENTE: la aplicación usa 15 atributos `style={{…}}`
    // repartidos por 8 archivos, y sin `'unsafe-inline'` se quedaría sin
    // diseño. Quitarlos es un refactor de interfaz que no pinta nada en una
    // tarea de seguridad, y el riesgo de `style-src` es de otro orden que el de
    // `script-src`: con estilos no se roba un token.
    "style-src 'self' 'unsafe-inline'",

    // La fuente es next/font/google, que Next descarga al compilar y sirve desde
    // el propio dominio. No hay peticiones a Google en tiempo de ejecución.
    "font-src 'self'",

    // No hay <img> remotas ni next/image. `data:` por si algún SVG va en línea.
    "img-src 'self' data:",

    // `'self'` NO ES OPCIONAL, y borrarlo rompe la aplicación entera:
    //   1. `signIn` y `signOut` pasan por un fetch same-origin a `/api/auth`
    //      (el proxy del middleware de Convex Auth). Sin `'self'` no se puede
    //      ni iniciar sesión.
    //   2. Las transiciones de Next piden sus payloads al propio origen.
    // Y `default-src 'self'` NO cubre esto: cuando `connect-src` existe,
    // sustituye al respaldo de `default-src` para fetch, XHR y WebSocket.
    ["connect-src 'self'", ...convex].join(" "),

    // Nada de <object>, <embed> ni <applet>.
    "object-src 'none'",

    // Que un XSS no pueda reescribir la base de las URLs relativas.
    "base-uri 'self'",

    // La aplicación no embebe nada.
    "frame-src 'none'",

    // El login con Google NO es un envío de formulario: la librería hace
    // `window.location.href = …`, una navegación de nivel superior que esta
    // directiva ni mira. Así que cerrarla no le afecta.
    "form-action 'self'",

    // Antiframing. Estaba en next.config.mjs desde KAR-101 y se trae aquí para
    // que toda la CSP viva en un solo sitio; X-Frame-Options sigue allí como
    // segundo candado.
    "frame-ancestors 'none'",
  ];

  // En desarrollo se sirve por HTTP; forzar HTTPS ahí rompería el entorno local.
  if (!esDesarrollo) directivas.push("upgrade-insecure-requests");

  return directivas.join("; ");
}
