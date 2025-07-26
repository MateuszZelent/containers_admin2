"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/registry/new-york-v4/ui/sidebar"

import { ComponentType } from "react"

interface NavItemProps {
  title: string
  url: string
  icon: ComponentType<{ className?: string }>
  isActive?: boolean
}

export function NavMain({
  items,
  className,
}: {
  items: NavItemProps[]
  className?: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.url || (item.url !== "/dashboard" && pathname.startsWith(item.url))
            
            return (
              <SidebarMenuItem key={item.title}>
                <Link href={item.url} className="block w-full">
                  <SidebarMenuButton 
                    isActive={isActive}
                    className={`
                      rounded-xl transition-all duration-300 group hover:scale-[1.02]
                      ${isActive 
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-600/10 dark:from-blue-400/20 dark:to-purple-500/20 border border-blue-200/30 dark:border-blue-700/30 text-blue-900 dark:text-blue-100 shadow-sm' 
                        : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                      }
                    `}
                  >
                    {item.icon && (
                      <div className={`
                        transition-all duration-300
                        ${isActive 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                        }
                      `}>
                        <item.icon className="!size-5" />
                      </div>
                    )}
                    <span className={`
                      font-medium transition-all duration-300
                      ${isActive 
                        ? 'text-blue-900 dark:text-blue-100' 
                        : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                      }
                    `}>
                      {item.title}
                    </span>
                    {isActive && (
                      <div className="ml-auto h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
