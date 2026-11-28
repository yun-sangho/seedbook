import { Fragment } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import {
  PLANT_STAGES,
  REBALANCE_BADGE_COLOR,
} from "@mobile/features/garden/plant-3d/plant-options";
import { resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@mobile/lib/device";
import { Badge } from "@mobile/seed-design/ui/badge";
import { Divider, HStack, Text } from "@seed-design/react";
import { LandingCta } from "@web/components/landing-cta";
import { LandingMobileOnly } from "@web/components/landing-mobile-only";
import { COMPANY } from "@web/lib/company";
import { AppScreen } from "./_components/app-screen";
import { FooterLink } from "./_components/footer-link";
import { LandingGarden } from "./_components/landing-garden";
import { SiteBrand } from "./_components/site-brand";
import { SiteHeader } from "./_components/site-header";

const TITLE = "Seedbook - 내 자산의 목표를, 내 기준대로";
const DESCRIPTION =
  "투자 포트폴리오, 저축, 적금, 대출처럼 자산마다 목표와 지킬 기준을 정하고 이뤄 가요. 지금 어디쯤인지 보여 주고, 기준에서 벗어나면 알려 주고, 이룬 목표는 눈에 보이게 쌓여요. 저축·적금·대출은 준비 중이에요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "ko_KR" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/** 계산 결과 예시 — 종목 대신 자산군 이름만 써서 특정 종목을 권하는 것으로 읽히지 않게 한다. */
const exampleTrades = [
  { name: "국내 주식 ETF", side: "매수", quantity: "12주", amount: "약 41만원" },
  { name: "미국 주식 ETF", side: "매수", quantity: "3주", amount: "약 52만원" },
  { name: "채권 ETF", side: "매도", quantity: "8주", amount: "약 85만원" },
];

/** 다루는 자산과 각각의 목표·기준. 아직 없는 것은 `ready: false` 로 "준비 중" 을 붙인다. */
const assetKinds = [
  {
    name: "투자 포트폴리오",
    ready: true,
    goal: "모을 금액",
    standard: "자산을 나눌 비중",
    keep: "벗어나면 알려 주고, 맞출 매수·매도 수량을 계산해요",
  },
  {
    name: "저축",
    ready: false,
    goal: "모으고 싶은 금액",
    standard: "꾸준히 모을 금액",
    keep: "모인 만큼 목표에 가까워지는 걸 보며 이어 가요",
  },
  {
    name: "적금",
    ready: false,
    goal: "만기까지 모을 금액",
    standard: "매달 넣을 금액",
    keep: "넣은 만큼 쌓이고, 만기에 이룬 목표로 남아요",
  },
  {
    name: "대출",
    ready: false,
    goal: "다 갚는 날",
    standard: "매달 갚을 금액",
    keep: "갚은 만큼 줄어드는 걸 보며 끝까지 가요",
  },
];

const facts = [
  {
    title: "주문을 대신 넣지 않아요",
    description:
      "증권사 계좌에 연결하지 않고 종목을 추천하지도 않아요. 계산 결과는 내가 정한 목표 비중으로 낸 값이에요. 보유 수량은 직접 입력하고, 매매는 직접 판단해 쓰던 증권사에서 해요.",
  },
  {
    title: "개인정보 없이 로그인해요",
    description:
      "카카오·Apple 로그인에서 이름·이메일·프로필 사진을 받지 않아요. 로그인을 확인하는 번호만 저장해요.",
  },
  {
    title: "어디에 저장할지 직접 골라요",
    description:
      "이 기기에만 두거나, 클라우드에 저장해 같은 계정의 다른 기기에서도 볼 수 있어요. 저장 위치를 바꿔도 양쪽 데이터를 합쳐요.",
  },
  {
    title: "언제든 파일로 꺼낼 수 있어요",
    description: "계좌와 목표, 매매 기록을 JSON 파일로 내보내고 다시 가져와요.",
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

const SECTION = "mx-auto w-full max-w-[1104px] px-x4 md:px-x8";

/** 목표를 이뤄 가는 한 걸음 — 번호, 전에는 번거롭던 일, 얻는 것, 설명. 그림은 `children`. */
function Step({
  step,
  before,
  title,
  description,
  reverse = false,
  children,
}: {
  step: number;
  before: string;
  title: string;
  description: React.ReactNode;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="grid items-center gap-x10 md:grid-cols-2 md:gap-x16">
      <div className={reverse ? "md:order-last" : undefined}>
        <span className="landing-mint landing-leaf t5-bold flex size-x8 items-center justify-center rounded-full">
          {step}
        </span>
        <p className="t5-medium text-fg-neutral-subtle mt-x4">{before}</p>
        <h3 className="t10-bold md:t12-bold mt-x2 text-balance">{title}</h3>
        <p className="t5-regular md:t6-regular text-fg-neutral-muted mt-x4">{description}</p>
      </div>
      {children}
    </li>
  );
}

/** 리밸런싱 계산 결과 예시 카드. 실제 앱 화면이 아니라 계산이 무엇을 내는지 보여 주는 예시다. */
function TradeExample({ className }: { className?: string }) {
  return (
    <div
      className={`bg-bg-layer-default border-stroke-neutral-subtle rounded-r5 border p-x5 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.4)] ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between gap-x4">
        <span className="t4-medium text-fg-neutral-muted">거래 가능 금액</span>
        <span className="t5-bold tabular-nums">300만원</span>
      </div>
      <ul className="border-stroke-neutral-subtle mt-x3 flex flex-col gap-x3 border-t pt-x3">
        {exampleTrades.map((trade) => (
          <li key={trade.name} className="flex items-center justify-between gap-x4">
            <div className="min-w-0">
              <p className="t4-bold">{trade.name}</p>
              <p className="t3-regular text-fg-neutral-muted tabular-nums">{trade.amount}</p>
            </div>
            <span
              className={`t4-bold shrink-0 tabular-nums ${trade.side === "매수" ? "text-fg-critical" : "text-fg-informative"}`}
            >
              {trade.side} {trade.quantity}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RebalanceBadge() {
  return (
    <span
      aria-hidden
      className="inline-flex size-[1.4em] items-center justify-center rounded-full align-[-0.2em] text-[0.8em] font-bold text-white"
      style={{ backgroundColor: REBALANCE_BADGE_COLOR }}
    >
      !
    </span>
  );
}

export default async function HomePage() {
  const { desktop, host } = await isDesktopVisitor();
  return (
    <>
      <SiteHeader action={desktop ? undefined : <LandingCta placement="header" />} />

      <main className="break-keep">
        {/* 1. 히어로 — 내가 정한 목표를 내 기준으로 이뤄 가는 것 */}
        <section
          className={`${SECTION} grid items-center gap-x10 py-x12 md:grid-cols-[1fr_minmax(0,500px)] md:py-24`}
        >
          <div>
            <h1 className="t12-bold md:t14-bold text-balance">
              내 자산의 목표를,
              <br />
              <span className="landing-leaf">내 기준대로 이뤄 가요</span>
            </h1>
            <p className="t5-regular md:t7-regular text-fg-neutral-muted mt-x5 max-w-xl">
              투자 포트폴리오, 저축, 적금, 대출처럼 자산마다 목표와 지킬 기준을 정해요. 지금
              어디쯤인지 보여 주고, 기준에서 벗어나면 알려 주고, 이룬 목표는 눈에 보이게 쌓여요.
            </p>
            <div className="mt-x10">
              <StartAction desktop={desktop} host={host} />
            </div>
            <p className="t4-regular text-fg-neutral-subtle mt-x4">
              App Store 앱은 출시를 준비하고 있어요. 지금은 휴대폰 브라우저에서 바로 쓸 수 있어요.
            </p>
          </div>
          <figure>
            <LandingGarden
              scene="garden"
              alt="화분 세 개가 놓인 앱 첫 화면. 꽃이 핀 나무, 기울어진 채 ! 표시가 뜬 나무, 어린 묘목이 있다"
              priority
              className="rounded-r6"
            />
            <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
              목표에 가까워질수록 식물이 자라요 · 데모 데이터예요
            </figcaption>
          </figure>
        </section>

        {/* 2. 다루는 자산 — 자산마다 목표와 기준. 아직 없는 것은 준비 중 */}
        <section className={`${SECTION} pb-x16 md:pb-24`}>
          <h2 className="t10-bold">자산마다 목표와 기준을 정해요</h2>
          <ul className="mt-x8 grid gap-x4 md:grid-cols-2 lg:grid-cols-4">
            {assetKinds.map((kind) => (
              <li
                key={kind.name}
                className={`rounded-r5 p-x6 ${kind.ready ? "landing-mint" : "border-stroke-neutral-muted border border-dashed"}`}
              >
                {kind.ready ? (
                  <Badge tone="brand" variant="solid" size="large">
                    지금 쓸 수 있어요
                  </Badge>
                ) : (
                  <Badge tone="neutral" variant="weak" size="large">
                    준비 중
                  </Badge>
                )}
                <h3 className="t7-bold mt-x3">{kind.name}</h3>
                <dl className="t5-regular mt-x5 grid grid-cols-[auto_1fr] gap-x-x4 gap-y-x2">
                  <dt className="text-fg-neutral-subtle">목표</dt>
                  <dd>{kind.goal}</dd>
                  <dt className="text-fg-neutral-subtle">기준</dt>
                  <dd>{kind.standard}</dd>
                </dl>
                <p className="t4-regular text-fg-neutral-muted mt-x4">{kind.keep}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. 목표를 이뤄 가는 세 걸음 — 번거롭던 일 → 얻는 것 */}
        <section className="bg-bg-neutral-weak">
          <div className={`${SECTION} py-x16 md:py-28`}>
            <h2 className="t10-bold">투자 포트폴리오로 보면 이렇게 이뤄 가요</h2>
            <ol className="mt-x12 flex flex-col gap-x16 md:mt-x16 md:gap-28">
              <Step
                step={1}
                before="모으고는 있는데 어디까지 가야 할지 모르겠다면"
                title="목표와 기준부터 정해요"
                description="모을 금액과 자산을 나눌 비중을 정해요. ISA, 연금저축, IRP, 일반 계좌의 보유 종목과 현금을 모아 지금 어디쯤인지 한 화면에서 봐요."
              >
                <figure className="mx-auto w-full max-w-[300px]">
                  <div className="border-stroke-neutral-muted overflow-hidden rounded-r6 border-[6px]">
                    <AppScreen
                      name="garden-home"
                      alt="총 평가금액과 목표별 평가금액·수익률 목록이 보이는 앱 홈 화면"
                    />
                  </div>
                  <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
                    데모 데이터로 찍은 앱 화면이에요
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={2}
                reverse
                before="정해 둔 비중을 잊고 지내고 있다면"
                title="기준에서 벗어나면 알려 주고, 맞출 방법을 계산해요"
                description={
                  <>
                    실제 비중이 직접 정한 기준보다 목표에서 벗어나면 <RebalanceBadge /> 표시로 알려
                    줘요. 거래 가능 금액만 넣으면 기준까지 종목별 매수·매도 수량과 금액을 계산해요.
                    매매는 직접 판단해 쓰던 증권사에서 해요.
                  </>
                }
              >
                <figure>
                  <div className="relative">
                    <LandingGarden
                      scene="rebalance"
                      alt="같은 크기의 나무 두 그루. 왼쪽은 똑바로 서 있고, 오른쪽은 기울어진 채 ! 표시가 떠 있다"
                      className="rounded-r6"
                    />
                    <TradeExample className="mx-auto -mt-x10 w-[88%] max-w-[340px] md:absolute md:right-[-16px] md:bottom-[-40px] md:mt-0 md:w-[300px]" />
                  </div>
                  <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center md:mt-x12">
                    기준에서 벗어나면 기울고 ! 표시가 떠요 · 계산 결과는 예시예요
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={3}
                before="꾸준히 해도 티가 나지 않았다면"
                title="이룬 목표가 눈에 보이게 쌓여요"
                description="목표에 가까워질수록 식물이 자라요. 목표를 이루면 걸린 기간과 처음에 적어 둔 하고 싶은 일이 기록으로 남고, 다음 목표로 이어 가요."
              >
                <figure aria-label="목표에 가까워질수록 자라는 식물 다섯 모습">
                  <ol className="grid grid-cols-5 items-end gap-x2 md:gap-x4">
                    {PLANT_STAGES.map((stage) => (
                      <li key={stage} className="[&>svg]:size-full">
                        <PlantAvatar
                          stage={stage}
                          pot="terracotta"
                          size={96}
                          ripe={stage === "bloom"}
                        />
                      </li>
                    ))}
                  </ol>
                  <div className="text-fg-neutral-subtle t3-regular mt-x3 flex justify-between">
                    <span>목표를 정했을 때</span>
                    <span>목표를 이뤘을 때</span>
                  </div>
                </figure>
              </Step>
            </ol>
          </div>
        </section>

        {/* 4. 믿고 쓸 수 있는 이유 */}
        <section className="landing-mint">
          <div className={`${SECTION} py-x16 md:py-24`}>
            <h2 className="t10-bold">내 돈은 쓰던 증권사에 그대로 있어요</h2>
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

        {/* 5. 마지막 CTA */}
        <section className={SECTION}>
          <div className="flex flex-col gap-x6 py-x16 md:flex-row md:items-center md:justify-between">
            <h2 className="t10-bold">
              어떤 목표부터
              <br />
              정해 볼까요?
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
          <HStack gap="x4">
            <FooterLink href="/terms">이용약관</FooterLink>
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
