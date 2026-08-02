import { action, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import {
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { INVITE_TTL_MS, normalizeEmail, passwordProblem } from "./authShared";
import {
  CODE_TTL_MS,
  generateNumericCode,
  sendResetCodeEmail,
} from "./passwordResetEmail";
import { sendInvitationEmail } from "./invitationEmail";

/**
 * Recuperación de contraseña por código (KAR-100). Flujo PROPIO, no el nativo de
 * Convex Auth.
 *
 * POR QUÉ PROPIO. El flujo `reset` de la librería no pasa por ningún límite de
 * intentos: el rate limit solo se activa cuando se envía un secret, y `reset` no
 * lo envía. Peor: dentro de la librería el orden es
 *   1) generar código  2) GUARDARLO (borrando el anterior)  3) enviar el correo,
 * y el único punto de extensión con `ctx` es el (3), cuando el (2) ya está
 * commiteado. O sea que cualquier cuota puesta ahí frena el correo pero NO evita
 * que un anónimo invalide sin parar el código que la usuaria acaba de recibir.
 *
 * Los flows `reset` y `reset-verification` de la librería quedan cerrados POR RED
 * en convex/auth.ts (`ALLOWED_FLOWS`), así que este es el único camino.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO (auditoría de login, hallazgo A1)
 *
 *   UN CÓDIGO VIVO ES SAGRADO: ninguna petición nueva lo invalida, y ningún
 *   fallo de intentos lo mata de forma permanente.
 *
 * Y detrás de ella, el principio del que sale:
 *
 *   TODO CUPO QUE SE AGOTA ES UN ARMA. Cualquier contador que un desconocido
 *   pueda vaciar en nombre de la víctima deja de ser una defensa y pasa a ser el
 *   ataque.
 *
 * La versión anterior tenía DOS cupos agotables, y con cualquiera de los dos un
 * anónimo que supiera un correo dejaba a esa persona sin recuperación de forma
 * indefinida y SILENCIOSA (la pantalla afirma que el correo salió):
 *
 *   1. La cuota de solicitudes (3 cada 15 min) la consumía cualquiera. Gastando
 *      los tres huecos al principio de cada ventana —288 peticiones al día, un
 *      bucle trivial— la petición legítima caía en el rechazo y no se enviaba
 *      nada. ARREGLO: pedir cuando ya hay un código vivo no rota nada y NO
 *      CONSUME CUOTA (`prepararEnvio`, paso 2). Al no poder rotarlo ni gastar la
 *      cuota, el atacante se queda sin ambas palancas: la víctima siempre acaba
 *      con un código utilizable en el buzón.
 *
 *   2. Los 5 intentos de verificación se agotaban y BORRABAN el código. Eso
 *      reinstauraba exactamente la misma denegación por otra puerta: bastaba con
 *      quemar los cinco intentos de cada código recién nacido. ARREGLO: los
 *      intentos se RECARGAN con el tiempo en vez de agotarse (`consumeCode`), con
 *      la misma fórmula que la propia librería usa para el login
 *      (implementation/rateLimit.js). Un atacante retrasa a la usuaria unos
 *      minutos; no le quita el código.
 *
 * Al quitar los cupos agotables hay que compensar la fuerza bruta por otro lado,
 * y se hace AMPLIANDO EL ESPACIO, no recortando intentos: el código pasó de 6 a 8
 * dígitos (ver convex/authShared.ts). Recortar intentos habría vuelto a crear un
 * cupo agotable, o sea a reintroducir el fallo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE SE DECIDIÓ NO ARREGLAR (hallazgo A2, riesgo aceptado)
 *
 * Esta acción tarda distinto según el correo exista o no: con cuenta hay una
 * llamada HTTP a Resend en el camino crítico; sin cuenta se sale en una query.
 * Eso permite averiguar por tiempos qué correos están dados de alta, y desmonta
 * la indistinguibilidad que el resto del archivo persigue.
 *
 * No se arregla, y conviene que conste POR QUÉ, porque el arreglo parece obvio y
 * no lo es. Diferir el envío con `ctx.scheduler` obligaría a pasar el código EN
 * CLARO como argumento de una función programada, y los argumentos de una
 * función aparecen en los registros del deployment (ver la cabecera de
 * convex/passwordChangedEmail.ts, que establece esa regla). Guardarlo en una
 * fila intermedia contradice el diseño HMAC+pepper de KAR-100, que existe
 * justamente para que leer la tabla no dé códigos usables. Las dos salidas
 * cambian una fuga menor por una mayor.
 *
 * Y aquí el impacto es nulo: hay dos cuentas y sus correos están PUBLICADOS en
 * este mismo repositorio (convex/seed.ts y la caja de credenciales demo del
 * login). La enumeración no revela nada que no esté en GitHub.
 *
 * CONDICIÓN DE REVISIÓN: si el CRM deja de ser un sistema cerrado de dos
 * personas, esto pasa a ser un hallazgo real y hay que diferir el envío
 * resolviendo antes cómo transportar el secreto sin que acabe en los registros.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y DESDE KAR-111 HAY UN SEGUNDO CANAL, ESTE DELIBERADO
 *
 * `iniciarAcceso` (más abajo) responde distinto cuando un correo tiene una
 * INVITACIÓN PENDIENTE. O sea que, además de la fuga por tiempos de arriba, este
 * archivo expone a propósito un dato concreto: si una dirección tiene una cuenta
 * creada a la que todavía no se le ha puesto contraseña.
 *
 * No es lo mismo que enumerar cuentas: los otros tres casos —sin cuenta, con
 * contraseña y desactivada— responden exactamente igual, así que probar
 * direcciones al azar no distingue nada. El razonamiento completo, y por qué la
 * alternativa era peor, está en la cabecera de `iniciarAcceso` y en el README.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Solicitudes permitidas por correo dentro de la ventana.
 *
 * Ojo con lo que esta cuota limita HOY: solo las peticiones que de verdad emiten
 * un código, porque pedir con un código vivo ya no la toca. Deja de ser un
 * candado sobre la usuaria y pasa a ser lo que debía ser: un tope al volumen de
 * correo que se puede provocar.
 */
const QUOTA_MAX = 3;
const QUOTA_WINDOW_MS = 15 * 60 * 1000;

/**
 * Intentos simultáneos de introducir el código. Se RECARGAN, no se agotan.
 *
 * Se exporta para que la invitación de convex/users.ts emita códigos con
 * exactamente el mismo presupuesto de intentos. Duplicar el número allí sería
 * dejar dos verdades que se separan al primer ajuste.
 */
export const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Tiempo en el que se recarga el cupo completo de intentos: 5 por cada 10
 * minutos, o sea uno cada dos minutos.
 *
 * El número sale de un equilibrio explícito. Al alza, la usuaria legítima que se
 * equivoca varias veces espera de más. A la baja, un atacante que quema intentos
 * sin parar mantiene el cupo a cero y la deja fuera durante más tiempo. Dos
 * minutos son un estorbo tolerable para quien tiene el código correcto —le basta
 * UN hueco— y dejan al atacante en ~720 intentos al día, que contra 10^8 códigos
 * posibles es alrededor de un 0,02 % al mes.
 */
const VERIFY_REFILL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Mensaje ÚNICO para todos los fallos de verificación. Que sea el mismo para
 * "no hay código", "caducado", "sin intentos", "código incorrecto" y "ese correo
 * no tiene cuenta" evita que la pantalla se convierta en un oráculo.
 *
 * EL TEXTO NOMBRA LAS DOS CAUSAS POSIBLES (KAR-116), y no es un adorno. El
 * anterior —"El código no es válido o ha caducado."— solo hablaba del código, y
 * este mismo mensaje se lanza cuando quien falla es el CORREO: si la dirección no
 * corresponde a una cuenta activa con contraseña, se sale AQUÍ, antes de mirar el
 * código siquiera. Pasó en producción el 2 de agosto: un código perfectamente
 * válido y sin estrenar recibió un "ha caducado" porque el correo del formulario
 * no era el suyo, y ese correo ni se veía en pantalla.
 *
 * Nombrar las dos causas NO abre ningún oráculo: sigue siendo UN SOLO texto para
 * todos los casos, así que no distingue nada. Lo único que cambia es que ahora
 * apunta a los dos sitios donde mirar en vez de a uno solo, y uno de ellos era el
 * equivocado la mitad de las veces.
 */
const INVALID_CODE =
  "No pudimos verificar el código. Comprueba que el correo de arriba sea el " +
  "tuyo; si el código ha caducado, pide uno nuevo.";

/**
 * Los fallos PREVISTOS de este archivo se lanzan como `ConvexError` (KAR-98).
 *
 * La diferencia no es cosmética: el `data` de un `ConvexError` llega íntegro al
 * navegador, mientras que el mensaje de un `Error` normal lo REDACTA Convex en
 * producción. Eso convierte el tipo del error en el contrato: `ConvexError`
 * significa "esto se le puede enseñar a quien llamó y le sirve para actuar".
 *
 * Antes aquí se lanzaba `Error` para todo, y la pantalla de login, que no podía
 * distinguir, respondía "El código no es válido o ha caducado." ante CUALQUIER
 * fallo — incluidos un pepper mal puesto o Convex inaccesible. Le decía a la
 * usuaria que su código no valía cuando el código estaba perfectamente bien.
 *
 * Regla al tocar este archivo: si el fallo es de configuración, de la librería o
 * de la base de datos, `Error` normal, para que el cliente lo trate como
 * imprevisto. `ConvexError` es solo para lo que la usuaria puede corregir.
 */

/**
 * HMAC-SHA256 del código con el pepper del deployment, en hexadecimal.
 *
 * Un sha256 pelado no bastaría: solo hay 10^8 códigos posibles, así que quien
 * consiguiera leer la tabla los precomputaría. Con el pepper (que vive en la
 * config del deployment, no en la base de datos) eso deja de servir.
 *
 * Se calcula en la ACTION y a las mutations les llega ya el hash: así el código
 * en claro nunca entra en el argumento de una mutation.
 *
 * Se exporta para la invitación de convex/users.ts. Es DELIBERADO que ese flujo
 * reutilice esta función y no tenga la suya: el pepper y su ausencia se tratan
 * en un solo sitio, y un código de invitación se guarda exactamente igual que
 * uno de recuperación (de hecho es el mismo, y lo consume el mismo camino).
 */
export async function hashCode(code: string): Promise<string> {
  const pepper = process.env.PASSWORD_RESET_PEPPER;
  if (!pepper) {
    throw new Error(
      "Falta PASSWORD_RESET_PEPPER en el entorno del deployment. " +
        // Sin el valor en la línea de comandos: el CLI lo pide por stdin y así
        // no queda en el historial del shell ni en la lista de procesos.
        "Fíjalo con `openssl rand -hex 32 | npx convex env set PASSWORD_RESET_PEPPER`.",
    );
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Comparación en tiempo constante de dos hashes hex. Con el cupo de intentos
 * recargándose despacio el riesgo real de un ataque por tiempos es despreciable,
 * pero cuesta cinco líneas y quita la pregunta de la revisión.
 */
function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ─────────────────────── Acciones públicas ─────────────────────── */

/**
 * Paso 1 — pedir el código.
 *
 * Devuelve `null` SIEMPRE, pase lo que pase: correo desconocido, código ya vivo,
 * cuota agotada o envío correcto son indistinguibles desde fuera. Un correo que
 * no está dado de alta no escribe NADA (ni código, ni fila de cuota), así que
 * tampoco deja rastro observable.
 *
 * ORDEN: se decide y se guarda (`prepararEnvio`, atómico) y solo DESPUÉS se
 * envía. Es el orden contrario al que tenía este archivo, y el cambio lo permite
 * la regla del código sagrado: como `prepararEnvio` ya no borra nunca un código
 * utilizable, guardar primero no puede destruir nada que la usuaria tenga en la
 * mano. Antes sí podía, y por eso se enviaba primero.
 *
 * A cambio hay que deshacer si el envío falla, o quedaría un código que nadie ha
 * recibido bloqueando la emisión del siguiente hasta que caducara — ver el
 * `catch`.
 */
export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // 1) Normalizar.
    const email = normalizeEmail(args.email);
    if (email === "") return null;

    // 2) ¿Existe la cuenta, y tiene acceso? Si no, salir sin escribir nada.
    //
    // El chequeo de `active` es del hallazgo A8: una cuenta desactivada podía
    // recibir código, cambiar contraseña y disparar correos, todo para nada,
    // porque `beforeSessionCreation` le corta el paso al entrar. No es escalada,
    // es trabajo y ruido que no debería existir. Y no filtra: esta acción
    // devuelve `null` en todos los casos.
    const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
      email,
    });
    if (account === null || !account.active) return null;

    // 3) Decidir y guardar, en una sola transacción. `prepararEnvio` es quien
    //    aplica la regla del código sagrado y la cuota; aquí no se decide nada.
    const code = generateNumericCode();
    const codeHash = await hashCode(code);
    const resultado = await ctx.runMutation(
      internal.passwordReset.prepararEnvio,
      {
        accountId: account._id,
        email,
        codeHash,
        expiresAt: Date.now() + CODE_TTL_MS,
        attemptsLeft: MAX_VERIFY_ATTEMPTS,
        // NUNCA `true` aquí. Este es el camino ANÓNIMO: si desde aquí se pudiera
        // forzar, cualquiera podría volver a rotar el código de una víctima, que
        // es el fallo que cerró la ronda anterior. El forzado es exclusivo de
        // `users.reenviarInvitacion`, con dueña autenticada y sobre cuentas que
        // aún no tienen contraseña.
        forzarPorDuena: false,
      },
    );
    // A QUIEN LLAMA se le devuelve SOLO el silencio. `motivo` y `expiresAt`
    // existen para la dueña autenticada y no pueden salir por aquí: esta action
    // devuelve `null` pase lo que pase, y decir por qué convertiría la pantalla
    // en un oráculo de qué correos tienen cuenta.
    //
    // AL REGISTRO DEL DEPLOYMENT sí va el motivo (KAR-116). Son dos públicos
    // distintos: el registro solo lo lee la dueña en el panel de Convex, así que
    // no abre ningún oráculo, y es exactamente el dato que faltaba el día que
    // "no llega el correo" resultó ser "no se envió ninguno, y con razón". Sin
    // esta línea, no enviar por código vivo y enviar correctamente dejan el mismo
    // rastro: ninguno.
    //
    // Se registra el `_id` de la cuenta, no el correo: para cruzarlo con las
    // tablas sirve igual y no reparte direcciones por los registros.
    if (!resultado.enviar) {
      console.info(
        `[passwordReset] No se emite código para la cuenta ${account._id} ` +
          `(motivo: ${resultado.motivo}). No sale ningún correo.`,
      );
      // El código recién generado se descarta sin más: nunca llegó a guardarse
      // ni a salir de aquí.
      return null;
    }

    // 4) Enviar, a la dirección ALMACENADA en la cuenta, nunca a la cadena que
    //    escribió quien llamó.
    try {
      await sendResetCodeEmail(account.providerAccountId, code);
    } catch (e) {
      // El código está guardado y nadie lo ha recibido. Si se quedara ahí,
      // bloquearía la emisión del siguiente durante los 15 minutos de su TTL
      // —precisamente por la regla que protege los códigos vivos—, y la usuaria
      // se quedaría sin poder reintentar. Así que se borra y se relanza.
      try {
        await ctx.runMutation(internal.passwordReset.descartarCodigo, {
          accountId: account._id,
          codeHash,
        });
      } catch (errorAlDescartar) {
        // No enmascarar el fallo original, que es el que explica lo ocurrido.
        console.error(
          "[passwordReset] Falló el envío del código Y no se pudo descartar el " +
            "código guardado. La usuaria no podrá pedir otro hasta que caduque.",
          errorAlDescartar instanceof Error
            ? errorAlDescartar.message
            : String(errorAlDescartar),
        );
      }
      throw e;
    }
    return null;
  },
});

