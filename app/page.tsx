import { redirect } from "next/navigation";

// La app arranca en Login (puerta de entrada obligatoria del MVP).
// Tras iniciar sesión, el flujo lleva a /seguimientos.
export default function Home() {
  redirect("/login");
}
