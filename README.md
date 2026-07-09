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
