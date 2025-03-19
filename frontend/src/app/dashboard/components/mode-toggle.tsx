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
      className="group/toggle size-8"
      onClick={toggleTheme}
    >
      <IconBrightness className="h-4 w-4" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
