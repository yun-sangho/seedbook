import { Fragment } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { REBALANCE_BADGE_COLOR } from "@mobile/features/garden/plant-3d/plant-options";
import { resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@mobile/lib/device";
import { Badge } from "@mobile/seed-design/ui/badge";
import { Divider, HStack, Text } from "@seed-design/react";
import { LandingCta } from "@web/components/landing-cta";
import { LandingMobileOnly } from "@web/components/landing-mobile-only";
import { COMPANY } from "@web/lib/company";
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

/**
 * 목표 예시 — 자산마다 목표·기준·지금까지 온 정도(%). 저축·대출은 아직 없는 기능이라 그림 설명에 "예시" 와
 * "준비 중" 을 함께 적는다.
 */
const exampleGoals = [
  {
    asset: "투자 포트폴리오",
    goal: "노후 자금 3억원",
    standard: "주식 60% · 채권 40%",
    progress: 42,
  },
  { asset: "저축", goal: "여행 자금 500만원", standard: "매달 50만원 모으기", progress: 60 },
  { asset: "대출", goal: "전세 대출 다 갚기", standard: "매달 80만원 갚기", progress: 35 },
];

/**
 * 기준 확인 예시 — 자산마다 정한 기준과 지금 상태, 맞추려면 할 일. 저축·대출은 아직 없는 기능이라 그림 설명에
 * "예시" 와 "준비 중" 을 함께 적는다. 종목 이름은 쓰지 않는다 (투자 권유로 읽히지 않게).
 */
const exampleChecks = [
  {
    asset: "투자 포트폴리오",
    now: "주식 비중 68%",
    standard: "기준 60%",
    action: "다시 맞추기",
    off: true,
  },
  { asset: "저축", now: "이번 달 40만원", standard: "기준 50만원", action: "10만원 더", off: true },
  {
    asset: "대출",
    now: "이번 달 80만원 상환",
    standard: "기준 80만원",
    action: "기준 안",
    off: false,
  },
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

/** 목표 예시 카드. 실제 앱 화면이 아니라 자산마다 목표와 기준을 정한 모습을 보여 주는 예시다. */
function GoalExample() {
  return (
    <ul className="mx-auto flex w-full max-w-[420px] flex-col gap-x3">
      {exampleGoals.map((item) => (
        <li
          key={item.asset}
          className="bg-bg-layer-default border-stroke-neutral-subtle rounded-r5 border p-x5 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.35)]"
        >
          <p className="t3-medium text-fg-neutral-subtle">{item.asset}</p>
          <p className="t6-bold mt-x1">{item.goal}</p>
          <p className="t4-regular text-fg-neutral-muted mt-x1">기준 {item.standard}</p>
          <div className="mt-x3 flex items-center gap-x3">
            <div className="bg-bg-neutral-weak h-x1_5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-bg-brand-solid h-full rounded-full"
                style={{ width: `${item.progress}%` }}
              />
            </div>
            <span className="t4-bold shrink-0 tabular-nums">{item.progress}%</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 기준 확인 예시 카드. 실제 앱 화면이 아니라 기준에서 벗어난 것과 할 일을 보여 주는 예시다. */
function StandardCheckExample({ className }: { className?: string }) {
  return (
    <div
      className={`bg-bg-layer-default border-stroke-neutral-subtle rounded-r5 border p-x5 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.4)] ${className ?? ""}`}
    >
      <p className="t4-medium text-fg-neutral-muted">이번 달 기준 확인</p>
      <ul className="border-stroke-neutral-subtle mt-x3 flex flex-col gap-x3 border-t pt-x3">
        {exampleChecks.map((check) => (
          <li key={check.asset} className="flex items-center justify-between gap-x4">
            <div className="min-w-0">
              <p className="t4-bold">{check.asset}</p>
              <p className="t3-regular text-fg-neutral-muted tabular-nums">
                {check.now} · {check.standard}
              </p>
            </div>
            <span
              className={`t4-bold shrink-0 tabular-nums ${check.off ? "text-fg-critical" : "text-fg-positive"}`}
            >
              {check.action}
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
            <h2 className="t10-bold">목표를 이뤄 가는 세 걸음</h2>
            <ol className="mt-x12 flex flex-col gap-x16 md:mt-x16 md:gap-28">
              <Step
                step={1}
                before="모으고는 있는데 어디까지 가야 할지 모르겠다면"
                title="목표와 기준부터 정해요"
                description="모을 금액, 다 갚을 날처럼 이루고 싶은 목표를 정하고, 그 목표로 가는 동안 지킬 기준을 함께 정해요. 여러 곳에 흩어진 자산을 모아 지금 어디쯤인지 한 화면에서 봐요."
              >
                <figure>
                  <GoalExample />
                  <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
                    예시예요 · 저축·대출은 준비 중이에요
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={2}
                reverse
                before="정해 둔 기준을 잊고 지내고 있다면"
                title="기준에서 벗어나면 알려 주고, 맞출 방법을 계산해요"
                description={
                  <>
                    자산을 나눌 비중이든 매달 넣을 금액이든, 정해 둔 기준에서 벗어나면{" "}
                    <RebalanceBadge /> 표시로 알려 줘요. 다시 맞추려면 무엇을 얼마나 하면 되는지
                    계산해 드려요. 실제 거래와 이체는 쓰던 금융사에서 직접 해요.
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
                    <StandardCheckExample className="mx-auto -mt-x10 w-[88%] max-w-[340px] md:absolute md:right-[-16px] md:bottom-[-40px] md:mt-0 md:w-[300px]" />
                  </div>
                  <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center md:mt-x12">
                    기준에서 벗어나면 기울고 ! 표시가 떠요 · 카드는 예시예요 (저축·대출은 준비 중)
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={3}
                before="꾸준히 해도 티가 나지 않았다면"
                title="이룬 목표가 눈에 보이게 쌓여요"
                description="목표에 가까워질수록 식물이 자라요. 목표를 이루면 걸린 기간과 처음에 적어 둔 하고 싶은 일이 기록으로 남고, 다음 목표로 이어 가요."
              >
                <figure>
                  <LandingGarden
                    scene="growth"
                    alt="같은 식물의 다섯 모습이 한 줄로 서 있다. 왼쪽 씨앗부터 새싹, 묘목, 나무, 열매 맺은 나무까지"
                    className="rounded-r6"
                  />
                  <div className="text-fg-neutral-subtle t3-regular mt-x3 flex justify-between px-x2">
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