/**
 * Paso 1 del LOGIN EN DOS PASOS (KAR-111): decide qué se le pide a este correo.
 *
 * La pantalla pregunta primero el correo y solo el correo. Con la respuesta de
 * aquí decide si pedir la contraseña o si mandar a configurar una por primera
 * vez. Existe porque obligar a alguien recién invitado a pulsar "¿Olvidaste tu
 * contraseña?" para poner la PRIMERA es mentira, y además le enseña a pinchar
 * enlaces de recuperación, que es el reflejo que explota el phishing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA ACTION PUEDE ROMPER SI SE TOCA SIN CUIDADO
 *
 * Ramificar según el estado del servidor es, por definición, contarle algo a
 * quien pregunta. Si un correo desconocido se comportara distinto de uno real,
 * este formulario sería un directorio de quién tiene cuenta en el CRM, y se
 * llevaría por delante la indistinguibilidad que el resto de este archivo
 * defiende.
 *
 * Lo que lo hace seguro es HACIA DÓNDE CAE LO DESCONOCIDO. Tres de los cuatro
 * casos responden lo mismo:
 *
 *     cuenta CON contraseña      -> "password"
 *     correo SIN cuenta          -> "password"   <- aquí está el truco
 *     cuenta DESACTIVADA         -> "password"
 *     cuenta SIN contraseña      -> "codigo"
 *
 * Probar direcciones al azar no distingue nada: sale siempre el mismo campo y,
 * al enviarlo, el mismo fallo genérico que una contraseña equivocada. Y los tres
 * casos de "password" salen SIN escribir ni enviar nada, así que tampoco se
 * distinguen por tiempo.
 *
 * RIESGO ACEPTADO, dicho sin adornos: sí queda expuesto que un correo concreto
 * tenga una invitación pendiente. Es un estado transitorio, de una cuenta en la
 * que por definición todavía no se puede entrar con contraseña. Preguntar eso no
 * consume cuota y se puede repetir; NO se añade un cupo para taparlo porque un
 * cupo que se agota volvería a ser un arma contra la persona invitada, que es la
 * regla que gobierna este archivo.
 *
 * REGLAS AL TOCAR ESTO:
 *   · `forzarPorDuena` SIEMPRE `false`. Esta action es anónima; permitir forzar
 *     desde aquí devolvería la capacidad de rotar el código ajeno.
 *   · La respuesta no lleva motivos, ni tiempos, ni banderas. Solo `paso`.
 *   · Cualquier error inesperado cae a "password" (ver el catch del final).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const iniciarAcceso = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ paso: "password" | "codigo" }> => {
    // Objeto único para las cuatro salidas no reveladoras: así no puede
    // colarse un campo de más en una de ellas y volverlas distinguibles.
    const PEDIR_CONTRASENA = { paso: "password" as const };

    try {
      const email = normalizeEmail(args.email);
      if (email === "") return PEDIR_CONTRASENA;

      const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
        email,
      });
      // Sin cuenta, o desactivada, o ya tiene contraseña: se pide contraseña y no
      // se escribe ni se envía nada.
      if (account === null) return PEDIR_CONTRASENA;
      if (!account.active) return PEDIR_CONTRASENA;
      if (!account.sinContrasena) return PEDIR_CONTRASENA;

      // ── Invitación pendiente ──
      const code = generateNumericCode();
      const codeHash = await hashCode(code);
      const resultado = await ctx.runMutation(
        internal.passwordReset.prepararEnvio,
        {
          accountId: account._id,
          email,
          codeHash,
          expiresAt: Date.now() + INVITE_TTL_MS,
          attemptsLeft: MAX_VERIFY_ATTEMPTS,
          forzarPorDuena: false, // NUNCA true: esto es el camino anónimo.
        },
      );

      if (resultado.enviar) {
        try {
          await sendInvitationEmail(
            account.providerAccountId,
            code,
            account.nombre,
          );
        } catch (e) {
          // El envío falló, pero la respuesta NO cambia: mandarla al campo de
          // contraseña sería peor, porque no tiene ninguna. La pantalla le
          // ofrece reintentar.
          console.error(
            "[passwordReset] No se pudo enviar la invitación desde iniciarAcceso.",
            e instanceof Error ? e.message : String(e),
          );
          try {
            await ctx.runMutation(internal.passwordReset.descartarCodigo, {
              accountId: account._id,
              codeHash,
            });
          } catch (errorAlDescartar) {
            console.error(
              "[passwordReset] Además, no se pudo descartar el código guardado.",
              errorAlDescartar instanceof Error
                ? errorAlDescartar.message
                : String(errorAlDescartar),
            );
          }
        }
      }
      // Si `enviar` era falso es porque ya hay un código vivo, y eso también es
      // "codigo": esa persona tiene un código utilizable en el buzón.
      return { paso: "codigo" as const };
    } catch (e) {
      // FAIL-CLOSED, y aquí "cerrado" es "password", que es la rama que no revela
      // nada. Un pepper mal puesto o Convex a medias no pueden convertirse en una
      // respuesta distinta que delate a nadie.
      console.error(
        "[passwordReset] iniciarAcceso falló; se responde 'password' para no " +
          "revelar nada.",
        e instanceof Error ? e.message : String(e),
      );
      return PEDIR_CONTRASENA;
    }
  },
});

/**
 * Paso 2 — verificar el código y cambiar la contraseña.
 *
 * No deja la sesión iniciada: es el cliente quien inicia sesión acto seguido con
 * la contraseña nueva. Así no hay que replicar el manejo de tokens y cookies que
 * el proxy de Next ya hace por nosotros para `auth:signIn`.
 */
