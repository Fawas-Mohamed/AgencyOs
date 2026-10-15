import { RequirementDetail } from '@/components/client-hub/requirement-detail';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; requirementId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const ids = await params;
  const query = await searchParams;
  return <RequirementDetail {...ids} saved={query.saved === '1'} />;
}
