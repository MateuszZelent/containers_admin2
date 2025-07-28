"use client"

import * as React from "react"
import { Languages, Check } from "lucide-react"

import { Button } from "@/registry/new-york-v4/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/lib/i18n"

interface LanguageToggleProps {
  variant?: "ghost" | "outline" | "default" | "destructive" | "secondary" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function LanguageToggle({ 
  variant = "ghost", 
  size = "icon", 
  showLabel = false 
}: LanguageToggleProps) {
  const { language, setLanguage, t } = useLanguage()

  const changeLanguage = async (newLanguage: SupportedLanguage) => {
    if (newLanguage === language) return;
    
    try {
      // Use the context method which handles everything properly
      await setLanguage(newLanguage);
    } catch (error: any) {
      console.error('Error changing language:', error);
      // Error handling is now done in the context
    }
  };

  const getCurrentLanguageLabel = () => {
    return SUPPORTED_LANGUAGES[language];
  };

  if (showLabel) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className="gap-2 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Languages className="h-4 w-4" />
            <span className="text-sm">{getCurrentLanguageLabel()}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {Object.entries(SUPPORTED_LANGUAGES).map(([langCode, langName]) => (
            <DropdownMenuItem
              key={langCode}
              onClick={() => changeLanguage(langCode as SupportedLanguage)}
              className="cursor-pointer flex items-center justify-between"
            >
              <span>{langName}</span>
              {language === langCode && (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="h-8 w-8 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-all duration-200 hover:scale-105 active:scale-95 group"
        >
          <Languages className="h-4 w-4 text-slate-600 dark:text-slate-300 group-hover:text-blue-500 transition-colors" />
          <span className="sr-only">Change language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {Object.entries(SUPPORTED_LANGUAGES).map(([langCode, langName]) => (
          <DropdownMenuItem
            key={langCode}
            onClick={() => changeLanguage(langCode as SupportedLanguage)}
            className="cursor-pointer flex items-center justify-between"
          >
            <span>{langName}</span>
            {language === langCode && (
              <Check className="h-4 w-4 text-green-600" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
