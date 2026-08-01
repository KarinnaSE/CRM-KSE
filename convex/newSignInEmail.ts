/**
 * Aviso por correo de que se ha iniciado sesión en una cuenta (auditoría de
 * login, hallazgo A10).
 *
 * POR QUÉ EXISTE. Hasta ahora no había NINGUNA red de detección para el caso más
 * difícil: un acceso hecho con credenciales válidas. El aviso de cambio de
 * contraseña (KAR-106) cubre a quien toma la cuenta cambiando el secreto, pero
 * no a quien simplemente entra porque ha conseguido la contraseña o el buzón. No
 * impide nada; hace visible algo que antes no dejaba rastro para la titular.
 *
 * POR QUÉ SE MANDA COMO MUCHO UNO AL DÍA. La versión ingenua —avisar de cada
 * inicio de sesión— es peor que no avisar. Convex no expone IP ni dispositivo en
 * una mutation, así que no hay forma de distinguir un acceso "nuevo" de la rutina
 * diaria; sin esa distinción salen varios correos al día, y un correo de
 * seguridad que llega todos los días se convierte en ruido que se archiva sin
 * leer. La supresión de 24 h (tabla `signInNotices`) conserva casi toda la
 * capacidad de detección —el acceso de un intruso dispara aviso salvo que la
 * titular ya hubiera entrado ese mismo día— a cambio de un volumen que sí se lee.
 *
 * POR QUÉ ES UNA ACTION PROGRAMADA. Igual que en convex/passwordChangedEmail.ts:
 * este correo NUNCA puede impedir un inicio de sesión legítimo, y para eso no
 * basta un try/catch. Si la llamada a Resend se quedara pendiente y el runtime
 * abortara la ejecución por agotar su presupuesto, no habría `catch` que
 * corriera y se llevaría por delante el login entero. Por eso quien inicia sesión
 * solo PROGRAMA esto con `ctx.scheduler.runAfter(0, …)` y sigue su camino.
 *
 * Los argumentos no llevan ningún secreto —dirección y marca de tiempo— porque
 * los argumentos de una función sí aparecen en los registros del deployment.
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

/**
 * Compone el aviso. PURA: recibe la fecha ya formateada y la URL ya validada, no
 * lee el reloj ni el entorno, para que su salida se pueda comprobar en una
 * prueba sin simular nada.
 *
 * Lo que este correo NO lleva, a propósito: ningún enlace de un solo uso y
 * ningún dato de sesión. Como mucho, un enlace PLANO a la pantalla de inicio de
 * sesión. Un correo de seguridad que enseña a pinchar enlaces es un correo que
 * entrena para el phishing (mismo criterio que passwordChangedEmail).
 */
export function buildNewSignInEmail({
  cuando,
  urlLogin,
}: {
  cuando: string;
  urlLogin: string | null;
}): EmailContent {
  const enlaceHtml =
    urlLogin === null
      ? "la pantalla de inicio de sesión"
      : `la <a href="${escapeHtml(urlLogin)}" style="color:#1c1c1c;">pantalla de inicio de sesión</a>`;

  return {
    // Sin datos sensibles en el asunto: se ve en la vista previa, en la pantalla
    // de bloqueo y en las notificaciones de escritorio.
    subject: "Se ha iniciado sesión en tu cuenta de KSE CRM",
    text:
      `Se ha iniciado sesión en tu cuenta de KSE CRM el ${cuando}.\n\n` +
      `Si has sido tú, no tienes que hacer nada. Para no llenarte el buzón, ` +
      `solo te avisamos una vez al día.\n\n` +
      `Si NO has sido tú, cambia tu contraseña ahora mismo desde la pantalla ` +
      `de inicio de sesión y avisa a la dueña del CRM.` +
      (urlLogin === null ? "" : `\n${urlLogin}`),
    html: emailShell({
      titulo: "Se ha iniciado sesión en tu cuenta",
      cuerpoHtml: `      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
        Se ha iniciado sesión en tu cuenta de KSE CRM el <strong>${cuando}</strong>.
      </p>
      <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#555555;">
        Si has sido tú, no tienes que hacer nada. Para no llenarte el buzón, solo te avisamos una vez al día.
      </p>
      <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#777777;">
        Si <strong>no</strong> has sido tú, cambia tu contraseña ahora mismo desde ${enlaceHtml} y avisa a la dueña del CRM.
      </p>`,
    }),
  };
}

/**
 * Manda el aviso. Se invoca SIEMPRE con `ctx.scheduler.runAfter(0, …)` desde
 * `beforeSessionCreation` (convex/auth.ts), nunca en línea.
 *
 * Si el envío falla, registra y RELANZA. Relanzar aquí es seguro justamente
 * porque está fuera del camino crítico —no hay nadie esperando— y hace que el
 * trabajo conste como fallido en el panel de Convex, que es la señal que se
 * quiere si esto empieza a fallar en serie.
 */
export const send = internalAction({
  args: {
    to: v.string(),
    at: v.number(),
  },
  handler: async (_ctx, args) => {
    const contenido = buildNewSignInEmail({
      cuando: formatMxDateTime(args.at),
      urlLogin: loginUrl(),
    });
    try {
      await sendEmail(args.to, contenido);
    } catch (e) {
      console.error(
        "[newSignInEmail] No se pudo enviar el aviso de inicio de sesión. " +
          "La sesión SÍ se creó: este correo es una red de detección, no un " +
          "control de acceso.",
        e instanceof Error ? e.message : String(e),
      );
      throw e;
    }
    return null;
  },
});
