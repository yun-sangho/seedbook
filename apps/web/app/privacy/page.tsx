import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@web/lib/company";
import { Sprout } from "lucide-react";

export const metadata: Metadata = {
  title: "개인정보처리방침 - Seedbook",
};

/** 시행일. 내용을 바꾸면 함께 갱신한다. */
const EFFECTIVE_DATE = "2026년 11월 15일";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * 개인정보처리방침 (공개 페이지, 로그인 불필요). 앱 스토어 등록·카카오 로그인 심사에
 * 이 URL(`/privacy`)을 쓴다. 모바일 UA 도 proxy 가 그대로 통과시킨다 (`lib/device.ts`).
 */
export default function PrivacyPage() {
  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-screen-md items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Sprout className="h-5 w-5 text-primary" />
            <span>Seedbook</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md space-y-8 px-4 py-10 text-sm leading-relaxed text-muted-foreground sm:px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">개인정보처리방침</h1>
          <p>
            {COMPANY.name}(이하 &ldquo;회사&rdquo;)는 Seedbook 서비스(웹·앱, 이하
            &ldquo;서비스&rdquo;)를 제공하면서 「개인정보 보호법」 등 관련 법령을 지키고 이용자의
            개인정보를 보호하기 위해 다음과 같이 개인정보처리방침을 둡니다.
          </p>
        </div>

        <Section title="1. 수집하는 개인정보 항목">
          <ul className="list-disc space-y-1 pl-5">
            <li>카카오 로그인: 카카오 회원번호, 닉네임, 프로필 사진, 카카오계정(이메일)</li>
            <li>
              이용자가 직접 입력한 정보: 투자 계좌 이름·종류, 보유 종목과 수량·금액, 포트폴리오 목표
              비중, 리밸런싱 기록, 서비스 설정
            </li>
            <li>
              서비스 이용 과정에서 자동 생성되는 정보: 로그인 세션, 접속 IP 주소, 브라우저·기기
              정보(User-Agent)
            </li>
          </ul>
          <p>
            저장 방식을 &ldquo;이 브라우저에만 저장&rdquo;으로 고른 경우 이용자가 입력한 자산 정보는
            이용자 기기에만 저장되며 회사 서버로 전송되지 않습니다.
          </p>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          <ul className="list-disc space-y-1 pl-5">
            <li>회원 식별, 로그인 유지 및 부정 이용 방지</li>
            <li>이용자가 입력한 자산 정보의 저장·동기화와 포트폴리오·리밸런싱 계산 기능 제공</li>
            <li>문의 응대 및 서비스 관련 공지</li>
          </ul>
          <p>회사는 이용자의 자산 정보를 광고나 마케팅 목적으로 이용하거나 판매하지 않습니다.</p>
        </Section>

        <Section title="3. 보유 및 이용 기간">
          <p>
            개인정보는 회원 탈퇴 시까지 보유합니다. 회원 탈퇴를 하면 계정 정보와 서버에 저장된 자산
            정보를 지체 없이 파기합니다. 다만 관련 법령에 따라 보존해야 하는 정보는 해당 기간 동안
            보관합니다.
          </p>
        </Section>

        <Section title="4. 개인정보의 제3자 제공">
          <p>
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 법령에 근거가 있는 경우는 예외로
            합니다.
          </p>
        </Section>

        <Section title="5. 개인정보 처리의 위탁">
          <p>회사는 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁합니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supabase, Inc.: 데이터베이스 운영 및 보관</li>
            <li>㈜카카오: 카카오 계정을 이용한 로그인(본인 확인)</li>
          </ul>
          <p>
            데이터베이스는 Supabase 의 서울 리전(대한민국)에 보관하며, 회사는 이용자의 개인정보를
            국외로 이전하지 않습니다.
          </p>
        </Section>

        <Section title="6. 개인정보의 파기 절차 및 방법">
          <p>
            보유 기간이 끝났거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은
            복구할 수 없는 방법으로 삭제합니다.
          </p>
        </Section>

        <Section title="7. 이용자의 권리와 행사 방법">
          <p>
            이용자는 언제든지 서비스에서 자신의 정보를 조회·수정할 수 있고, 더보기(모바일) 또는 계정
            메뉴(PC)의 &ldquo;회원 탈퇴&rdquo;로 계정과 모든 데이터를 삭제할 수 있습니다. 그 밖의
            열람·정정·삭제·처리정지 요청은 아래 연락처로 하실 수 있습니다.
          </p>
        </Section>

        <Section title="8. 쿠키 및 브라우저 저장소">
          <p>
            서비스는 로그인 상태 유지를 위해 쿠키를, 화면 설정과 기기 저장 데이터를 위해 브라우저
            저장소(localStorage)를 사용합니다. 브라우저 설정에서 이를 거부할 수 있으나, 이 경우
            로그인이 필요한 서비스를 이용할 수 없습니다.
          </p>
        </Section>

        <Section title="9. 개인정보의 안전성 확보 조치">
          <p>
            회사는 전송 구간 암호화(HTTPS), 접근 권한 최소화, 이용자별 데이터 분리 등 개인정보를
            안전하게 관리하기 위한 조치를 하고 있습니다.
          </p>
        </Section>

        <Section title="10. 개인정보 보호책임자">
          <ul className="list-none space-y-1">
            <li>성명: {COMPANY.ceo}</li>
            <li>
              이메일:{" "}
              <a
                href={`mailto:${COMPANY.email}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {COMPANY.email}
              </a>
            </li>
          </ul>
          <p>
            개인정보 침해에 대한 신고나 상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이
            118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)에 문의하실 수 있습니다.
          </p>
        </Section>

        <Section title="11. 개인정보처리방침의 변경">
          <p>이 방침은 {EFFECTIVE_DATE}부터 시행합니다. 내용이 바뀌면 서비스에서 공지합니다.</p>
        </Section>
      </main>
    </div>
  );
}
