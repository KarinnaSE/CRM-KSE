import { AppShell } from "@/components/nav/AppShell";

/**
 * Layout de las pantallas autenticadas del CRM.
 * El middleware (KAR-7) ya garantiza que solo se llegue aquí con sesión; el
 * `AppShell` obtiene el usuario real (api.users.me), cierra sesión si la cuenta
 * está inactiva y monta la navegación persistente (KAR-24). Administración es
 * exclusiva del rol dueña.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
