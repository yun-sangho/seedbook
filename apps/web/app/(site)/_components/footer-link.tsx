"use client";

import Link from "next/link";
import { Footer } from "@seed-design/react";

/** SEED 푸터 링크. `Footer` 네임스페이스는 서버 컴포넌트에서 부를 수 없어 감싼다. */
export function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Footer.LinkText size="medium" asChild>
      <Link href={href}>{children}</Link>
    </Footer.LinkText>
  );
}
