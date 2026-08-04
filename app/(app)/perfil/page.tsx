import { redirect } from "next/navigation";

/**
 * El Perfil NO es una pantalla: es un panel persistente que abre el AppShell
 * desde el avatar (escritorio) y la pestaña "Perfil" (móvil) — así lo define el
 * diseño KAR-48 y así cumple KAR-56. Esta ruta existió como placeholder y no la
 * enlaza nadie; se conserva solo como redirección de cortesía para que un
 * marcador viejo a /perfil no aterrice en un stub, sino en la app. El middleware
 * sigue protegiéndola: sin sesión, /perfil → /login antes de llegar aquí.
 */
export default function PerfilPage() {
  redirect("/seguimientos");
}