export const resetPassword = action({
  args: {
    email: v.string(),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // La política de contraseñas se aplica ANTES de tocar nada, y en particular
    // antes de consumir un intento del código: escribir una contraseña floja no
    // debe costarle a nadie uno de sus intentos.
    //
    // Este mensaje SÍ es específico —la usuaria necesita saber qué le falta a su
    // contraseña— y puede serlo sin abrir nada: habla de lo que ella acaba de
    // escribir, no del estado del sistema. Se usa `passwordProblem`, que devuelve
    // el problema en vez de lanzarlo, para poder envolverlo en `ConvexError`;
    // `validatePassword` sigue existiendo con su firma para la librería.
    const problema = passwordProblem(args.newPassword);
    if (problema !== null) throw new ConvexError(problema);

    const email = normalizeEmail(args.email);
    const account = await ctx.runQuery(internal.passwordReset.accountByEmail, {
      email,
    });
    // Un correo sin cuenta —o de una cuenta sin acceso (A8)— responde EXACTAMENTE
    // lo mismo que un código malo. El mensaje opaco es obligatorio aquí: uno
    // propio del tipo "esta cuenta está desactivada" convertiría la pantalla en un
    // oráculo del estado de las cuentas.
    if (account === null || !account.active) {
      throw new ConvexError(INVALID_CODE);
    }

    const resultado = await ctx.runMutation(
      internal.passwordReset.consumeCode,
      { accountId: account._id, codeHash: await hashCode(args.code) },
    );
    if (!resultado.ok) throw new ConvexError(INVALID_CODE);

    // Cambia el secreto de la cuenta EXISTENTE. `modifyAccountCredentials` lanza
    // si la cuenta no existe, así que esto no puede crear cuentas: el registro
    // sigue cerrado.
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.providerAccountId, secret: args.newPassword },
    });

    // Sin `except`: caen TODAS las sesiones, también la de quien esté cambiando
    // la contraseña. Vuelve a entrar con el `signIn` del cliente.
    await invalidateSessions(ctx, { userId: resultado.userId });

    // Si un atacante había bloqueado el login a base de fallos, recuperar la
    // contraseña devuelve el acceso EN EL ACTO. Sin esto, la usuaria cambiaría la
    // contraseña y aun así no podría entrar hasta que se recargara el contador
    // (~1 intento cada 6 minutos), que es justo el escenario de bloqueo total.
    await ctx.runMutation(internal.passwordReset.clearSignInLockout, {
      accountId: account._id,
    });

    // Aviso a la titular (KAR-106). Va EL ÚLTIMO: solo se avisa de lo que ya ha
    // ocurrido de verdad.
    //
    // Se PROGRAMA, no se envía aquí. El aviso no puede hacer fracasar el cambio
    // de contraseña, y eso son dos cosas distintas: no propagar el error (lo da
    // este try/catch) y no gastar el tiempo de esta action (lo da el
    // programador). Si se enviara en línea y Resend se quedara pendiente, el
    // runtime abortaría la ejecución sin que el `catch` llegara a correr; la
    // pantalla de login traduce CUALQUIER error de `resetPassword` a "El código
    // no es válido o ha caducado." (ver onVerifyCode en app/(auth)/login/page.tsx),
    // así que la usuaria leería eso con la contraseña ya cambiada y todas sus
    // sesiones cerradas. Por ese motivo este `catch` no puede convertirse jamás
    // en un `throw`.
    //
    // Programar es una llamada interna y rápida, pero si aun así fallara,
    // tampoco puede llevarse por delante un cambio de contraseña ya hecho.
    try {
      await ctx.scheduler.runAfter(0, internal.passwordChangedEmail.send, {
        to: account.providerAccountId,
        changedAt: Date.now(),
        origen: "recuperacion",
      });
    } catch (e) {
      console.error(
        "[passwordReset] La contraseña SÍ se cambió, pero no se pudo programar " +
          "el aviso a la titular.",
        e instanceof Error ? e.message : String(e),
      );
    }

    return null;
  },
});

