import { PortfolioDetailMobile } from "./_components/portfolio-detail-mobile";

interface PortfolioDetailMobilePageProps {
  params: Promise<{ id: string }>;
}

export default async function PortfolioDetailMobilePage({
  params,
}: PortfolioDetailMobilePageProps) {
  const { id } = await params;
  return <PortfolioDetailMobile id={id} />;
}
