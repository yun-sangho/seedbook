"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@web/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@web/components/ui/tooltip";
import {
  Building2,
  CreditCard,
  LineChart,
  ListChecks,
  PieChart,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";

const assetItems = [
  {
    title: "전체 자산",
    url: "/assets",
    icon: Wallet,
  },
  {
    title: "자산 기록",
    url: "/assets/progress",
    icon: LineChart,
  },
  {
    title: "투자",
    url: "/assets/investments",
    icon: TrendingUp,
  },
  {
    title: "포트폴리오",
    url: "/assets/portfolio",
    icon: PieChart,
  },
  {
    title: "저축",
    url: "/assets/savings",
    icon: PiggyBank,
  },
  {
    title: "실물 자산",
    url: "/assets/real-assets",
    icon: Building2,
  },
  {
    title: "대출",
    url: "/assets/debt",
    icon: CreditCard,
  },
];

const planItems = [
  {
    title: "자산 계획",
    url: "/asset-plan",
    icon: Target,
  },
  {
    title: "계획 목록",
    url: "/asset-plan-list",
    icon: ListChecks,
  },
];

const adminItems = [
  {
    title: "관리",
    url: "/admin",
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // 경로 변경 시 모바일에서 사이드바 닫기
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>자산 관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {assetItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={pathname === item.url}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>계획</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={pathname === item.url}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={pathname === item.url}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
