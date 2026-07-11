"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * Usuario actual real (KAR-7). Sustituye al stub anterior (que simulaba un
 * usuario y tenía un selector dev). Lee `api.users.me`, que devuelve:
 *   - `undefined` mientras carga,
 *   - `null` si no hay sesión O el usuario no está activo (fail-closed),
 *   - el doc del usuario activo.
 *
 * El AppShell distingue "sin sesión" de "sesión inactiva" con `useConvexAuth`
 * y cierra sesión en el segundo caso.
 */
export function useCurrentUser(): {
  user: Doc<"users"> | null | undefined;
} {
  const user = useQuery(api.users.me);
  return { user };
}
