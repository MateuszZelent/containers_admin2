"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/registry/new-york-v4/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/registry/new-york-v4/ui/sidebar"

import { ComponentType } from "react"

interface AdminNavItemProps {
  title: string
  url: string
  icon: ComponentType<{ className?: string }>
  items?: {
    title: string
    url: string
  }[]
}

export function NavAdmin({
  items,
  className,
}: {
  items: AdminNavItemProps[]
  className?: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <div className="px-3 py-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <div className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
            Panel Administratora
          </div>
        </div>
        <SidebarMenu className="space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.url || pathname.startsWith(item.url + "/")
            const hasSubItems = item.items && item.items.length > 0
            
            if (!hasSubItems) {
              // Simple menu item without subitems
              return (
                <SidebarMenuItem key={item.title}>
                  <Link href={item.url} className="block w-full">
                    <SidebarMenuButton 
                      isActive={isActive}
                      className={`
                        rounded-xl transition-all duration-300 group hover:scale-[1.02]
                        ${isActive 
                          ? 'bg-gradient-to-r from-red-500/10 to-orange-600/10 dark:from-red-400/20 dark:to-orange-500/20 border border-red-200/30 dark:border-red-700/30 text-red-900 dark:text-red-100 shadow-sm' 
                          : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                        }
                      `}
                    >
                      {item.icon && (
                        <div className={`
                          transition-all duration-300
                          ${isActive 
                            ? 'text-red-600 dark:text-red-400' 
                            : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                          }
                        `}>
                          <item.icon className="!size-5" />
                        </div>
                      )}
                      <span className={`
                        font-medium transition-all duration-300
                        ${isActive 
                          ? 'text-red-900 dark:text-red-100' 
                          : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                        }
                      `}>
                        {item.title}
                      </span>
                      {isActive && (
                        <div className="ml-auto h-2 w-2 rounded-full bg-red-500 dark:bg-red-400 animate-pulse" />
                      )}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              )
            }

            // Collapsible menu item with subitems
            return (
              <Collapsible
                key={item.title}
                asChild
                defaultOpen={isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton 
                      tooltip={item.title} 
                      isActive={isActive}
                      className={`
                        rounded-xl transition-all duration-300 group hover:scale-[1.02]
                        ${isActive 
                          ? 'bg-gradient-to-r from-red-500/10 to-orange-600/10 dark:from-red-400/20 dark:to-orange-500/20 border border-red-200/30 dark:border-red-700/30 text-red-900 dark:text-red-100 shadow-sm' 
                          : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                        }
                      `}
                    >
                      {item.icon && (
                        <div className={`
                          transition-all duration-300
                          ${isActive 
                            ? 'text-red-600 dark:text-red-400' 
                            : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                          }
                        `}>
                          <item.icon className="!size-5" />
                        </div>
                      )}
                      <span className={`
                        font-medium transition-all duration-300
                        ${isActive 
                          ? 'text-red-900 dark:text-red-100' 
                          : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                        }
                      `}>
                        {item.title}
                      </span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-slate-400 dark:text-slate-500" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="ml-6 mt-1 space-y-1">
                      {item.items?.map((subItem) => {
                        const isSubActive = pathname === subItem.url
                        
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton 
                              asChild 
                              isActive={isSubActive}
                              className={`
                                rounded-lg transition-all duration-300 group
                                ${isSubActive 
                                  ? 'bg-red-100/50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-l-2 border-red-500 dark:border-red-400' 
                                  : 'hover:bg-slate-100/30 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                }
                              `}
                            >
                              <Link href={subItem.url}>
                                <span className="font-medium">{subItem.title}</span>
                                {isSubActive && (
                                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" />
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
