/**
 * Transporte de correo y maqueta compartida (KAR-106).
 *
 * Hasta ahora la llamada a Resend y el HTML vivían dentro de la función que
 * mandaba el código de recuperación. Con un segundo correo —el aviso de cambio
 * de contraseña— eso se duplicaría, así que se extrae aquí.
 *
 * Este módulo no sabe nada de contraseñas ni de códigos: recibe un contenido ya
 * compuesto y lo manda. La decisión de si un fallo de envío es fatal NO es suya,
 * es de cada flujo: `sendEmail` LANZA y quien llama decide. El correo del código
 * lo trata como fatal (sin correo no hay nada que hacer); el aviso de cambio no
 * (la contraseña ya cambió y lo único que se pierde es la notificación).
 *
 * Requiere `RESEND_API_KEY` en el deployment. Se fija con
 * `npx convex env set RESEND_API_KEY`, SIN el valor en la línea de comandos: el
 * CLI lo pide por stdin y así no queda en el historial del shell ni en la lista
 * de procesos.
 */

const FROM = "KSE CRM <no-reply@crm-kse.com>"; // dominio verificado en Resend

/**
 * Tope de espera de la llamada a Resend.
 *
 * No es una optimización, es parte del contrato de seguridad. Un `try/catch`
 * protege de un error, pero NO de una llamada que se queda pendiente: si el
 * runtime aborta la ejecución por agotar su presupuesto de tiempo, el `catch`
 * no llega a correr y el fallo se propaga a quien llamó. En el aviso de cambio
 * de contraseña eso significaba que la pantalla de login dijera "El código no
 * es válido o ha caducado" con la contraseña YA cambiada.
 *
 * El aviso además se manda desde un trabajo programado (ver
 * convex/passwordChangedEmail.ts), así que esto es la segunda línea: evita que
 * ese trabajo se quede colgado en vez de fallar con un mensaje legible.
 */
const TIMEOUT_MS = 8_000;

/**
 * Tope para leer el cuerpo de una respuesta de Resend, sea de error o de éxito.
 *
 * Va aparte de TIMEOUT_MS porque cubre otro tramo: cuando `fetch` resuelve, el
 * temporizador abortable ya se ha limpiado, pero el CUERPO puede seguir
 * llegando. Sin este tope, una respuesta que no termina de descargarse dejaría
 * `sendEmail` pendiente aunque la petición ya hubiera "respondido". En el aviso
 * de cambio de contraseña eso no afectaría a nadie (va en un trabajo
 * programado), pero el correo del código sí está en el camino crítico de
 * `requestCode`. Es corto a propósito: el cuerpo solo sirve para diagnosticar, y
 * un registro sin detalle es mejor que una función colgada.
 */
const CUERPO_TIMEOUT_MS = 2_000;

/** Correo ya compuesto: lo que devuelven los `build*Email` de cada flujo. */
export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Manda un correo por la API REST de Resend (con `fetch`, sin SDK ni
 * dependencias nuevas). LANZA si no se puede entregar a Resend.
 *
 * `to` debe ser SIEMPRE la dirección almacenada en la cuenta
 * (`authAccounts.providerAccountId`), nunca una cadena que venga del cliente.
 *
 * `flujo` es una etiqueta corta para el registro ("recuperación", "invitación"…).
 * Es OBLIGATORIA, no opcional: sin ella todas las líneas del registro se
 * parecerían y no se podría saber qué correo salió (KAR-116).
 */
