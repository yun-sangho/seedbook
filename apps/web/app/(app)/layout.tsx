import { AppHeader } from "@web/components/app-header";
import { AppSidebar } from "@web/components/app-sidebar";
import { AuthGate } from "@web/components/auth-gate";
import { HydrationGate } from "@web/components/hydration-gate";
import { SidebarProvider } from "@web/components/ui/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HydrationGate>
      <AuthGate>
        <SidebarProvider>
          <AppSidebar />
          <div className="w-full h-full">
            <AppHeader />
            <main className="w-full h-full max-w-screen-lg mx-auto">{children}</main>
          </div>
        </SidebarProvider>
      </AuthGate>
    </HydrationGate>
  );
}
