# Convex — backend y base de datos de KSE CRM

Esta carpeta contiene el backend de la app (base de datos + funciones), gestionado por [Convex](https://docs.convex.dev).

## Archivos

- `schema.ts` — modelo de datos (users, clients, interactions, followups, sales). Alineado con el PRD de Notion y el proyecto CRM-MVP en Linear.
- `clients.ts`, `users.ts` — funciones de ejemplo (query/mutation) como plantilla.
- `_generated/` — código generado automáticamente por Convex. **No se edita ni se sube a Git** (está en `.gitignore`).

## Primer arranque (una sola vez)

```bash
npx convex dev
```

Esto abre el navegador para crear/enlazar tu proyecto Convex, genera `convex/_generated/`, y escribe `CONVEX_DEPLOYMENT` y `NEXT_PUBLIC_CONVEX_URL` en tu `.env.local`. Déjalo corriendo mientras desarrollas: sincroniza los cambios de este directorio en tiempo real.

## Uso desde la app

```ts
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const clientes = useQuery(api.clients.list);
```

El proveedor ya está montado en `app/providers.tsx`.
