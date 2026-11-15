import { isAppleSignInEnabled } from "@web/lib/auth";

/**
 * 로그인 화면에 띄울 소셜 로그인 목록. Apple 키는 런타임 env 라 빌드 타임에 알 수 없어
 * 클라이언트가 여기서 물어본다. 카카오는 항상 켜져 있다.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ apple: isAppleSignInEnabled });
}
