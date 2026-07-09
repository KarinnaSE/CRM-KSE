"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

/**
 * STUB desechable de "usuario actual" mientras no existe login real
 * (KAR-7/46). Default: la dueña (Marta). Incluye un selector SOLO-DEV
 * (persistido en localStorage) para actuar como Carlos y probar la
 * navegación por rol. Se elimina al integrar auth: entonces el usuario
 * saldrá de `ctx.auth.getUserIdentity()` mapeado a `users`.
 */
type User = Doc<"users">;

type CurrentUserValue = {
  user: User | undefined; // undefined mientras cargan los usuarios
  users: User[];
  setUserId: (id: Id<"users">) => void;
};

const STORAGE_KEY = "kse-dev-current-user";

const Ctx = createContext<CurrentUserValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const users = useQuery(api.users.listActive);
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);

  // Restaura la selección dev de una sesión previa.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedId(stored as Id<"users">);
  }, []);

  const setUserId = (id: Id<"users">) => {
    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<CurrentUserValue>(() => {
    const list = users ?? [];
    const selected = selectedId
      ? list.find((u) => u._id === selectedId)
      : undefined;
    // Default: dueña; si no, el primero disponible.
    const fallback = list.find((u) => u.role === "duena") ?? list[0];
    return {
      user: users === undefined ? undefined : selected ?? fallback,
      users: list,
      setUserId,
    };
  }, [users, selectedId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUserValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCurrentUser debe usarse dentro de CurrentUserProvider.");
  }
  return ctx;
}
