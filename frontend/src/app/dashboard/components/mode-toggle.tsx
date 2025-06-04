"use client"

import * as React from "react"
import { IconBrightness } from "@tabler/icons-react"
import { useTheme } from "next-themes"

import { Button } from "@/registry/new-york-v4/ui/button"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  return (
    <Button
      variant="secondary"
      size="icon"
      className="group/toggle size-8 bg-white/60 backdrop-blur-sm dark:bg-slate-700/60 hover:bg-white/80 dark:hover:bg-slate-600/70 border border-white/30 dark:border-slate-600/50 transition-all duration-200"
      onClick={toggleTheme}
    >
      <IconBrightness className="h-4 w-4 text-slate-600 dark:text-slate-300" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
