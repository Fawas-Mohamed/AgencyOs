import { RequirementDetail } from '@/components/client-hub/requirement-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; requirementId: string }>;
}) {
  return <RequirementDetail {...await params} review />;
}
