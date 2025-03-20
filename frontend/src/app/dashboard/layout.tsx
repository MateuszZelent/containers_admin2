"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { authApi } from "@/lib/api-client"
import {
  SidebarInset,
  SidebarProvider,
} from "@/registry/new-york-v4/ui/sidebar"
import { AppSidebar } from "@/app/dashboard/components/app-sidebar"
import { SiteHeader } from "@/app/dashboard/components/site-header"

const sidebarNavItems = [
  {
    title: "Moje kontenery",
    href: "/dashboard",
  },
  {
    title: "Nowy kontener",
    href: "/dashboard/submit-job",
  }
]

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  
  // Sprawdź token przy każdym renderowaniu layoutu
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      // Jeśli nie ma tokenu, przekieruj na stronę logowania
      window.location.href = '/login';
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
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
                <div className="space-y-0.5">
                  <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                  <p className="text-muted-foreground">
                    Zarządzaj swoimi kontenerami obliczeniowymi
                  </p>
                </div>
                <Separator className="my-6" />
                <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                  <div className="flex-1">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  )
}