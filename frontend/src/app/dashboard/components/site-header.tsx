"use client"

import { Separator } from "@/registry/new-york-v4/ui/separator"
import { SidebarTrigger } from "@/registry/new-york-v4/ui/sidebar"
import { ModeToggle } from "@/app/dashboard/components/mode-toggle"
import { LanguageToggle } from "@/app/dashboard/components/language-toggle"
import { ActiveUsersPanel } from "@/app/dashboard/components/active-users-panel"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Zap } from "lucide-react"
import { useEffect, useState } from "react"

export function SiteHeader() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // Mark as client-side to avoid hydration mismatch
    setIsClient(true)
    
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-sm border-b border-slate-200/20 dark:border-slate-800/20">
      {/* Subtle glass morphism background */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/10 to-white/20 dark:from-slate-950/20 dark:via-slate-950/10 dark:to-slate-950/20" />
      
      {/* Content */}
      <div className="relative flex h-16 items-center justify-between px-4 lg:px-6">
        {/* Left section */}
        <div className="flex items-center gap-4">
          <SidebarTrigger className="h-9 w-9 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95" />
          
          <Separator
            orientation="vertical"
            className="h-6 bg-gradient-to-b from-slate-300/60 via-slate-400/40 to-slate-300/60 dark:from-slate-600/60 dark:via-slate-500/40 dark:to-slate-600/60"
          />
          
          {/* Brand section with modern styling */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
            </div>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Time display */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <Clock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
              {isClient ? currentTime.toLocaleTimeString('pl-PL', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
              }) : '--:--:--'}
            </span>
          </div>

          {/* Separator */}
          <Separator
            orientation="vertical"
            className="h-6 bg-gradient-to-b from-slate-300/60 via-slate-400/40 to-slate-300/60 dark:from-slate-600/60 dark:via-slate-500/40 dark:to-slate-600/60"
          />

          {/* Active users with enhanced styling */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <Users className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 hidden sm:inline">
              Aktywni:
            </span>
            <ActiveUsersPanel />
          </div>

          {/* Mode toggle and Language toggle with enhanced styling */}
          <div className="flex items-center rounded-lg bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 p-1">
            <LanguageToggle />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ModeToggle />
          </div>
        </div>
      </div>

      {/* Subtle bottom glow effect */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-300/60 to-transparent dark:via-slate-700/60" />
    </header>
  )
}
