import { Fragment } from "react";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { Divider, HStack, Icon, Text, VStack } from "@seed-design/react";
import { LandingCta } from "@web/components/landing-cta";
import { LandingMobileOnly } from "@web/components/landing-mobile-only";
import { COMPANY } from "@web/lib/company";
import { resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@web/lib/device";
import { ListChecks, type LucideIcon, PieChart, Scale, Wallet } from "lucide-react";
import { AppScreen, type AppScreenName } from "./_components/app-screen";
import { FooterLink } from "./_components/footer-link";
import { SiteBrand } from "./_components/site-brand";
import { SiteHeader } from "./_components/site-header";

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
  screen: AppScreenName;
  alt: string;
};

const steps: Step[] = [
  {
    icon: Wallet,
    title: "계좌를 한곳에 모아요",
    description:
      "ISA, 연금저축, IRP처럼 나눠 둔 계좌의 보유 종목과 현금을 입력하면 평가금액과 수익률을 함께 보여줘요.",
    screen: "accounts",
    alt: "계좌별 평가금액과 수익률, 리밸런싱 필요 여부가 보이는 계좌 화면",
  },
  {
    icon: PieChart,
    title: "목표 비중을 정해요",
    description:
      "포트폴리오에 종목별 목표 비중을 정하고 계좌를 연결해요. 얼마나 벗어나면 경고를 보여줄지도 직접 정해요.",
    screen: "portfolio",
    alt: "이격 경고 기준과 연결된 계좌의 상태, 종목별 실제 비중과 목표 비중이 보이는 포트폴리오 화면",
  },
  {
    icon: Scale,
    title: "사고팔 수량을 확인해요",
    description:
      "거래 가능 금액을 넣으면 목표에서 벗어난 종목을 골라 매수·매도 권장 수량과 금액을 계산해요.",
    screen: "rebalancing",
    alt: "거래 가능 금액과 종목별 이격, 권장 매매가 보이는 리밸런싱 계산 화면",
  },
  {
    icon: ListChecks,
    title: "매매를 하나씩 끝내요",
    description:
      "권장 매매가 할 일 목록이 돼요. 증권사에서 주문한 뒤 체결 수량과 가격을 기록하면 남은 매매와 끝난 매매를 나눠 보여줘요.",
    screen: "session",
    alt: "주문 전 2건과 체결됨 2건으로 나뉜 리밸런싱 매매 목록 화면",
  },
];

const facts = [
  {
    title: "어디에 저장할지 직접 골라요",
    description:
      "이 기기에만 두거나, 클라우드에 저장해 같은 계정의 다른 기기에서도 볼 수 있어요. 저장 위치를 바꿔도 양쪽 데이터를 합쳐요.",
  },
  {
    title: "데이터를 파일로 꺼낼 수 있어요",
    description: "계좌와 포트폴리오, 리밸런싱 기록을 JSON 파일로 내보내고 다시 가져와요.",
  },
  {
    title: "주문은 대신 넣지 않아요",
    description:
      "증권사 계좌에 연결하지 않아요. 보유 수량은 직접 입력하고, 실제 매매는 쓰던 증권사에서 해요.",
  },
  {
    title: "입력하기 전에 둘러볼 수 있어요",
    description: "설정에서 데모 데이터를 불러오면 샘플 계좌와 포트폴리오로 먼저 써볼 수 있어요.",
  },
];

const companyInfo = [
  { label: "회사명", value: COMPANY.name },
  { label: "대표", value: COMPANY.ceo },
  { label: "사업자등록번호", value: COMPANY.registrationNumber },
  { label: "주소", value: COMPANY.address },
  { label: "이메일", value: COMPANY.email },
];

/** 앱 화면은 모바일 UI 뿐이라, 데스크탑에서는 로그인 대신 휴대폰 이용을 안내한다. */
async function isDesktopVisitor(): Promise<{ desktop: boolean; host: string }> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const agent = userAgent({ headers: headerList });
  const kind = resolveDeviceKind({
    deviceType: agent.device.type,
    userAgent: agent.ua,
    override: cookieStore.get(VIEW_OVERRIDE_COOKIE)?.value,
  });
  return { desktop: kind === "desktop", host: headerList.get("host") ?? "seedbook.boogie.ing" };
}

function StartAction({ desktop, host }: { desktop: boolean; host: string }) {
  return desktop ? <LandingMobileOnly host={host} /> : <LandingCta placement="hero" />;
}

