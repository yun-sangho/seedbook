import { RebalancingDetailMobile } from "./_components/rebalancing-detail-mobile";

interface RebalancingDetailMobilePageProps {
  params: Promise<{ id: string }>;
}

export default async function RebalancingDetailMobilePage({
  params,
}: RebalancingDetailMobilePageProps) {
  const { id } = await params;
  return <RebalancingDetailMobile id={id} />;
}
