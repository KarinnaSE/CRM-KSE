import { CurrentUserProvider } from "@/components/auth/CurrentUserProvider";
import { AppShell } from "@/components/nav/AppShell";

/**
 * Layout de las pantallas autenticadas del CRM.
 * Provee el "usuario actual" (stub hasta KAR-7) y monta la navegación
 * persistente responsive (KAR-24): barra superior en escritorio, barra
 * inferior + FAB en móvil. Administración es exclusiva del rol dueña.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrentUserProvider>
      <AppShell>{children}</AppShell>
    </CurrentUserProvider>
  );
}
