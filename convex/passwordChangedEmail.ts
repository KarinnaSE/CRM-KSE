/**
 * Aviso por correo de que la contraseña de una cuenta ha cambiado (KAR-106).
 *
 * POR QUÉ EXISTE. Hasta ahora un cambio de contraseña era silencioso para la
 * titular: las sesiones abiertas caían, pero eso se percibe como "se me ha
 * caducado la sesión", no como "me han cambiado la contraseña". El aviso no
 * impide nada; es una red de detección. Quien roba una cuenta hoy necesita el
 * buzón de correo, y es en ese mismo buzón donde aterriza el aviso, así que no
 * puede borrar la huella sin dejar otra.
 *
 * POR QUÉ ES UNA ACTION PROGRAMADA Y NO UNA LLAMADA NORMAL. Este correo NUNCA
 * puede hacer fracasar el cambio de contraseña, y eso son dos cosas distintas:
 * no propagar el error (lo resuelve un try/catch) y no consumir el tiempo de
 * quien llama (no lo resuelve). Si la llamada a Resend se queda pendiente y el
 * runtime aborta la ejecución por agotar su presupuesto, no hay `catch` que se
 * ejecute: la action muere entera. En el flujo de recuperación eso significaba
 * que la pantalla de login mostrara "El código no es válido o ha caducado" con
 * la contraseña ya cambiada y las sesiones ya cerradas — justo el desastre que
 * el aviso pretende evitar. Por eso quien cambia la contraseña solo PROGRAMA
 * esto con `ctx.scheduler.runAfter(0, …)` y sigue su camino.
 *
 * Los argumentos no llevan ningún secreto —dirección, marca de tiempo y origen—
 * porque los argumentos de una función sí aparecen en los registros del
 * deployment.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import {
  emailShell,
  escapeHtml,
  loginUrl,
  sendEmail,
  type EmailContent,
} from "./email";
import { formatMxDateTime } from "./dates";

/** De dónde vino el cambio, para decírselo a la titular sin ambigüedad. */
export type OrigenCambio = "recuperacion" | "soporte";

const FRASE_ORIGEN: Record<OrigenCambio, string> = {
  recuperacion: "Se hizo desde la pantalla de recuperación de contraseña.",
  soporte: "Lo hizo el equipo que administra el CRM.",
};

/**
 * Compone el aviso. PURA: recibe la fecha ya formateada y la URL ya validada, no
 * lee el reloj ni el entorno, para que su salida se pueda comprobar en una
 * prueba sin simular nada.
 *
 * Lo que este correo NO lleva, a propósito: la contraseña, el código, ningún
 * enlace de un solo uso y ningún dato de terceros. Como mucho, un enlace PLANO a
 * la pantalla de inicio de sesión. Un correo de seguridad que enseña a pinchar
 * enlaces es un correo que entrena para el phishing.
 */
export function buildPasswordChangedEmail({
  cuando,
  origen,
  urlLogin,
}: {
  cuando: string;
  origen: OrigenCambio;
  urlLogin: string | null;
}): EmailContent {
  const enlaceHtml =
    urlLogin === null
      ? "la pantalla de inicio de sesión"
      : `la <a href="${escapeHtml(urlLogin)}" style="color:#1c1c1c;">pantalla de inicio de sesión</a>`;

  return {
    // Sin datos sensibles en el asunto: se ve en la vista previa, en la pantalla
    // de bloqueo y en las notificaciones de escritorio (misma consideración que
    // llevó a KAR-97 a sacar el código del asunto).
    subject: "Tu contraseña de KSE CRM ha cambiado",
    text:
      `La contraseña de tu cuenta de KSE CRM se cambió el ${cuando}.\n\n` +
      `${FRASE_ORIGEN[origen]} Se han cerrado todas las sesiones abiertas de ` +
      `tu cuenta.\n\n` +
      `Si no has sido tú, recupera tu contraseña ahora mismo desde la pantalla ` +
      `de inicio de sesión y avisa a la dueña del CRM.` +
      (urlLogin === null ? "" : `\n${urlLogin}`),
    html: emailShell({
      titulo: "Tu contraseña ha cambiado",
      cuerpoHtml: `      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
        La contraseña de tu cuenta de KSE CRM se cambió el <strong>${cuando}</strong>.
      </p>
      <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#555555;">
        ${FRASE_ORIGEN[origen]} Se han cerrado todas las sesiones abiertas de tu cuenta.
      </p>
      <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#777777;">
        Si no has sido tú, recupera tu contraseña ahora mismo desde ${enlaceHtml} y avisa a la dueña del CRM.
      </p>`,
    }),
  };
}

/**
 * Manda el aviso. Se invoca SIEMPRE con `ctx.scheduler.runAfter(0, …)` desde
 * quien acaba de cambiar la contraseña, nunca en línea.
 *
 * Si el envío falla, registra y RELANZA. Relanzar aquí es seguro justamente
 * porque está fuera del camino crítico —no hay nadie esperando—, y hace que el
 * trabajo conste como fallido en el panel de Convex, que es la señal que se
 * quiere si esto empieza a fallar en serie. El `console.error` está para que en
 * los registros se lea en una línea qué pasó de verdad: la contraseña SÍ cambió.
 */
export const send = internalAction({
  args: {
    to: v.string(),
    changedAt: v.number(),
    origen: v.union(v.literal("recuperacion"), v.literal("soporte")),
  },
  handler: async (_ctx, args) => {
    const contenido = buildPasswordChangedEmail({
      cuando: formatMxDateTime(args.changedAt),
      origen: args.origen,
      urlLogin: loginUrl(),
    });
    try {
      await sendEmail(args.to, contenido);
    } catch (e) {
      console.error(
        "[passwordChangedEmail] La contraseña SÍ se cambió, pero no se pudo " +
          "enviar el aviso a la titular. El cambio NO se revierte.",
        e instanceof Error ? e.message : String(e),
      );
      throw e;
    }
    return null;
  },
});
