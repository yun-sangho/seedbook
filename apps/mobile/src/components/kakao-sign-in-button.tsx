import type { SVGProps } from "react";
import { ActionButton, type ActionButtonProps } from "@mobile/seed-design/ui/action-button";
import { PrefixIcon } from "@seed-design/react";

/**
 * 카카오 말풍선 심볼. 카카오 디벨로퍼스 [도구] > [리소스 다운로드] > [카카오 로그인] 의 표준 버튼 SVG
 * (login-complete-ko.svg) 에서 심볼 경로만 그대로 옮겼다 — 형태·비율·색은 바꿀 수 없다 (디자인 가이드).
 */
function KakaoSymbol(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="61.5 16.5 13 13" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M68.001 16.5225C64.4222 16.5225 61.5225 19.0037 61.5225 22.0641C61.5225 24.0312 62.7219 25.7596 64.5292 26.7423L63.9181 29.2113C63.8954 29.285 63.9132 29.364 63.9619 29.4184C63.9975 29.457 64.0461 29.478 64.0931 29.478C64.1337 29.478 64.1742 29.464 64.2082 29.4341L66.834 27.5144C67.2117 27.5723 67.6007 27.6039 67.9994 27.6039C71.5767 27.6039 74.478 25.1226 74.478 22.0623C74.478 19.002 71.5783 16.5225 68.001 16.5225Z"
        fill="#000000"
      />
    </svg>
  );
}

/**
 * 카카오 로그인 버튼. 앱 버튼은 neutralSolid 지만 외부 로그인 버튼은 그 서비스의 지침을 따른다 —
 * 카카오 로그인 디자인 가이드 (https://developers.kakao.com/docs/ko/kakaologin/design-guide): 컨테이너
 * #FEE500, 말풍선 심볼 #000000, 레이블 "카카오 로그인" #000000 85%, radius 12px. 다크 모드에서도 같은 색이다
 * (다른 색은 허용하지 않는다). 크기·로딩 표시는 SEED ActionButton 을 그대로 쓴다.
 */
export function KakaoSignInButton(
  props: Pick<ActionButtonProps, "size" | "loading" | "disabled" | "onClick">
) {
  return (
    <ActionButton
      variant="neutralSolid"
      className="!rounded-[12px] !bg-[#FEE500] !text-black/85 disabled:opacity-50"
      {...props}
    >
      <PrefixIcon svg={<KakaoSymbol />} />
      카카오 로그인
    </ActionButton>
  );
}
