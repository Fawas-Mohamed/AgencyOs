import { Workspace } from '@/components/client-hub/workspace';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { clientId } = await params;
  const query = await searchParams;
  return <Workspace clientId={clientId} tab={query.tab} saved={query.saved === '1'} />;
}
