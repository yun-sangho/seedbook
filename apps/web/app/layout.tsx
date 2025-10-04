import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppHeader } from "@web/components/app-header";
import { AppSidebar } from "@web/components/app-sidebar";
import { ThemeProvider } from "@web/components/theme-provider";
import { SidebarProvider } from "@web/components/ui/sidebar";
import { cn } from "@web/lib/utils";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seedbook - 자산 관리",
  description: "개인 자산 계획 및 투자 관리 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={cn(geist.className, "w-screen h-screen")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <AppSidebar />
            <div className="w-full h-full">
              <AppHeader />
              <main className="w-full h-full max-w-screen-lg mx-auto">{children}</main>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