export async function sendEmail(
  to: string,
  { subject, text, html }: EmailContent,
  flujo: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Falta RESEND_API_KEY en el entorno del deployment.");
  }

  // `AbortController` explícito y no `AbortSignal.timeout`, por disponibilidad
  // en el runtime. El temporizador se limpia en `finally` TAMBIÉN cuando la
  // petición responde rápido: si no, quedaría un temporizador vivo por cada
  // envío correcto.
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
      signal: controlador.signal,
    });
  } catch (e) {
    if (controlador.signal.aborted) {
      throw new Error(
        `Resend no respondió en ${TIMEOUT_MS / 1000} s; se abortó el envío.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(temporizador);
  }

  if (!response.ok) {
    throw new Error(
      `Resend rechazó el envío (HTTP ${response.status}). ${await leerDetalleDelError(response)}`,
    );
  }

  /**
   * RASTRO DEL ENVÍO QUE SÍ SALE (KAR-116).
   *
   * Hasta aquí este módulo solo dejaba constancia de los fallos, y eso convirtió
   * un incidente real —"no llega el correo de recuperación"— en cuarenta minutos
   * de deducción: la única señal de que un correo había salido era INDIRECTA, que
   * la fila del código siguiera en la tabla, porque quien llama la borra cuando
   * el envío falla. Con el id de Resend delante, la misma pregunta se contesta
   * cruzando este registro con su panel.
   *
   * QUÉ NO VA EN ESTA LÍNEA, y es deliberado: ni el destinatario ni nada del
   * contenido. El id ya permite mirar el envío en Resend, que es donde esos datos
   * viven de por sí; duplicarlos en el registro del deployment sería repartir el
   * mismo dato por más sitios sin ganar nada.
   *
   * El id se lee del cuerpo, así que se paga una lectura en el camino crítico de
   * `requestCode`. Está acotada por CUERPO_TIMEOUT_MS y, si no llega a tiempo, se
   * registra igual sin id: saber que Resend aceptó ya es la mitad de la respuesta.
   */
  const id = await leerIdDeResend(response);
  console.info(
    `[email] ${flujo}: Resend aceptó el envío` +
      (id === null ? " (sin id: el cuerpo no llegó a tiempo)." : ` (id ${id}).`),
  );
}

/**
 * El `id` que Resend devuelve en el cuerpo de una respuesta correcta, o `null`.
 *
 * Nunca lanza: este dato es para el registro, y quedarse sin él no puede tumbar
 * un correo que Resend YA ha aceptado. Un cuerpo que no es JSON, o que no trae
 * `id`, se trata igual que uno que no llegó a tiempo.
 */
async function leerIdDeResend(response: Response): Promise<string | null> {
  const cuerpo = await leerCuerpoAcotado(response);
  if (cuerpo === null) return null;
  try {
    const datos: unknown = JSON.parse(cuerpo);
    if (typeof datos === "object" && datos !== null && "id" in datos) {
      const id = (datos as { id: unknown }).id;
      if (typeof id === "string") return id;
    }
  } catch {
    // Cuerpo que no es JSON. No es un fallo del envío.
  }
  return null;
}

/**
 * Lee el cuerpo de una respuesta con el tope de CUERPO_TIMEOUT_MS, o `null` si
 * no llega a tiempo. Lo comparten el camino de error y el de éxito: la carrera
 * contra el temporizador es idéntica en los dos y tenerla dos veces es tenerla
 * mal una de ellas.
 */
async function leerCuerpoAcotado(response: Response): Promise<string | null> {
  const AGOTADO = Symbol("agotado");
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  try {
    const cuerpo = await Promise.race([
      // Un fallo al leer se trata como cuerpo vacío, no como excepción.
      response.text().catch(() => ""),
      new Promise<typeof AGOTADO>((resolve) => {
        temporizador = setTimeout(() => resolve(AGOTADO), CUERPO_TIMEOUT_MS);
      }),
    ]);
    return cuerpo === AGOTADO ? null : cuerpo;
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Lee el cuerpo de una respuesta de error para poder diagnosticar.
 *
 * Acotado EN TIEMPO por `leerCuerpoAcotado`, por lo explicado en
 * `CUERPO_TIMEOUT_MS`.
 *
 * Del tamaño solo se acota lo que SALE: el `slice` evita volcar en los logs
 * entero lo que devuelva un tercero, que podría acabar metiendo ahí datos de la
 * destinataria. Lo que NO se acota es lo que ENTRA — `response.text()` lee el
 * cuerpo completo en memoria si llega dentro del plazo. Hoy se asume porque el
 * tercero es Resend y el tiempo ya está topado; el día que eso deje de bastar,
 * hay que leer por trozos, y entonces este comentario deja de valer.
 *
 * Nunca lanza: el error que importa es el HTTP, no el de leer su explicación.
 */
async function leerDetalleDelError(response: Response): Promise<string> {
  const cuerpo = await leerCuerpoAcotado(response);
  if (cuerpo === null) return "(el cuerpo de la respuesta no llegó a tiempo)";
  return cuerpo.slice(0, 200);
}

/**
 * Envoltorio HTML común: cabecera de marca, caja blanca y pie. `titulo` y
 * `cuerpoHtml` son literales nuestros, nunca entrada de nadie.
 */
export function emailShell({
  titulo,
  cuerpoHtml,
}: {
  titulo: string;
  cuerpoHtml: string;
}): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <!--
      Los dos correos de este sistema llevan un código de 8 dígitos, y hay
      clientes (iOS Mail entre otros) que detectan una cadena así como un
      teléfono y la convierten en un enlace \`tel:\`. Eso, además de quedar raro,
      se lo entrega a los reescritores de enlaces de los antivirus de correo,
      que lo envuelven en su propia URL y pueden dejarlo ilegible. Con esto el
      código se queda como lo que es: texto que hay que copiar.
    -->
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  </head>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#1c1c1c;">KSE</div>
      <div style="margin-top:2px;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#8a8a8a;">CRM</div>
      <h1 style="margin:24px 0 8px;font-size:19px;font-weight:700;color:#1c1c1c;">${titulo}</h1>
${cuerpoHtml}
      <p style="margin:28px 0 0;font-size:11px;color:#b0b0b0;">KSE CRM &copy; 2026</p>
    </div>
  </body>
</html>`;
}

/** Escapa lo que va dentro de un atributo HTML. */
export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Hosts a los que este sistema puede enlazar desde un correo. Lista CERRADA y
 * escrita a mano a propósito: si saliera de `SITE_URL` no defendería de nada,
 * porque de lo que defiende es precisamente de que `SITE_URL` esté mal.
 *
 * `www.crm-kse.com` NO está, y no es un olvido: comprobado que no resuelve, así
 * que enlazarlo mandaría a la gente a un sitio caído. Si algún día se configura,
 * se añade aquí.
 */
const HOSTS_PERMITIDOS = new Set(["crm-kse.com"]);

/** Hosts de desarrollo, para que el entorno local siga siendo útil. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

/**
 * URL de la pantalla de inicio de sesión, o `null` si `SITE_URL` no vale.
 *
 * Tres reglas, y las tres tienen que cumplirse:
 *   1. Se construye con `new URL`, nunca concatenando cadenas.
 *   2. El esquema es `https:` (o `http:` en un host local).
 *   3. El host está en la lista de arriba.
 *
 * La tercera es la que se añadió en KAR-107. Con solo las dos primeras, un
 * `SITE_URL` mal puesto como `https://crm-kse.com.atacante.net` pasaba la
 * validación y acababa como enlace dentro de un correo de seguridad: un dominio
 * ajeno que se parece al nuestro, en el correo que precisamente avisa de que
 * alguien te ha tocado la cuenta.
 *
 * Ante cualquier duda, `null`: el correo sale sin enlace. Un correo de seguridad
 * que enseña a pinchar el dominio equivocado es peor que uno sin enlace.
 */
export function loginUrl(): string | null {
  const base = process.env.SITE_URL;
  if (!base) return null;

  let url: URL;
  try {
    url = new URL("/login", base);
  } catch {
    console.error(
      `[email] SITE_URL no es una URL válida (${base}); el correo saldrá sin enlace.`,
    );
    return null;
  }

  // `url.hostname` ya viene normalizado en minúsculas por el propio `URL`.
  const esLocal = HOSTS_LOCALES.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && esLocal)) {
    console.error(
      `[email] SITE_URL no es https (${base}); el correo saldrá sin enlace.`,
    );
    return null;
  }
  if (!esLocal && !HOSTS_PERMITIDOS.has(url.hostname)) {
    console.error(
      `[email] SITE_URL apunta a un host no permitido (${url.hostname}); ` +
        `el correo saldrá sin enlace.`,
    );
    return null;
  }
  // Canonicalizada, para que nadie tenga que volver a interpolar nada.
  return url.toString();
}
