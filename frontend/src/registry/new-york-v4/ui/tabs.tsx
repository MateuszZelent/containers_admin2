"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-white/10 dark:bg-slate-800/40 backdrop-blur-md border border-white/20 dark:border-slate-700/60 text-muted-foreground inline-flex h-10 w-fit items-center justify-center rounded-xl p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-white/80 dark:data-[state=active]:bg-slate-700/70 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-4px)] flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-4 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 hover:bg-white/20 dark:hover:bg-slate-700/50 data-[state=active]:shadow-lg data-[state=active]:backdrop-blur-sm data-[state=active]:border-white/30 dark:data-[state=active]:border-slate-600/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
