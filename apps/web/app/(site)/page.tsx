import { Fragment } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import {
  FERN_STAGE_LABELS,
  PLANT_STAGE_LABELS,
  PLANT_STAGES,
  type PlantStage,
  REBALANCE_BADGE_COLOR,
} from "@mobile/features/garden/plant-3d/plant-options";
import {
  SEED_PRESET_DISCLAIMER,
  SEED_PRESETS,
} from "@mobile/features/onboarding/types/seed-presets";
import { resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@mobile/lib/device";
import { Divider, HStack, Text } from "@seed-design/react";
import { LandingCta } from "@web/components/landing-cta";
import { LandingMobileOnly } from "@web/components/landing-mobile-only";
import { COMPANY } from "@web/lib/company";
import { AppScreen } from "./_components/app-screen";
import { FooterLink } from "./_components/footer-link";
import { LandingGarden } from "./_components/landing-garden";
import { SiteBrand } from "./_components/site-brand";
import { SiteHeader } from "./_components/site-header";

const TITLE = "Seedbook - 포트폴리오가 자라는 투자 정원";
const DESCRIPTION =
  "포트폴리오마다 식물이 하나씩 자라요. 목표 금액을 이룰 때마다 한 단계씩 크고, 목표 비중에서 벗어나면 기울어 리밸런싱할 때를 알려줘요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "ko_KR" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const rebalanceSteps = [
  {
    title: "계좌를 모아요",
    description:
      "ISA, 연금저축, IRP처럼 나눠 둔 계좌의 보유 종목과 현금을 입력하고 포트폴리오에 연결해요.",
  },
  {
    title: "사고팔 수량을 계산해요",
    description:
      "거래 가능 금액을 넣으면 목표에서 벗어난 종목을 골라 매수·매도 권장 수량과 금액을 알려줘요.",
  },
  {
    title: "매매를 하나씩 끝내요",
    description:
      "권장 매매가 할 일 목록이 돼요. 증권사에서 주문한 뒤 체결 수량과 가격을 기록하면 식물이 다시 똑바로 서요.",
  },
];

