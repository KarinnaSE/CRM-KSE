/**
 * Correo de INVITACIÓN a una persona recién dada de alta (KAR-54).
 *
 * Calcado de convex/passwordResetEmail.ts y NO de convex/passwordChangedEmail.ts,
 * y la diferencia es de seguridad, no de estilo:
 *
 *   ESTE CORREO NO SE PUEDE PROGRAMAR CON `ctx.scheduler`. Lleva un código, y los
 *   argumentos de una función programada aparecen en los registros del
 *   deployment (la regla la fija la cabecera de convex/passwordChangedEmail.ts).
 *   Por eso es una función `async` normal que se llama en línea desde la action,
 *   igual que el correo del código de recuperación.
 *
 * FAIL-CLOSED como el de recuperación: si no se puede entregar, `sendEmail`
 * lanza. Quien llama decide qué hacer con eso — en el alta, la cuenta se queda
 * creada y la dueña reenvía la invitación (ver convex/users.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE CORREO SOBREVIVE A LOS ANTIVIRUS Y FILTROS DE CORREO
 *
 * Las pasarelas corporativas (Defender Safe Links, Proofpoint URL Defense,
 * Barracuda…) ABREN los enlaces de un correo para analizarlos, y de paso se
 * comen los enlaces de un solo uso: el sistema los da por usados y, cuando la
 * persona pincha, lee "este enlace ya no es válido". Aquí no puede pasar, y
 * conviene que conste por qué, porque es una propiedad del diseño que se rompe
 * sola en cuanto alguien "mejore" el correo:
 *
 *   1. La invitación NO lleva ningún enlace de un solo uso. Lleva un CÓDIGO que
 *      la persona teclea. Un escáner no teclea.
 *   2. El único enlace apunta a /login, que es un GET que no cambia ningún
 *      estado. Se puede abrir mil veces sin gastar nada.
 *   3. El código se consume únicamente llamando a `passwordReset.resetPassword`
 *      con correo + código + contraseña nueva. No hay forma de dispararlo
 *      siguiendo un enlace.
 *
 * DOS REGLAS QUE SE DERIVAN, y que hay que hacer cumplir en cualquier cambio
 * futuro de este archivo o de los otros correos:
 *
 *   · Ningún correo del CRM lleva un enlace que consuma estado al abrirlo. Ya era
 *     el criterio antiphishing de passwordChangedEmail.ts; ahora es además la
 *     defensa frente a escáneres, y las dos razones apuntan al mismo sitio.
 *   · El código NUNCA viaja dentro de una URL, tampoco como parámetro de /login.
 *     No porque el escáner fuera a consumirlo —no lo haría—, sino porque una URL
 *     acaba en el historial, en el `Referer`, en los registros del proxy
 *     corporativo y en los del propio escáner.
 *
 * Lo tercero que hacía falta —que el código no caduque MIENTRAS viaja, retenido
 * por una cuarentena o por el greylisting— no se resuelve aquí sino con
 * INVITE_TTL_MS (24 h) en convex/authShared.ts, donde está el razonamiento.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  emailShell,
  escapeHtml,
  loginUrl,
  sendEmail,
  type EmailContent,
} from "./email";
import { INVITE_TTL_MS } from "./authShared";

/**
 * Compone la invitación. PURA: sin red, sin entorno y sin reloj, para que su
 * salida se pueda comparar carácter a carácter en una prueba.
 *
 * `nombre` lo escribió la dueña en un formulario, así que va escapado en el
 * HTML. El código lo genera `generateNumericCode` y solo tiene dígitos.
 */
