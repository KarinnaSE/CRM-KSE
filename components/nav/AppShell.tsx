"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { ProfilePanel } from "@/components/nav/ProfilePanel";
import {
  destinoDeSalida,
  limpiarSalidaIntencionada,
  marcarSalidaIntencionada,
} from "@/lib/salidaIntencionada";

/**
 * Chrome de navegación persistente (KAR-24) + guardas de sesión (KAR-7).
 * Escritorio: top-bar con pestañas. Móvil: bottom-bar + FAB "Agregar cliente".
 * "Administración" (→ /usuarios) solo para la dueña. Reportes y la campana se
 * muestran inertes (sin pantalla en el MVP). Perfil abre un panel con "Cerrar
 * sesión" real (signOut).
 *
 * Guardas: no se renderiza chrome protegido hasta tener un usuario ACTIVO. Si
 * hay sesión pero la cuenta no tiene acceso (inactiva/huérfana), se cierra la
 * sesión y se redirige a /login (evita bucle con el middleware).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // El panel se cierra al navegar: si el usuario abre el perfil y cambia de
  // pestaña, no debe quedar flotando sobre la pantalla nueva. En el cierre de
  // sesión no importa (navegamos a /login, fuera de este layout, y el AppShell
  // se desmonta entero).
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  /**
   * Al montar el chrome con una usuaria activa se limpia la marca de salida
   * intencionada (KAR-55, M1). Es el punto correcto porque corre DESPUÉS de
   * volver a entrar y NUNCA en mitad del flujo: durante la salida el AppShell ya
   * está montado, no se monta otra vez. Sin esto, una marca puesta podría
   * sobrevivir a una sesión nueva en la misma pestaña y enmascarar un "sin
   * acceso" de verdad.
   */
  useEffect(() => {
    limpiarSalidaIntencionada();
  }, []);

  /**
   * LAS DOS RAMAS SON LA MISMA SALIDA VISTA POR DOS SEÑALES DISTINTAS, y por eso
   * las dos piden el destino a `destinoDeSalida()` en vez de escribirlo (KAR-112).
   *
   * Que una sesión termine se nota de dos formas —`isAuthenticated` pasa a falso,
   * y `users.me` pasa a `null`— y cuál llega antes no es predecible. Cuando cada
   * rama escribía su destino a mano, el mensaje dependía de quién ganara esa
   * carrera, y salía justo al revés de lo que debía: un cierre de sesión normal
   * enseñaba "Tu cuenta no tiene acceso" (falso) y una desactivación con la sesión
   * abierta no enseñaba nada.
   *
   * Compartir la autoridad es lo que lo arregla: gane la señal que gane, el
   * destino es el mismo. Ver la invariante en lib/salidaIntencionada.ts.
   */
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(destinoDeSalida());
    } else if (user === null) {
      // `user === null` con sesión viva es cuenta sin acceso O sesión que ya no
      // existe; desde aquí no se distinguen, y por diseño no hace falta.
      void signOut().then(() => router.replace(destinoDeSalida()));
    }
  }, [isLoading, isAuthenticated, user, router, signOut]);

  async function handleLogout() {
    // Guarda de re-entrada: dos clics en "Cerrar sesión" no lanzan dos salidas.
    // El botón ya se deshabilita con `loggingOut`, pero esto lo cierra también
    // por si el evento llega por otra vía (teclado repetido).
    if (loggingOut) return;
    setLoggingOut(true);
    // La marca va ANTES del `await`: a partir de aquí no hay ningún instante en
    // que el efecto de arriba pueda ver la sesión caída sin saber que esta
    // salida la pidió ella. Sin esto, cerrar sesión enseñaba un error falso.
    // `loggingOut` es solo UI: NO altera este orden (marcar→signOut→replace).
    marcarSalidaIntencionada();
    await signOut();
    router.replace(destinoDeSalida());
  }

  // No renderizar chrome protegido hasta tener usuario activo.
  if (isLoading || !isAuthenticated || user === undefined || user === null) {
    return <LoadingShell />;
  }

  const isOwner = user.role === "duena";
  const active = (href: string) => pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top-bar (escritorio) ── */}
      <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-border bg-surface px-4 md:flex">
        <Link href="/seguimientos" className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-interactive">KSE</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            CRM
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <TopTab href="/seguimientos" active={active("/seguimientos")}>
            Seguimientos
          </TopTab>
          <TopTab href="/clientes" active={active("/clientes")}>
            Clientes
          </TopTab>
          <TopTabDisabled>Reportes</TopTabDisabled>
          {isOwner && (
            <TopTab href="/usuarios" active={active("/usuarios")}>
              Administración
            </TopTab>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/clientes/nuevo"
            className="inline-flex h-8 items-center justify-center gap-2 rounded-full bg-interactive px-3 text-sm font-semibold text-text-on-brand transition-colors hover:bg-interactive-hover active:bg-interactive-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <PlusIcon /> Agregar cliente
          </Link>
          <BellInert />
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Abrir menú de perfil"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
          >
            <Avatar name={user.name ?? "?"} size="sm" />
          </button>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* ── Bottom-bar (móvil) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-surface md:hidden">
        <BottomTab href="/seguimientos" active={active("/seguimientos")} label="Inicio">
          <HomeIcon />
        </BottomTab>
        <BottomTab href="/clientes" active={active("/clientes")} label="Clientes">
          <UsersIcon />
        </BottomTab>
        <Link
          href="/clientes/nuevo"
          aria-label="Agregar cliente"
          className="flex h-12 w-12 -translate-y-2 items-center justify-center rounded-full bg-interactive text-text-on-brand shadow-lg"
        >
          <PlusIcon />
        </Link>
        <BottomTabDisabled label="Reportes">
          <BarChartIcon />
        </BottomTabDisabled>
        {isOwner && (
          <BottomTab href="/usuarios" active={active("/usuarios")} label="Admin">
            <LockIcon />
          </BottomTab>
        )}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Abrir menú de perfil"
          aria-haspopup="dialog"
          aria-expanded={profileOpen}
          className="flex flex-col items-center gap-0.5 text-text-tertiary"
        >
          <UserIcon />
          <span className="text-[10px]">Perfil</span>
        </button>
      </nav>

      {profileOpen && (
        <ProfilePanel
          onClose={() => setProfileOpen(false)}
          user={user}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      )}
    </div>
  );
}

