import { AccountDetailMobile } from "./_components/account-detail-mobile";

interface AccountDetailMobilePageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountDetailMobilePage({ params }: AccountDetailMobilePageProps) {
  const { id } = await params;
  return <AccountDetailMobile id={id} />;
}
