import { Fragment } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
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
 * 목표 예시 — 자산마다 목표·기준·지금까지 온 정도(%). 저축·대출은 아직 없는 기능이라 그림 설명에 "준비 중" 을
 * 적는다.
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
 * "준비 중" 을 적는다. 종목 이름은 쓰지 않는다 (투자 권유로 읽히지 않게).
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

/**
 * 이룬 목표 예시 — 이룬 목표(주), 어느 자산에서 얼마나 걸렸는지, 이루면 하고 싶었던 일(부). 지금 있는 기능인
 * 투자 포트폴리오만 쓴다. 앱의 바구니 카드에서 왔지만 화면 문구에는 "수확"·"바구니" 같은 낯선 말을 쓰지 않는다.
 */
const exampleHarvests = [
  {
    goal: "3,000만원 모으기",
    source: "투자 포트폴리오 · 2년 2개월",
    wish: "가족과 제주도 여행 가기",
    done: true,
    kind: "tree",
    pot: "sun",
  },
  {
    goal: "1,000만원 모으기",
    source: "투자 포트폴리오 · 1년 9개월",
    wish: "부모님 새 냉장고 사 드리기",
    done: false,
    kind: "fern",
    pot: "sky",
  },
] as const;

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
    title: "자산 관리를 대신하지 않아요",
    description:
      "증권사 계좌에 연결하거나 종목을 추천하지 않아요. 사고파는 건 내가 판단해서 내 증권사 앱에서 해요.",
  },
  {
    title: "개인을 특정할 수 있는 정보를 활용하지 않아요",
    description:
      "카카오·Apple 로그인에서 이름·이메일·프로필 사진을 받지 않고, 접속 IP와 기기 정보도 저장하지 않아요.",
  },
  {
    title: "자산 정보를 내 스마트폰에만 둘 수 있어요",
    description:
      "내 스마트폰에만 저장하면 자산 정보가 스마트폰 밖으로 나가지 않아요. 다른 기기에서도 보려면 클라우드 저장을 고르면 돼요.",
  },
  {
    title: "자산 정보를 다른 곳에 쓰지 않아요",
    description: "내 자산 정보를 광고에 쓰지 않고, 다른 회사에 팔거나 넘기지 않아요.",
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
        <span className="bg-bg-neutral-inverted text-fg-neutral-inverted t6-bold flex size-x10 items-center justify-center rounded-full tabular-nums">
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

/** 이룬 목표 예시. 이룬 목표가 크게, 그때 하고 싶었던 일이 그 아래 작게 남는 모습. */
function HarvestExample() {
  return (
    <ul className="mx-auto flex w-full max-w-[420px] flex-col gap-x3">
      {exampleHarvests.map((item) => (
        <li
          key={item.goal}
          className="bg-bg-layer-default border-stroke-neutral-subtle rounded-r5 flex gap-x4 border p-x5 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.35)]"
        >
          <span className="shrink-0">
            <PlantAvatar stage="bloom" kind={item.kind} pot={item.pot} ripe size={56} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t3-bold landing-leaf">목표 달성</p>
            <p className="t7-bold mt-x0_5 tabular-nums">{item.goal}</p>
            <p className="t3-regular text-fg-neutral-subtle mt-x0_5 tabular-nums">{item.source}</p>
            <div className="bg-bg-neutral-weak rounded-r2 mt-x3 flex items-center justify-between gap-x2 px-x3 py-x2">
              <p className="t4-regular min-w-0 text-fg-neutral-muted">{item.wish}</p>
              <span
                className={`t3-bold shrink-0 ${item.done ? "text-fg-neutral" : "text-fg-neutral-subtle"}`}
              >
                {item.done ? "✓ 했어요" : "아직"}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
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
              자산마다 목표와 기준을 정하면, 지금 어디쯤인지 보여 주고 이룬 목표는 쌓여 가요.
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
              alt="화분 세 개가 놓인 정원. 어린 묘목, 꽃이 피고 열매 맺은 나무, 막 돋은 고사리 새순이 있다"
              priority
              className="rounded-r6"
            />
            <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
              목표에 가까워질수록 식물이 자라요
            </figcaption>
          </figure>
        </section>

        {/* 2. 목표를 이뤄 가는 네 걸음 — 번거롭던 일 → 얻는 것 */}
        <section className="bg-bg-neutral-weak">
          <div className={`${SECTION} py-x12 md:py-20`}>
            <h2 className="sr-only">목표를 이뤄 가는 네 걸음</h2>
            <ol className="flex flex-col gap-x16 md:gap-20">
              <Step
                step={1}
                before="어떻게 모아야 할지 막막했다면"
                title="목표와 기준부터 정해요"
                description="이루고 싶은 목표를 정하고, 거기까지 가는 동안 지킬 기준을 함께 정해요. 여러 계좌에 나뉜 자산도 한 화면에 모아 봐요."
              >
                <figure>
                  <GoalExample />
                  <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
                    저축·대출은 준비 중이에요
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={2}
                reverse
                before="정해 둔 기준을 지키기 어려웠다면"
                title="기준에서 벗어나면 알려 줘요"
                description="비중이 한쪽으로 쏠리거나 매달 넣기로 한 금액이 모자라면 바로 알 수 있어요. 기준으로 돌아가려면 무엇을 얼마나 하면 되는지도 계산해 보여 줘요."
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
                    기준에서 벗어나면 기울고 ! 표시가 떠요 · 저축·대출은 준비 중이에요
                  </figcaption>
                </figure>
              </Step>

              <Step
                step={3}
                before="꾸준히 모아도 티가 나지 않았다면"
                title="목표에 가까워질수록 식물이 자라요"
                description="목표에 다가간 만큼 씨앗이 새싹이 되고, 나무가 돼요."
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

              <Step
                step={4}
                reverse
                before="목표를 이루고도 그냥 지나쳤다면"
                title="이룬 목표는 기록으로 남아요"
                description="목표를 이루면 그 순간을 기념하고, 하고 싶었던 일을 해 보세요."
              >
                <HarvestExample />
              </Step>
            </ol>
          </div>
        </section>

        {/* 3. 다루는 자산 — 자산마다 목표와 기준. 아직 없는 것은 준비 중 */}
        <section className={`${SECTION} py-x12 md:py-16`}>
          <h2 className="t6-bold text-fg-neutral-muted">자산마다 목표와 기준을 정해요</h2>
          <ul className="mt-x4 grid gap-x4 md:grid-cols-2 lg:grid-cols-4">
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

        {/* 4. 믿고 쓸 수 있는 이유 */}
        <section className="landing-mint">
          <div className={`${SECTION} py-x12 md:py-16`}>
            <h2 className="sr-only">
              자산 관리를 대신하지 않고, 자산 정보를 다른 곳에 쓰지 않아요
            </h2>
            <dl className="grid gap-x8 md:grid-cols-2 md:gap-x-x12">
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