const facts = [
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
    title: "데이터를 파일로 꺼낼 수 있어요",
    description: "계좌와 포트폴리오, 리밸런싱 기록을 JSON 파일로 내보내고 다시 가져와요.",
  },
  {
    title: "주문은 대신 넣지 않아요",
    description:
      "증권사 계좌에 연결하지 않고 종목을 추천하지도 않아요. 보유 수량은 직접 입력하고, 실제 매매는 쓰던 증권사에서 해요.",
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

/** 성장 단계 한 줄 (나무 또는 고사리). 그림은 칸 폭에 맞춰 커진다. */
function StageRow({
  kind,
  labels,
  renderArt,
}: {
  kind: string;
  labels: Record<PlantStage, string>;
  renderArt: (stage: PlantStage) => React.ReactNode;
}) {
  return (
    <div>
      <h3 className="t5-bold text-fg-neutral-muted">{kind}</h3>
      <ol className="mt-x3 grid grid-cols-5 gap-x2 md:gap-x6">
        {PLANT_STAGES.map((stage, index) => (
          <li key={stage} className="flex flex-col items-center gap-x2">
            <div className="aspect-square w-full max-w-[120px] [&>svg]:size-full">
              {renderArt(stage)}
            </div>
            <span className="t3-medium md:t4-medium text-center">
              <span className="text-fg-neutral-subtle">{index + 1}</span> {labels[stage]}
            </span>
          </li>
        ))}
      </ol>
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
        {/* 1. 히어로 */}
        <section
          className={`${SECTION} grid items-center gap-x10 py-x12 md:grid-cols-[1fr_minmax(0,500px)] md:py-24`}
        >
          <div>
            <h1 className="t12-bold md:t14-bold">
              포트폴리오마다
              <br />
              <span className="landing-leaf">식물이 하나씩 자라요</span>
            </h1>
            <p className="t5-regular md:t7-regular text-fg-neutral-muted mt-x5 max-w-xl">
              목표 비중과 목표 금액을 정하면, 목표를 이룰 때마다 식물이 한 단계씩 자라요. 목표
              비중에서 벗어나면 식물이 기울어 리밸런싱할 때를 알려줘요.
            </p>
            <div className="mt-x10">
              <StartAction desktop={desktop} host={host} />
            </div>
          </div>
          <figure>
            <LandingGarden
              scene="garden"
              alt="화분 세 개가 놓인 정원. 꽃이 핀 나무, 기울어진 채 ! 배지가 뜬 나무, 어린 묘목이 있다"
              priority
              className="rounded-r6"
            />
            <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
              끌어서 돌려 볼 수 있어요 · 데모 데이터예요
            </figcaption>
          </figure>
        </section>

        {/* 2. 성장 5단계 */}
        <section className={`${SECTION} pb-x16 md:pb-28`}>
          <h2 className="t10-bold">목표를 이룰 때마다 한 단계씩 자라요</h2>
          <p className="t5-regular text-fg-neutral-muted mt-x3 max-w-2xl">
            포트폴리오에 목표 금액을 정해 두면, 평가금액이 목표에 닿을 때 식물이 자라요. 다음 목표를
            정하면 또 자랄 준비를 해요. 포트폴리오마다 나무나 고사리가 자라요.
          </p>
          <div className="mt-x8 flex flex-col gap-x8">
            <StageRow
              kind="나무"
              labels={PLANT_STAGE_LABELS}
              renderArt={(stage) => <PlantAvatar stage={stage} pot="terracotta" size={64} />}
            />
            <StageRow
              kind="고사리"
              labels={FERN_STAGE_LABELS}
              renderArt={(stage) => <PlantAvatar stage={stage} kind="fern" pot="cream" size={64} />}
            />
          </div>
          <p className="t4-regular text-fg-neutral-subtle mt-x6">
            목표가 없으면 그대로 있어요. 한 번 자란 식물은 작아지지 않아요.
          </p>
        </section>

        {/* 3. 기울면 리밸런싱 */}
        <section className="bg-bg-neutral-weak">
          <div
            className={`${SECTION} grid items-center gap-x10 py-x16 md:grid-cols-[minmax(0,460px)_1fr] md:py-24`}
          >
            <LandingGarden
              scene="rebalance"
              alt="같은 크기의 나무 두 그루. 왼쪽은 똑바로 서 있고, 오른쪽은 기울어진 채 ! 배지가 떠 있다"
              className="rounded-r6 md:order-none order-last"
            />
            <div>
              <h2 className="t10-bold">
                기울어지면
                <br />
                리밸런싱할 때예요
              </h2>
              <p className="t5-regular text-fg-neutral-muted mt-x3">
                실제 비중이 직접 정한 기준보다 목표에서 벗어나면 식물이 기울고 <RebalanceBadge />{" "}
                배지가 떠요.
              </p>
              <ol className="mt-x8 flex flex-col gap-x6">
                {rebalanceSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-x4">
                    <span className="landing-mint landing-leaf t5-bold flex size-x8 shrink-0 items-center justify-center rounded-full">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="t6-bold">{step.title}</h3>
                      <p className="t5-regular text-fg-neutral-muted mt-x1">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 4. 정원 홈 */}
        <section
          className={`${SECTION} grid items-center gap-x10 py-x16 md:grid-cols-[1fr_320px] md:py-24`}
        >
          <div>
            <h2 className="t10-bold">내 포트폴리오를 한 정원에서</h2>
            <p className="t5-regular text-fg-neutral-muted mt-x3 max-w-xl">
              앱을 열면 내 식물이 한 정원에 모여 있어요. 식물을 누르면 그 포트폴리오의 평가금액,
              다음 목표까지 남은 금액, 리밸런싱이 필요한지를 보여줘요.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-[320px]">
            <div className="border-stroke-neutral-muted overflow-hidden rounded-r6 border-[6px]">
              <AppScreen
                name="garden-home"
                alt="식물 세 그루가 있는 정원과 아래에 포트폴리오별 평가금액 목록이 보이는 홈 화면"
              />
            </div>
            <figcaption className="t3-regular text-fg-neutral-subtle mt-x3 text-center">
              데모 데이터로 찍은 앱 화면이에요
            </figcaption>
          </figure>
        </section>

        {/* 5. 첫 씨앗 */}
        <section className="landing-mint">
          <div className={`${SECTION} py-x16 md:py-24`}>
            <div className="flex items-center gap-x4">
              <div className="size-x16 shrink-0 [&>svg]:size-full">
                <PlantAvatar stage="seed" pot="sun" size={64} />
              </div>
              <h2 className="t10-bold">첫 씨앗을 심어요</h2>
            </div>
            <p className="t5-regular text-fg-neutral-muted mt-x5 max-w-2xl">
              처음 시작할 때 널리 알려진 포트폴리오 하나를 고르거나 직접 만들어요. 자산군마다 종목을
              고르고 첫 목표 금액을 정하면 첫 씨앗이 심겨요.
            </p>
            <ul className="mt-x6 flex flex-wrap gap-x2">
              {SEED_PRESETS.map((preset) => (
                <li
                  key={preset.id}
                  className="bg-bg-layer-default t4-medium rounded-full px-x4 py-x2"
                >
                  {preset.name}
                </li>
              ))}
              <li className="border-stroke-neutral-muted t4-medium rounded-full border border-dashed px-x4 py-x2">
                직접 만들기
              </li>
            </ul>
            <p className="t3-regular text-fg-neutral-subtle mt-x4">{SEED_PRESET_DISCLAIMER}</p>
          </div>
        </section>

        {/* 6. 알아두세요 */}
        <section className={`${SECTION} py-x16 md:py-x20`}>
          <h2 className="t10-bold">시작하기 전에 알아두세요</h2>
          <p className="t5-regular text-fg-neutral-muted mt-x3">
            Seedbook은 투자 계좌, 포트폴리오, 리밸런싱 세 가지만 다뤄요.
          </p>
          <dl className="mt-x8 grid gap-x8 md:grid-cols-2 md:gap-x-x12">
            {facts.map((fact) => (
              <div key={fact.title}>
                <dt className="t6-bold">{fact.title}</dt>
                <dd className="t5-regular text-fg-neutral-muted mt-x1_5">{fact.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 7. 마지막 CTA */}
        <section className="bg-bg-neutral-weak">
          <div
            className={`${SECTION} flex flex-col gap-x6 py-x16 md:flex-row md:items-center md:justify-between`}
          >
            <h2 className="t10-bold">
              내 포트폴리오는 지금
              <br />
              어떤 식물일까요?
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
