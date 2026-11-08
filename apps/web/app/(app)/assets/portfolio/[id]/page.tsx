import { PortfolioDetail } from "./_components/portfolio-detail";

interface PortfolioDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PortfolioDetailPage({ params }: PortfolioDetailPageProps) {
  const { id } = await params;
  return (
    <div className="w-full h-full py-8 px-6">
      <PortfolioDetail id={id} />
    </div>
  );
}
