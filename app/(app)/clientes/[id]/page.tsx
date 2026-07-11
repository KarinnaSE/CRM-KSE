import { FichaClient } from "./FichaClient";

/**
 * Ficha del cliente (KAR-17). Server Component fino: resuelve el id de la ruta y delega la
 * pantalla interactiva a FichaClient (Client Component). El id se pasa como string y lo valida
 * el backend (clients.get / historial con normalizeId); un id malformado o inexistente muestra
 * "Cliente no encontrado".
 */
export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FichaClient clientId={id} />;
}
