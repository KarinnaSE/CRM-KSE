# KSE CRM

CRM a medida para un negocio de ventas digitales (formaciones, consultoría, plantillas). Ayuda a que no se pierdan ventas por falta de seguimiento: clientes, seguimientos y ventas en un solo lugar.

- **Producto (PRD):** Notion — `CRM-PRD` y la bitácora `CRM-Cambios y Mejoras`.
- **Plan de trabajo:** Linear — proyecto `CRM-MVP` (equipo KarinnaSE, prefijo `KAR`). Es la fuente de verdad para el desarrollo.
- **Diseño de referencia:** handoff de 7 pantallas (`.dc.html`); se mantiene fuera del repo (sus tokens ya están portados a `app/globals.css`).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 3** con los tokens del design system portados a `app/globals.css`
- **Convex** como base de datos y backend (ver [`convex/`](./convex))
- Despliegue en **Railway**; código en **GitHub**

## Requisitos

- Node.js 20+ (ver `.nvmrc`)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Conectar Convex (una sola vez): crea el proyecto, genera convex/_generated
#    y escribe NEXT_PUBLIC_CONVEX_URL en tu .env.local. Déjalo corriendo.
npx convex dev

# 3. En otra terminal, arrancar Next.js
npm run dev
```

Abre http://localhost:3000 — redirige a `/login`.

> Si aún no has corrido `npx convex dev`, la app arranca igual; simplemente las
> queries/mutations de Convex no estarán disponibles hasta configurarlo.

## Estructura

```
app/
  layout.tsx            Layout raíz (fuente DM Sans + Providers)
  providers.tsx         Proveedor de Convex (cliente)
  globals.css           Tokens del design system + Tailwind
  page.tsx              Redirige a /login
  (auth)/login/         Pantalla de Login
  (app)/                Pantallas autenticadas (con navegación persistente)
    layout.tsx          Navegación (Admin visible solo para la dueña)
    seguimientos/       Pantalla de entrada: atrasados + hoy (implementada)
    clientes/           Lista, /nuevo (alta) y /[id] (ficha)
    usuarios/           Gestión de usuarios y roles (solo dueña)
    perfil/             Perfil / cerrar sesión
components/             Componentes reutilizables (ui, nav, seguimientos, auth)
lib/                    Utilidades (cn, etapas del pipeline)
convex/                 Backend: schema y funciones (seguimientos, seed, dates)
```

## Variables de entorno

Copia `.env.example` a `.env.local`. `npx convex dev` rellena `CONVEX_DEPLOYMENT` y `NEXT_PUBLIC_CONVEX_URL` automáticamente. Nunca subas `.env.local` a GitHub.

### Variables del deployment de Convex (no van en `.env.local`)

Se fijan con `npx convex env set` (añade `--prod` para producción) y hay que tenerlas **en dev y en prod**:

| Variable | Secreto | Para qué |
|---|---|---|
| `AUTH_GOOGLE_ID` | no | Login con Google |
| `AUTH_GOOGLE_SECRET` | **sí** | Login con Google |
| `RESEND_API_KEY` | **sí** | Envío del código de recuperación |
| `PASSWORD_RESET_PEPPER` | **sí** | Clave del HMAC con el que se guardan los códigos |
| `SITE_URL` | no | Destino válido de los redirects de OAuth |
| `ALLOW_DEMO_SEED` | no | **Solo dev.** Habilita `seed:seedDemo` y `seed:clearAll` (borran datos) |
| `LOG_OTP_CODES` | no | **Solo dev.** Escribe el código de recuperación en el log del deployment |

**Las marcadas como secreto no se escriben en la línea de comandos.** Omite el valor y el CLI lo pide por stdin, así no queda en el historial del shell ni visible en la lista de procesos:

```bash
npx convex env set RESEND_API_KEY --prod          # ✅ pide el valor
npx convex env set RESEND_API_KEY 're_xxx' --prod # ❌ queda en el historial
```

El panel de Convex (Settings → Environment Variables) es igual de válido y no toca el shell.

`PASSWORD_RESET_PEPPER` se genera con `openssl rand -hex 32` y debe ser **distinta en dev y en prod**. Para no pasarla por el shell: `openssl rand -hex 32 | npx convex env set PASSWORD_RESET_PEPPER --prod`. Sin ella la recuperación de contraseña falla (a propósito: es fail-closed). Rotarla solo invalida los códigos en vuelo, que caducan en 15 minutos de todas formas.

## Operación y seguridad

### Comprobación antes de desplegar

```bash
npm run check:prod-env
```

Falla si el deployment de producción tiene alguna variable peligrosa: `ALLOW_DEMO_SEED`, `LOG_OTP_CODES`, `AUTH_LOG_LEVEL=DEBUG` o `AUTH_LOG_SECRETS=true`. Es fail-closed — si no puede leer el entorno, también falla. Un aviso en un README no impide un despiste; esto sí.

Qué hace peligrosa a cada una:

- **`ALLOW_DEMO_SEED`** habilita `seed:clearAll`, que borra `users`, `authAccounts` y `authSessions`.
- **`LOG_OTP_CODES`** escribe los códigos de recuperación en claro en los logs. Van separadas a propósito: activar el seed de demo no debe encender de paso el volcado de códigos, porque son riesgos distintos.
- **`AUTH_LOG_LEVEL=DEBUG`** hace que Convex Auth registre los argumentos de sus funciones internas, con códigos de verificación en claro y perfiles completos de OAuth. Por defecto es `INFO`.
- **`AUTH_LOG_SECRETS=true`** desactiva el redactado de secretos en esos mismos logs.

### Riesgos aceptados a conciencia

**El JWT de acceso se guarda en `localStorage`.** Un XSS podría leerlo y usarlo contra Convex. Se acepta porque el arreglo evidente (`storage="inMemory"`) rompe el login en esta app —comprobado— y porque el daño está acotado: el token dura 30 minutos y **no puede renovarse**, ya que el refresh token real vive solo en la cookie httpOnly. Además, revocar la sesión corta el acceso robado en el acto, porque la autorización valida contra `authSessions`. Lo que reduciría de verdad este riesgo es una CSP con `script-src`, pendiente.

**Tres advisories altos de dependencias transitivas de Next 15.** No son explotables aquí: los de PostCSS son de compilación y todo el CSS es nuestro; los de sharp solo se alcanzan por `/_next/image`, que responde 400 a cualquier petición; y no usamos `next/image`, Server Actions ni rewrites. Cerrarlos exige subir a Next 16, un salto de versión mayor que merece su propia tarea.

### Break-glass: recuperar el acceso de una cuenta bloqueada

Para el caso extremo en que alguien deje una cuenta bloqueada a base de intentos fallidos y la recuperación por correo tampoco esté disponible:

```bash
# 1. Fijar la contraseña SIN escribirla en el comando. Al omitir el valor, el
#    CLI lo pide por stdin: no queda en el historial del shell ni en la lista
#    de procesos. NO uses `env set NOMBRE 'contraseña'`.
npx convex env set BREAK_GLASS_PASSWORD_MARTA --prod