/* ─────────────────────── Funciones internas ─────────────────────── */

/**
 * Cuenta Password de un correo ya normalizado, o `null`.
 *
 * Devuelve también si la persona tiene acceso (`active`), porque quien llama lo
 * necesita para no trabajar sobre cuentas desactivadas (hallazgo A8). Se expone
 * el dato y NO se decide aquí: la puerta de emergencia
 * (`provisionUsers:resetUserPassword`) sí debe poder operar sobre una cuenta
 * desactivada — puede formar parte de reactivarla—, mientras que el flujo público
 * de recuperación no.
 */
export const accountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    if (account === null) return null;
    const user = await ctx.db.get(account.userId);
    // Se devuelve solo lo necesario: nunca el `secret` de la cuenta.
    return {
      _id: account._id,
      userId: account.userId,
      providerAccountId: account.providerAccountId,
      // Fail-closed, igual que `currentActiveUser`: solo `true` es acceso.
      active: user !== null && user.active === true,
      // SI EXISTE el secreto, no cuál es. Lo necesita `iniciarAcceso` para
      // decidir si a esa persona hay que pedirle contraseña o mandarle el código
      // de invitación. Mismo criterio que `users.listar` en KAR-54.
      sinContrasena: account.secret === undefined,
      // Para el saludo del correo de invitación. No es un dato sensible y evita
      // una segunda consulta desde la action.
      nombre: user?.name ?? "",
    };
  },
});

