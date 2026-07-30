#!/usr/bin/env node
/**
 * Gate de seguridad previo al despliegue (KAR-102, hallazgo M1).
 *
 * Falla si el deployment de PRODUCCIÓN tiene alguna variable peligrosa. La
 * documentación ya avisa de todas ellas, pero un aviso en un README no impide
 * un despiste: esto sí.
 *
 * Uso:  npm run check:prod-env
 *
 * FAIL-CLOSED: si no se puede consultar el entorno, también falla. Un gate que
 * se rinde en silencio cuando no puede comprobar no es un gate.
 */
import { execFileSync } from "node:child_process";

/** Variables que NUNCA deben existir en producción, y por qué. */
const PROHIBIDAS = {
  ALLOW_DEMO_SEED:
    "habilita seed:clearAll, que borra users, authAccounts y authSessions",
  LOG_OTP_CODES:
    "vuelca los códigos de recuperación en claro en los logs del deployment",
};

/** Variables que solo son peligrosas con ciertos valores. */
const VALORES_PROHIBIDOS = {
  AUTH_LOG_LEVEL: {
    malos: ["DEBUG"],
    porque:
      "Convex Auth registra los argumentos de sus funciones internas, " +
      "incluidos códigos de verificación en claro y perfiles de OAuth",
  },
  AUTH_LOG_SECRETS: {
    malos: ["true"],
    porque: "desactiva el redactado de secretos en los logs de Convex Auth",
  },
};

let salida;
try {
  salida = execFileSync("npx", ["convex", "env", "list", "--prod"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  console.error(
    "✖ No se pudo leer el entorno de producción, así que no se puede " +
      "garantizar que sea seguro desplegar.\n" +
      `  ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
}

// `env list` imprime NOMBRE=valor por línea.
const entorno = new Map();
for (const linea of salida.split("\n")) {
  const i = linea.indexOf("=");
  if (i > 0) entorno.set(linea.slice(0, i).trim(), linea.slice(i + 1).trim());
}

const problemas = [];
for (const [nombre, porque] of Object.entries(PROHIBIDAS)) {
  if (entorno.has(nombre)) problemas.push(`${nombre} — ${porque}`);
}
for (const [nombre, { malos, porque }] of Object.entries(VALORES_PROHIBIDOS)) {
  const valor = entorno.get(nombre);
  if (valor !== undefined && malos.includes(valor)) {
    problemas.push(`${nombre}=${valor} — ${porque}`);
  }
}

if (problemas.length > 0) {
  console.error("✖ Variables peligrosas en el deployment de PRODUCCIÓN:\n");
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    "\nQuítalas antes de desplegar:\n" +
      problemas
        .map((p) => `  npx convex env remove ${p.split(/[ =]/)[0]} --prod`)
        .join("\n"),
  );
  process.exit(1);
}

console.log(
  `✓ Entorno de producción limpio (${entorno.size} variables, ninguna peligrosa).`,
);
