import { ClientForm } from '@/components/client-hub/clients';
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientForm clientId={clientId} />;
}
