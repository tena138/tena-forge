"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return <TabsPrimitive.List className={cn("inline-flex rounded-lg border bg-card/80 p-1 shadow-sm", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", className)}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