# 2. Aplicar el cambio.
npx convex run provisionUsers:resetUserPassword --prod \
  '{"email":"karinnase@gmail.com","envSuffix":"MARTA"}'

# 3. Borrar la variable. NO SALTARSE ESTE PASO.
npx convex env remove BREAK_GLASS_PASSWORD_MARTA --prod
```

Cambia la contraseña, cierra las sesiones abiertas de esa persona y limpia su contador de intentos fallidos.

Dos cosas que hay que respetar:

- **La contraseña nunca va en la línea de comandos.** Ni como argumento de `env set` ni de `convex run`: acabaría en el historial del shell y sería visible en la lista de procesos mientras dura el comando. Por eso el paso 1 omite el valor. Si prefieres no usar la terminal, el panel de Convex (Settings → Environment Variables) también sirve y no toca el shell.
- **La variable es de un solo uso.** Si no se borra en el paso 3, queda una credencial válida guardada en la configuración del deployment. El sufijo va por cuenta (`_MARTA`, `_CARLOS`) precisamente para que sea evidente cuál hay que borrar.

Después de usarlo, pídele a la persona que cambie la contraseña desde la pantalla de recuperación.

## Subir a GitHub

```bash
git add -A
git commit -m "Estructura inicial del proyecto"
git remote add origin https://github.com/KarinnaSE/CRM-KSE.git
git push -u origin main
```

## Desplegar en Railway

1. En Railway, crea un proyecto **Deploy from GitHub repo** apuntando a este repositorio (Nixpacks detecta Next.js automáticamente).
2. En **Variables**, añade `CONVEX_DEPLOY_KEY` (Convex → Settings → Deploy Keys, de producción).
3. El build ya está configurado en `railway.json`: `npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'` despliega las funciones de Convex e inyecta `NEXT_PUBLIC_CONVEX_URL` de producción antes de compilar Next.js.
4. Railway asigna el puerto con `PORT`; `npm run start` (`next start`) lo respeta.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Next.js en desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build (usa `PORT`) |
| `npm run lint` | ESLint |
| `npm run convex:dev` | Convex en desarrollo (genera tipos, sincroniza) |
| `npm run convex:deploy` | Desplegar funciones de Convex |
