/**
 * Generación y ENVÍO del código de recuperación de contraseña (KAR-100).
 *
 * Antes (KAR-96) este archivo era un proveedor `Email` de Convex Auth, enganchado
 * como opción `reset` del proveedor Password. Ya no: el flujo de recuperación es
 * propio (ver convex/passwordReset.ts) porque la librería rota el código antes de
 * ofrecer ningún punto donde aplicar una cuota. Aquí solo queda lo que siempre
 * fue nuestro: fabricar el código y mandar el correo.
 *
 * El transporte y la maqueta viven en convex/email.ts desde KAR-106. Este correo
 * es FAIL-CLOSED: si no se puede entregar, el flujo debe fallar, porque sin
 * correo la usuaria no tiene nada que hacer con la pantalla del código. Es el
 * criterio contrario al del aviso de cambio de contraseña, y la diferencia es
 * deliberada — ver convex/passwordChangedEmail.ts.
 */

import { emailShell, sendEmail, type EmailContent } from "./email";
import { CODE_LENGTH, CODE_TTL_MS } from "./authShared";

// La forma del código se define en convex/authShared.ts, que es puro y lo puede
// importar también la pantalla de login (este archivo no: arrastra `./email`, y
// con él el transporte de Resend, al bundle del cliente). Se reexporta para no
// cambiar los imports de convex/passwordReset.ts.
export { CODE_LENGTH, CODE_TTL_MS };

/**
 * Código numérico de `CODE_LENGTH` dígitos, criptográficamente seguro.
 *
 * Usa muestreo por rechazo para evitar el SESGO DE MÓDULO: `random % 1e8` sobre
 * el rango completo de un uint32 favorecería a los primeros valores, porque 2^32
 * no es múltiplo de 100.000.000. Se descartan los enteros por encima del mayor
 * múltiplo de `RANGE` que cabe en 32 bits, de modo que todos los códigos son
 * equiprobables.
 */
export function generateNumericCode(): string {
  const RANGE = 10 ** CODE_LENGTH; // 100_000_000 códigos posibles (8 dígitos)
  const LIMIT = Math.floor(0x100000000 / RANGE) * RANGE; // 4_200_000_000
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= LIMIT);
  // `padStart` conserva los ceros a la izquierda (p. ej. "00732145").
  return String(value % RANGE).padStart(CODE_LENGTH, "0");
}

/**
 * Compone el correo del código. PURA: sin red, sin entorno y sin reloj, para que
 * su salida se pueda comparar carácter a carácter en una prueba (KAR-106) sin
 * necesidad de simular `fetch`.
 */
export function buildResetCodeEmail(code: string): EmailContent {
  const minutos = Math.round(CODE_TTL_MS / 60000);
  return {
    // El código va SOLO en el cuerpo (KAR-97): en el asunto se vería en la
    // vista previa del correo, en la pantalla de bloqueo y en las
    // notificaciones de escritorio, donde puede leerlo quien no debe.
    subject: "Recupera tu contraseña de KSE CRM",
    text:
      `Tu código para restablecer la contraseña de KSE CRM es: ${code}\n\n` +
      `Caduca en ${minutos} minutos y solo puede usarse una vez.\n\n` +
      `Si no pediste este cambio, ignora este mensaje: tu contraseña ` +
      `actual sigue siendo válida.`,
    html: emailShell({
      titulo: "Recupera tu contraseña",
      cuerpoHtml: `      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
        Introduce este código en la pantalla de inicio de sesión para elegir una contraseña nueva.
      </p>
      <div style="margin:26px 0;padding:18px;background:#f5f5f5;border-radius:8px;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.24em;color:#1c1c1c;">
        ${code}
      </div>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#777777;">
        Caduca en <strong>${minutos} minutos</strong> y solo puede usarse una vez.
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#999999;">
        Si no pediste este cambio, ignora este mensaje: tu contraseña actual sigue siendo válida.
      </p>`,
    }),
  };
}

/**
 * Envía el código por correo. `to` DEBE ser la dirección almacenada en la cuenta
 * (`authAccounts.providerAccountId`), nunca la cadena que escribió el cliente:
 * antes el destinatario salía de los params crudos de la petición.
 */
export async function sendResetCodeEmail(
  to: string,
  code: string,
): Promise<void> {
  // Ayuda de DESARROLLO. Hace falta porque el código se guarda con HMAC + pepper
  // y ya no se puede recuperar de la base de datos para las pruebas E2E.
  //
  // Tiene bandera PROPIA (`LOG_OTP_CODES`), separada de `ALLOW_DEMO_SEED`
  // (KAR-102). Antes compartían una: quien quisiera sembrar datos de demo
  // activaba de paso el volcado de códigos en los logs, y son riesgos distintos
  // —uno destruye datos, el otro expone credenciales de un solo uso—. Con dos
  // banderas, un despiste solo enciende una de las dos cosas.
  if (process.env.LOG_OTP_CODES) {
    console.info(`[dev] código de recuperación para ${to}: ${code}`);
  }

  // Fail-closed: si Resend no acepta el envío, `sendEmail` lanza y el flujo
  // falla, en vez de dejar a la usuaria esperando un correo que nunca llegará.
  await sendEmail(to, buildResetCodeEmail(code));
}
