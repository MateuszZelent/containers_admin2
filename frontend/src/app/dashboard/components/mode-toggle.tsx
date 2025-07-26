"use client"

import * as React from "react"
import { IconSun, IconMoon } from "@tabler/icons-react"
import { useTheme } from "next-themes"

import { Button } from "@/registry/new-york-v4/ui/button"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-all duration-200 hover:scale-105 active:scale-95 group"
      onClick={toggleTheme}
    >
      <IconSun className="h-4 w-4 text-slate-600 dark:text-slate-300 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 group-hover:text-amber-500" />
      <IconMoon className="absolute h-4 w-4 text-slate-600 dark:text-slate-300 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 group-hover:text-blue-400" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