/**
 * Decide si toca emitir código y, si toca, lo guarda. TODO en una sola
 * transacción: la comprobación y la escritura no pueden separarse, o dos
 * peticiones simultáneas emitirían dos códigos y se pisarían.
 *
 * Sustituye a las antiguas `consumeRequestQuota` + `storeCode`, que estaban en
 * mutations distintas y por tanto en transacciones distintas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOBRE `forzarPorDuena` (KAR-54). Es la ÚNICA excepción a "un código vivo es
 * sagrado", y está acotada para que no valga como arma:
 *
 *   - Es un argumento OBLIGATORIO, no opcional con valor por defecto. Así cada
 *     punto de llamada tiene que declarar explícitamente qué es, y añadir uno
 *     nuevo obliga a pensarlo. `requestCode` —el camino anónimo— pasa `false`.
 *   - Quien puede ponerlo en `true` es `users.reenviarInvitacion`, que exige
 *     `requireOwner` y ADEMÁS comprueba que esa cuenta todavía no tiene
 *     contraseña. O sea que este camino nunca puede destruir el código de
 *     recuperación de alguien que sí tiene contraseña, que es exactamente el
 *     caso que la ronda de auditoría protegía. Quien ya tiene contraseña no
 *     necesita invitación: tiene "¿Olvidaste tu contraseña?".
 *   - Existe porque el código de invitación dura 24 h (ver INVITE_TTL_MS en
 *     convex/authShared.ts). Sin él, un correo que se quede en la cuarentena de
 *     un antivirus dejaría a esa persona un día entero sin poder entrar y sin
 *     que nadie pudiera hacer nada.
 *
 * Y `motivo` en el rechazo: se devuelve para que la DUEÑA pueda leer la verdad
 * ("ya hay una invitación vigente, caduca a las HH:MM") en vez de un silencio.
 * OJO: `requestCode` NO lo propaga a nadie; ver su cabecera.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const prepararEnvio = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
    email: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    attemptsLeft: v.number(),
    forzarPorDuena: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ahora = Date.now();

    // 0) GUARDA ATÓMICA DEL FORZADO. `users.reenviarInvitacion` ya comprueba lo
    //    mismo para dar un mensaje decente, pero lo hace en OTRA transacción.
    //    Repetirlo aquí es lo que convierte la restricción en una garantía: sea
    //    quien sea quien llame, y pase lo que pase entre medias, solo se puede
    //    forzar sobre una cuenta que todavía NO tiene contraseña. Así este
    //    camino no puede destruir el código de recuperación de alguien que sí la
    //    tiene, que es el caso que la ronda de auditoría protegía.
    if (args.forzarPorDuena) {
      const cuenta = await ctx.db.get(args.accountId);
      // Fail-closed: si la cuenta no existe o ya tiene secreto, no se fuerza.
      if (cuenta === null || cuenta.secret !== undefined) {
        return { enviar: false as const, motivo: "no_forzable" as const };
      }
    }

    // 1) ¿Hay ya un código para esta cuenta?
    //
    // Se leen TODAS las filas, no una: el índice `by_account` no impone unicidad
    // física, así que `.unique()` lanzaría si alguna vez hubiera dos y dejaría la
    // recuperación rota.
    const filas = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Un código sin intentos disponibles también cuenta como vivo: los intentos
    // se recargan (ver `consumeCode`), así que ese código le sigue sirviendo a
    // quien conoce el número.
    const vivo = filas.find((fila) => fila.expiresAt > ahora) ?? null;

    // 2) EL ARREGLO. Si alguno sigue vivo, no se toca nada y no se envía nada.
    //
    //    No se rota (la usuaria conserva el código que ya tiene en el buzón) y
    //    NO SE CONSUME CUOTA, que es la otra mitad: si el rechazo gastara cuota,
    //    un atacante seguiría pudiendo vaciarla a base de peticiones y volvería a
    //    dejar sin recuperación a la usuaria, exactamente el fallo que esto cierra.
    if (vivo !== null && !args.forzarPorDuena) {
      return {
        enviar: false as const,
        motivo: "codigo_vivo" as const,
        expiresAt: vivo.expiresAt,
      };
    }

    // 3) LA CUOTA VA ANTES DE BORRAR NADA, y el orden es la mitad de lo que hace
    //    que el forzado sea seguro. Al revés —borrar y luego pedir cuota— un
    //    reenvío forzado con la cuota agotada destruiría el código vivo y no
    //    podría mandar el sustituto: dejaría a la persona peor que antes, que es
    //    reintroducir a mano el fallo que arregló la ronda anterior.
    //
    //    Efecto lateral asumido: si la cuota deniega, las filas CADUCADAS se
    //    quedan sin limpiar hasta la siguiente emisión. Son basura inerte —
    //    `consumeCode` también borra lo caducado— y no cambia ninguna decisión.
    if (!(await consumirCuota(ctx, args.email, ahora))) {
      return { enviar: false as const, motivo: "cuota" as const };
    }

    // 4) Ahora sí: fuera lo que hubiera (caducado siempre; vivo solo si la dueña
    //    ha forzado y la cuota lo ha permitido).
    for (const fila of filas) await ctx.db.delete(fila._id);

    // 5) Guardar el código nuevo.
    await ctx.db.insert("passwordResetCodes", {
      accountId: args.accountId,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      attemptsLeft: args.attemptsLeft,
      lastAttemptTime: ahora,
    });
    return { enviar: true as const };
  },
});

/**
 * Consume una unidad de cuota. Ventana FIJA. Devuelve `false` si está agotada.
 *
 * OJO con el tercer caso: cuando la cuota está agotada se rechaza SIN tocar
 * `windowStart` ni `count`. Si el rechazo desplazara la ventana, un atacante
 * golpeando sin parar la mantendría viva indefinidamente y la usuaria legítima no
 * podría emitir nunca.
 */
