import type { ReactNode } from "react";
import Link from "next/link";
import { SiteBrand } from "./site-brand";

export function SiteHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="bg-bg-layer-default border-stroke-neutral-subtle sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1104px] items-center justify-between px-x4 md:px-x8">
        <Link href="/">
          <SiteBrand />
        </Link>
        {action}
      </div>
    </header>
  );
}
