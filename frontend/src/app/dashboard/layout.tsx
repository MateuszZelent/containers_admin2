"use client";

import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
} from "@/registry/new-york-v4/ui/sidebar";
import { AppSidebar } from "@/app/dashboard/components/app-sidebar";
import { SiteHeader } from "@/app/dashboard/components/site-header";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  // Sprawdź token przy każdym renderowaniu layoutu
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      // Jeśli nie ma tokenu, przekieruj na stronę logowania
      window.location.href = "/login";
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="min-h-screen bg-gradient-to-tr from-transparent via-white/5 to-blue-500/5 dark:from-transparent dark:via-slate-700/10 dark:to-blue-900/5">
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-transparent via-transparent to-transparent dark:from-slate-900/20 dark:via-transparent dark:to-slate-900/20">
          <div className="flex flex-1 flex-col">
            <SidebarProvider
              style={
                {
                  "--sidebar-width": "calc(var(--spacing) * 72)",
                } as React.CSSProperties
              }
            >
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="space-y-6 p-10 pb-16">

                <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                  <div className="flex-1">{children}</div>
                </div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
          </div>
        </div>
      </div>
    </div>
  );
}