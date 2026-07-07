import Link from "next/link";

/**
 * Layout de las pantallas autenticadas del CRM.
 * Aquí vivirá la navegación persistente responsive (barra superior en
 * escritorio / barra inferior en móvil + FAB), según el diseño y KAR-24.
 * El acceso a "Administración" (Usuarios) es exclusivo del rol dueña.
 *
 * TODO: sustituir esta navegación temporal por los componentes reales.
 */
const NAV = [
  { href: "/seguimientos", label: "Seguimientos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/perfil", label: "Perfil" },
  { href: "/usuarios", label: "Administración (solo dueña)" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-4">
        <span className="text-xl font-bold text-interactive">KSE</span>
        <nav className="flex gap-3 overflow-x-auto text-sm text-text-secondary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
