import { RequirementForm } from '@/components/client-hub/requirement-form';
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <RequirementForm clientId={clientId} />;
}