/* ───────────── Shell de carga (sin chrome protegido) ───────────── */

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div
        role="status"
        aria-label="Cargando"
        className="h-8 w-8 animate-spin rounded-full border-2 border-brand-100 border-t-interactive"
      />
    </div>
  );
}

/* ───────────── Top-bar helpers ───────────── */

function TopTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center rounded-full px-3 text-sm transition-colors",
        active
          ? "bg-brand-50 font-semibold text-brand-700"
          : "font-medium text-text-secondary hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

function TopTabDisabled({ children }: { children: ReactNode }) {
  return (
    <span
      aria-disabled
      title="Disponible próximamente"
      className="flex h-8 cursor-not-allowed items-center rounded-full px-3 text-sm font-medium text-text-tertiary opacity-60"
    >
      {children}
    </span>
  );
}

/* ───────────── Bottom-bar helpers ───────────── */

function BottomTab({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-0.5",
        active ? "text-interactive" : "text-text-tertiary",
      )}
    >
      {children}
      <span className="text-[10px]">{label}</span>
    </Link>
  );
}

function BottomTabDisabled({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-disabled
      title="Disponible próximamente"
      className="flex cursor-not-allowed flex-col items-center gap-0.5 text-text-tertiary opacity-60"
    >
      {children}
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

function BellInert() {
  return (
    <span
      aria-disabled
      title="Sin notificaciones (próximamente)"
      className="flex h-10 w-10 cursor-not-allowed items-center justify-center text-text-tertiary opacity-60"
    >
      <BellIcon />
    </span>
  );
}

/* ───────────── Iconos (Lucide inline) ───────────── */

const S = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PlusIcon = () => (
  <svg {...S} width={16} height={16}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const HomeIcon = () => (
  <svg {...S}>
    <path d="M3 9.5 12 3l9 6.5" />
    <path d="M5 10v10h14V10" />
  </svg>
);
const UsersIcon = () => (
  <svg {...S}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
);
const BarChartIcon = () => (
  <svg {...S}>
    <path d="M3 3v18h18" />
    <path d="M7 16v-5M12 16V8M17 16v-3" />
  </svg>
);
const LockIcon = () => (
  <svg {...S}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const UserIcon = () => (
  <svg {...S}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const BellIcon = () => (
  <svg {...S}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
