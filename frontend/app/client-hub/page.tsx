import { ClientList } from '@/components/client-hub/clients';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = await searchParams;
  return <ClientList initialQuery={typeof query.q === 'string' ? query.q : ''} />;
}