export function buildInvitationEmail({
  nombre,
  code,
  urlLogin,
}: {
  nombre: string;
  code: string;
  urlLogin: string | null;
}): EmailContent {
  const horas = Math.round(INVITE_TTL_MS / 3_600_000);
  // Se colapsan los espacios además de recortarlos: `users.crear` ya normaliza
  // el nombre, pero esta función es pura y la puede llamar cualquiera, y un dato
  // histórico con espacios repetidos quedaría feo en el saludo.
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const saludo = limpio === "" ? "Hola" : `Hola, ${limpio}`;

  // El enlace es PLANO y opcional: si `SITE_URL` no supera la validación de
  // convex/email.ts, el correo sale sin enlace y con las instrucciones igual de
  // claras. Un correo de acceso que manda al dominio equivocado es peor que uno
  // sin enlace.
  const enlaceHtml =
    urlLogin === null
      ? "la pantalla de inicio de sesión de KSE CRM"
      : `la <a href="${escapeHtml(urlLogin)}" style="color:#1c1c1c;">pantalla de inicio de sesión</a>`;

  return {
    // Sin el código en el asunto (KAR-97): se ve en la vista previa del correo,
    // en la pantalla de bloqueo y en las notificaciones de escritorio.
    subject: "Te han dado acceso a KSE CRM",
    text:
      `${saludo}:\n\n` +
      `Te han creado una cuenta en KSE CRM. Para entrar por primera vez tienes ` +
      `que elegir tu contraseña, y para eso necesitas este código:\n\n` +
      `${code}\n\n` +
      `Cómo usarlo:\n` +
      `1. Abre la pantalla de inicio de sesión de KSE CRM.` +
      (urlLogin === null ? "" : `\n   ${urlLogin}`) +
      `\n2. Pulsa "¿Olvidaste tu contraseña?".\n` +
      `3. Escribe tu correo y pega el código.\n` +
      `4. Elige tu contraseña. Solo la conocerás tú.\n\n` +
      `El código caduca en ${horas} horas. Si se te pasa, puedes pedir otro tú ` +
      `misma desde "¿Olvidaste tu contraseña?", sin tener que avisar a nadie.\n\n` +
      `Si no esperabas este correo, ignóralo: sin el código nadie puede entrar ` +
      `en la cuenta.`,
    html: emailShell({
      titulo: "Te han dado acceso a KSE CRM",
      cuerpoHtml: `      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
        ${escapeHtml(saludo)}: te han creado una cuenta en KSE CRM. Para entrar por primera vez tienes que elegir tu contraseña, y para eso necesitas este código.
      </p>
      <div style="margin:26px 0;padding:18px;background:#f5f5f5;border-radius:8px;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.24em;color:#1c1c1c;">
        ${code}
      </div>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
        Cómo usarlo:
      </p>
      <ol style="margin:8px 0 0;padding-left:20px;font-size:15px;line-height:1.7;color:#555555;">
        <li>Abre ${enlaceHtml}.</li>
        <li>Pulsa &laquo;&iquest;Olvidaste tu contrase&ntilde;a?&raquo;.</li>
        <li>Escribe tu correo y pega el c&oacute;digo.</li>
        <li>Elige tu contrase&ntilde;a. Solo la conocer&aacute;s t&uacute;.</li>
      </ol>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#777777;">
        El código caduca en <strong>${horas} horas</strong>. Si se te pasa, puedes pedir otro tú misma desde &laquo;&iquest;Olvidaste tu contrase&ntilde;a?&raquo;, sin tener que avisar a nadie.
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#999999;">
        Si no esperabas este correo, ignóralo: sin el código nadie puede entrar en la cuenta.
      </p>`,
    }),
  };
}

/**
 * Envía la invitación. `to` DEBE ser la dirección almacenada en la cuenta
 * (`authAccounts.providerAccountId`), nunca la cadena que escribió el cliente.
 */
export async function sendInvitationEmail(
  to: string,
  code: string,
  nombre: string,
): Promise<void> {
  // Misma ayuda de desarrollo que el código de recuperación, y por el mismo
  // motivo: el código se guarda con HMAC + pepper y no se puede sacar de la base
  // de datos para las pruebas E2E. Bandera propia `LOG_OTP_CODES`, nunca
  // encendida en producción (lo bloquea scripts/check-prod-env.mjs).
  if (process.env.LOG_OTP_CODES) {
    console.info(`[dev] código de invitación para ${to}: ${code}`);
  }

  await sendEmail(to, buildInvitationEmail({ nombre, code, urlLogin: loginUrl() }));
}
