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
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.url || (item.url !== "/dashboard" && pathname.startsWith(item.url))
            
            return (
              <SidebarMenuItem key={item.title}>
                {/* Użycie komponentu Link do poprawnej nawigacji */}
                <Link href={item.url} className="block w-full">
                  <SidebarMenuButton isActive={isActive}>
                    {item.icon && <item.icon />}
                    {item.title}
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