async function consumirCuota(
  ctx: MutationCtx,
  email: string,
  ahora: number,
): Promise<boolean> {
  const fila = await ctx.db
    .query("passwordResetRequests")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (fila === null) {
    await ctx.db.insert("passwordResetRequests", {
      email,
      windowStart: ahora,
      count: 1,
    });
    return true;
  }
  if (ahora - fila.windowStart > QUOTA_WINDOW_MS) {
    await ctx.db.patch(fila._id, { windowStart: ahora, count: 1 });
    return true;
  }
  if (fila.count >= QUOTA_MAX) return false; // sin escribir nada
  await ctx.db.patch(fila._id, { count: fila.count + 1 });
  return true;
}

/**
 * Verifica y consume el código. Un fallo nunca dice cuál de los motivos fue.
 *
 * LOS INTENTOS SE RECARGAN, NO SE AGOTAN. Es el segundo arreglo del hallazgo A1.
 * Antes, cinco fallos borraban la fila, así que un desconocido que quemara los
 * cinco intentos de cada código recién emitido dejaba a la usuaria sin
 * recuperación de forma indefinida — la misma denegación que la cuota, por otra
 * puerta.
 *
 * La fórmula es la misma que usa la propia librería para el login
 * (implementation/rateLimit.js): el cupo se rellena de forma continua en
 * proporción al tiempo transcurrido. Quien tiene el código correcto solo
 * necesita UN hueco, así que el peor caso para la usuaria legítima es esperar un
 * par de minutos; el atacante, en cambio, nunca consigue matar el código.
 */
