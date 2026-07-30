/**
 * Generación y ENVÍO del código de recuperación de contraseña (KAR-100).
 *
 * Antes (KAR-96) este archivo era un proveedor `Email` de Convex Auth, enganchado
 * como opción `reset` del proveedor Password. Ya no: el flujo de recuperación es
 * propio (ver convex/passwordReset.ts) porque la librería rota el código antes de
 * ofrecer ningún punto donde aplicar una cuota. Aquí solo queda lo que siempre
 * fue nuestro: fabricar el código y mandar el correo.
 *
 * El envío se hace por la API REST de Resend con `fetch` (sin SDK, sin
 * dependencias nuevas). Requiere `RESEND_API_KEY` en el deployment (prod ya la
 * tiene; en dev hay que fijarla con `npx convex env set RESEND_API_KEY <key>`).
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const FROM = "KSE CRM <no-reply@crm-kse.com>"; // dominio verificado en Resend

/**
 * Código numérico de `CODE_LENGTH` dígitos, criptográficamente seguro.
 *
 * Usa muestreo por rechazo para evitar el SESGO DE MÓDULO: `random % 1e6` sobre
 * el rango completo de un uint32 favorecería a los primeros valores, porque 2^32
 * no es múltiplo de 1.000.000. Se descartan los enteros por encima del mayor
 * múltiplo de `RANGE` que cabe en 32 bits, de modo que todos los códigos son
 * equiprobables.
 */
export function generateNumericCode(): string {
  const RANGE = 10 ** CODE_LENGTH; // 1_000_000 códigos posibles
  const LIMIT = Math.floor(0x100000000 / RANGE) * RANGE; // 4_294_000_000
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= LIMIT);
  // `padStart` conserva los ceros a la izquierda (p. ej. "007321").
  return String(value % RANGE).padStart(CODE_LENGTH, "0");
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Falta RESEND_API_KEY en el entorno del deployment.");
  }

  // Ayuda de DESARROLLO: `ALLOW_DEMO_SEED` es el marcador de "esto es dev" que ya
  // usa convex/seed.ts, y en producción no existe. Hace falta porque el código se
  // guarda con HMAC + pepper y ya no se puede recuperar de la base de datos como
  // se hacía antes para las pruebas E2E.
  if (process.env.ALLOW_DEMO_SEED) {
    console.info(`[dev] código de recuperación para ${to}: ${code}`);
  }

  const minutos = Math.round(CODE_TTL_MS / 60000);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      // El código va SOLO en el cuerpo (KAR-97): en el asunto se vería en la
      // vista previa del correo, en la pantalla de bloqueo y en las
      // notificaciones de escritorio, donde puede leerlo quien no debe.
      subject: "Recupera tu contraseña de KSE CRM",
      text:
        `Tu código para restablecer la contraseña de KSE CRM es: ${code}\n\n` +
        `Caduca en ${minutos} minutos y solo puede usarse una vez.\n\n` +
        `Si no pediste este cambio, ignora este mensaje: tu contraseña ` +
        `actual sigue siendo válida.`,
      html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#1c1c1c;">KSE</div>
      <div style="margin-top:2px;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#8a8a8a;">CRM</div>
      <h1 style="margin:24px 0 8px;font-size:19px;font-weight:700;color:#1c1c1c;">Recupera tu contraseña</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#555555;">
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
      </p>
      <p style="margin:28px 0 0;font-size:11px;color:#b0b0b0;">KSE CRM &copy; 2026</p>
    </div>
  </body>
</html>`,
    }),
  });

  // Fail-closed: si Resend no acepta el envío, el flujo debe fallar en vez de
  // dejar al usuario esperando un correo que nunca llegará.
  if (!response.ok) {
    const detalle = await response.text().catch(() => "");
    throw new Error(
      `Resend rechazó el envío del código (HTTP ${response.status}). ${detalle}`,
    );
  }
}
