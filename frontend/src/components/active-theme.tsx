"use client"

import { createContext, useContext, useEffect, useState } from "react"

type Theme = string

interface ThemeProviderContext {
  activeTheme: Theme
  setActiveTheme: (theme: Theme) => void
}

const initialState: ThemeProviderContext = {
  activeTheme: "default",
  setActiveTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderContext>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "default",
}: {
  children: React.ReactNode
  defaultTheme?: string
}) {
  const [activeTheme, setActiveTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("theme-default", "theme-blue", "theme-green", "theme-amber", "theme-mono")
    root.classList.add(`theme-${activeTheme}`)
  }, [activeTheme])

  return (
    <ThemeProviderContext.Provider
      value={{
        activeTheme,
        setActiveTheme,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useThemeConfig = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useThemeConfig must be used within a ThemeProvider")

  return context
}