function StepCard({ step, order }: { step: Step; order: number }) {
  const StepIcon = step.icon;
  return (
    <li className="bg-bg-neutral-weak overflow-hidden rounded-r6 px-x6 pt-x6">
      <HStack gap="x4" align="flex-start">
        <div className="bg-bg-brand-weak rounded-r3 flex size-x12 shrink-0 items-center justify-center">
          <Icon svg={<StepIcon aria-hidden />} size="x6" color="fg.brandContrast" />
        </div>
        <VStack gap="x1_5" minHeight={{ md: "80px" }}>
          <Text as="h3" textStyle="t6Bold">
            {order}. {step.title}
          </Text>
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            {step.description}
          </Text>
        </VStack>
      </HStack>
      {/* 화면 위쪽만 보이게 아래를 자른다. */}
      <div className="border-stroke-neutral-muted mx-auto mt-x6 h-[540px] max-w-[320px] overflow-hidden rounded-t-r6 border-[6px] border-b-0">
        <AppScreen name={step.screen} alt={step.alt} />
      </div>
    </li>
  );
}

export default async function HomePage() {
  const { desktop, host } = await isDesktopVisitor();
  return (
    <>
      <SiteHeader action={desktop ? undefined : <LandingCta placement="header" />} />

      <main className="break-keep">
        <section className="mx-auto grid w-full max-w-[1104px] items-center gap-x12 px-x4 py-x16 md:grid-cols-[1fr_320px] md:px-x8 md:py-28">
          <div>
            <h1 className="t12-bold md:t14-bold">
              목표 비중에서 벗어나면
              <br />
              <span className="text-fg-brand-contrast">사고팔 수량을 알려줘요</span>
            </h1>
            <p className="t5-regular md:t7-regular text-fg-neutral-muted mt-x5 max-w-xl">
              Seedbook은 여러 투자 계좌를 모아 목표 비중과 비교하고, 리밸런싱에 필요한 매매를
              목록으로 정리하는 자산 관리 도구예요.
            </p>
            <div className="mt-x10">
              <StartAction desktop={desktop} host={host} />
            </div>
          </div>
          <figure className="mx-auto w-full max-w-[320px]">
            <div className="border-stroke-neutral-muted overflow-hidden rounded-r6 border-[6px]">
              <AppScreen
                name="home"
                alt="총 평가금액과 리밸런싱이 필요한 계좌 알림, 보유 종목이 보이는 홈 화면"
                priority
              />
            </div>
            <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
              이 페이지의 앱 화면은 모두 데모 데이터예요
            </figcaption>
          </figure>
        </section>

        <section className="mx-auto w-full max-w-[1104px] px-x4 pb-x16 md:px-x8 md:pb-28">
          <h2 className="t10-bold">계좌 정리부터 매매 기록까지</h2>
          <ol className="mt-x8 grid gap-x4 md:grid-cols-2 md:gap-x6">
            {steps.map((step, index) => (
              <StepCard key={step.screen} step={step} order={index + 1} />
            ))}
          </ol>
        </section>

        <section className="bg-bg-neutral-weak">
          <div className="mx-auto w-full max-w-[1104px] px-x4 py-x16 md:px-x8 md:py-x20">
            <h2 className="t10-bold">시작하기 전에 알아두세요</h2>
            <dl className="mt-x8 grid gap-x8 md:grid-cols-2 md:gap-x-x12">
              {facts.map((fact) => (
                <div key={fact.title}>
                  <dt className="t6-bold">{fact.title}</dt>
                  <dd className="t5-regular text-fg-neutral-muted mt-x1_5">{fact.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-bg-brand-weak">
          <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-x6 px-x4 py-x16 md:flex-row md:items-center md:justify-between md:px-x8">
            <h2 className="t10-bold">
              지금 내 비중은
              <br />
              목표와 얼마나 다를까요?
            </h2>
            <StartAction desktop={desktop} host={host} />
          </div>
        </section>
      </main>

      <footer>
        <Divider />
        <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-x6 px-x4 py-x10 md:px-x8">
          <HStack gap="x4" align="center" justify="space-between" wrap>
            <SiteBrand />
            <FooterLink href={`mailto:${COMPANY.email}`}>{COMPANY.email}</FooterLink>
          </HStack>
          <dl className="t3-regular text-fg-neutral-subtle grid grid-cols-[auto_1fr] gap-x-x6 gap-y-x1">
            {companyInfo.map((item) => (
              <Fragment key={item.label}>
                <dt className="font-medium text-fg-neutral-muted">{item.label}</dt>
                <dd>{item.value}</dd>
              </Fragment>
            ))}
          </dl>
          <HStack>
            <FooterLink href="/privacy">개인정보처리방침</FooterLink>
          </HStack>
          <Text as="p" textStyle="t3Regular" color="fg.neutralSubtle">
            &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
          </Text>
        </div>
      </footer>
    </>
  );
}