export const consumeCode = internalMutation({
  args: { accountId: v.id("authAccounts"), codeHash: v.string() },
  handler: async (ctx, args) => {
    const ahora = Date.now();
    const filas = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Estado inesperado (más de un código para la misma cuenta): se limpia todo
    // y se rechaza. Fail-closed.
    if (filas.length !== 1) {
      for (const fila of filas) await ctx.db.delete(fila._id);
      return { ok: false as const };
    }

    const fila = filas[0];
    if (fila.expiresAt < ahora) {
      await ctx.db.delete(fila._id);
      return { ok: false as const };
    }

    // Recarga continua. `lastAttemptTime` puede faltar en filas anteriores a este
    // cambio; `_creationTime` lo pone Convex siempre, así que sirve de respaldo y
    // no hace falta migración.
    const desde = fila.lastAttemptTime ?? fila._creationTime;
    const disponibles = Math.min(
      MAX_VERIFY_ATTEMPTS,
      fila.attemptsLeft +
        ((ahora - desde) * MAX_VERIFY_ATTEMPTS) / VERIFY_REFILL_WINDOW_MS,
    );

    // Sin huecos ahora mismo. Se rechaza SIN BORRAR: el código sigue siendo
    // válido y volverá a admitir intentos en cuanto se recargue. Borrarlo aquí
    // sería devolverle al atacante el arma que este cambio le quita.
    if (disponibles < 1) return { ok: false as const };

    if (!equalsConstantTime(fila.codeHash, args.codeHash)) {
      await ctx.db.patch(fila._id, {
        attemptsLeft: disponibles - 1,
        lastAttemptTime: ahora,
      });
      return { ok: false as const };
    }

    // Correcto: de un solo uso.
    await ctx.db.delete(fila._id);
    const account = await ctx.db.get(args.accountId);
    if (account === null) return { ok: false as const };
    return { ok: true as const, userId: account.userId };
  },
});

/**
 * Borra el código recién guardado cuando el envío falla. Solo si el hash
 * COINCIDE: si mientras tanto hubiera entrado otra petición y guardado uno nuevo,
 * borrarlo a ciegas destruiría un código que sí se ha entregado.
 */
export const descartarCodigo = internalMutation({
  args: { accountId: v.id("authAccounts"), codeHash: v.string() },
  handler: async (ctx, { accountId, codeHash }) => {
    const filas = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    for (const fila of filas) {
      if (fila.codeHash === codeHash) await ctx.db.delete(fila._id);
    }
  },
});

/**
 * Borra el bloqueo por intentos fallidos de inicio de sesión de UNA cuenta.
 * Convex Auth guarda ese contador en `authRateLimits` usando el `_id` de la
 * cuenta como `identifier`. Nunca un barrido de la tabla.
 */
export const clearSignInLockout = internalMutation({
  args: { accountId: v.id("authAccounts") },
  handler: async (ctx, { accountId }) => {
    const fila = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", accountId))
      .unique();
    if (fila !== null) await ctx.db.delete(fila._id);
  },
});
