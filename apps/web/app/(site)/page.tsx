import { Fragment } from "react";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { Divider, Grid, HStack, Icon, Text, VStack } from "@seed-design/react";
import { LandingCta } from "@web/components/landing-cta";
import { LandingMobileOnly } from "@web/components/landing-mobile-only";
import { COMPANY } from "@web/lib/company";
import { resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@web/lib/device";
import { PieChart, Sprout, Target } from "lucide-react";
import { FooterLink } from "./_components/footer-link";
import { SiteBrand } from "./_components/site-brand";
import { SiteHeader } from "./_components/site-header";

const features = [
  {
    icon: Sprout,
    title: "투자 계좌 한눈에",
    description: "증권 계좌별 보유 종목과 평가금액, 수익률을 한 곳에서 확인해요.",
  },
  {
    icon: PieChart,
    title: "포트폴리오 목표 비중",
    description: "종목별 목표 비중을 정하고 계좌를 연결해 실제 보유와 비교해요.",
  },
  {
    icon: Target,
    title: "리밸런싱 매매 목록",
    description: "목표에서 벗어난 종목을 사고팔 금액으로 정리하고, 진행 상황을 체크해요.",
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

export default async function HomePage() {
  const { desktop, host } = await isDesktopVisitor();
  return (
    <>
      <SiteHeader action={desktop ? undefined : <LandingCta placement="header" />} />

      <main className="mx-auto w-full max-w-[1104px] px-x4 md:px-x8">
        <section className="flex flex-col items-center py-x16 text-center md:py-28">
          <Text as="p" textStyle="t5Bold" color="fg.informative">
            개인 자산 관리 도구
          </Text>
          <h1 className="t12-bold md:t14-bold mt-3 text-balance break-keep">
            오늘의 한 걸음이
            <br />
            30년 뒤의 자산이 됩니다
          </h1>
          <p className="t5-regular md:t7-regular text-fg-neutral-muted mt-5 max-w-2xl text-balance break-keep">
            Seedbook 은 자산을 기록하고, 계획을 세우고, 진행 상황을 추적하는{" "}
            <br className="hidden md:inline" />
            가장 단순한 방법이에요. 카카오 계정으로 30초만에 시작하세요.
          </p>
          <div className="mt-10">
            {desktop ? <LandingMobileOnly host={host} /> : <LandingCta placement="hero" />}
          </div>
        </section>

        <section className="pb-x16 md:pb-28">
          <Grid columns={{ base: 1, md: 3 }} gap="x4">
            {features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <VStack
                  key={feature.title}
                  gap="x4"
                  p="x6"
                  borderRadius="r5"
                  bg="bg.neutralWeak"
                  align="flex-start"
                >
                  <div className="bg-bg-layer-default rounded-r3 flex size-x12 items-center justify-center">
                    <Icon svg={<FeatureIcon aria-hidden />} size="x6" color="fg.informative" />
                  </div>
                  <VStack gap="x1_5" className="break-keep">
                    <Text as="h2" textStyle="t6Bold">
                      {feature.title}
                    </Text>
                    <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
                      {feature.description}
                    </Text>
                  </VStack>
                </VStack>
              );
            })}
          </Grid>
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
