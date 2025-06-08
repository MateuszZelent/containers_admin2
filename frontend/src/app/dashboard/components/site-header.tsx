import { Separator } from "@/registry/new-york-v4/ui/separator"
import { SidebarTrigger } from "@/registry/new-york-v4/ui/sidebar"
import { ModeToggle } from "@/app/dashboard/components/mode-toggle"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 bg-white/70 backdrop-blur-sm dark:bg-slate-800/70 border-b border-white/20 dark:border-slate-700/40 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-md transition-colors" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4 bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700"
        />
        <h1 className="text-base font-medium bg-gradient-to-r from-slate-700 to-slate-500 dark:from-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
          PCSS containers v 0.4 (08.06.2025)
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          {/* <ThemeSelector /> */}
        </div>
      </div>
    </header>
  )
}
