import Link from "next/link";
import { LandingCta } from "@web/components/landing-cta";
import { Card, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card";
import { PieChart, Sprout, Target } from "lucide-react";

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

const COMPANY = {
  name: "부기클럽",
  ceo: "전인아",
  email: "ina@boogie.ing",
  registrationNumber: "529-03-03120",
  address: "서울시 성동구 독서당로 272 103동 1001호",
};

export default function HomePage() {
  return (
    <div className="w-full h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="max-w-screen-lg mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Sprout className="w-5 h-5 text-primary" />
            <span>Seedbook</span>
          </Link>
          <LandingCta size="default" />
        </div>
      </header>

      <main>
        <section className="max-w-screen-lg mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <p className="text-sm font-medium text-primary mb-4">개인 자산 관리 도구</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
            오늘의 한 걸음이
            <br />
            30년 뒤의 자산이 됩니다
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
            Seedbook 은 자산을 기록하고, 계획을 세우고, 진행 상황을 추적하는
            <br className="hidden sm:inline" />
            가장 단순한 방법이에요. 카카오 계정으로 30초만에 시작하세요.
          </p>
          <div className="mt-10 flex justify-center">
            <LandingCta size="lg" />
          </div>
        </section>

        <section className="max-w-screen-lg mx-auto px-4 sm:px-6 pb-24">
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title}>
                  <CardHeader>
                    <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/30">
        <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10 text-sm text-muted-foreground">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Sprout className="w-4 h-4 text-primary" />
              <span>Seedbook</span>
            </div>
            <a href={`mailto:${COMPANY.email}`} className="hover:text-foreground transition-colors">
              {COMPANY.email}
            </a>
          </div>
          <dl className="mt-6 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_1fr] sm:gap-y-1">
            <dt className="font-medium text-foreground/80">회사명</dt>
            <dd>{COMPANY.name}</dd>
            <dt className="font-medium text-foreground/80">대표</dt>
            <dd>{COMPANY.ceo}</dd>
            <dt className="font-medium text-foreground/80">사업자등록번호</dt>
            <dd>{COMPANY.registrationNumber}</dd>
            <dt className="font-medium text-foreground/80">주소</dt>
            <dd>{COMPANY.address}</dd>
            <dt className="font-medium text-foreground/80">이메일</dt>
            <dd>{COMPANY.email}</dd>
          </dl>
          <p className="mt-8 text-xs">
            &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
