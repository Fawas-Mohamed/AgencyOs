import { RequirementForm } from '@/components/client-hub/requirement-form';
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; requirementId: string }>;
}) {
  return <RequirementForm {...await params} />;
}
