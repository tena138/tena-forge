"use client";

import { useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function SiteLogo({ className }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  const { theme } = useTheme();
  const logoSrc = theme === "light" ? "/tenaforgelogo.png?v=1" : "/tenaforgelogo-dark.png?v=1";
  const logoTone = theme === "light" ? "brightness-0" : "brightness-0 invert";

  if (missing) {
    return (
      <span className={cn("forge-logo-plate inline-flex h-11 items-center px-3 text-sm font-bold tracking-normal text-foreground sm:h-12", className)}>
        Tena Forge
      </span>
    );
  }

  return (
    <span className={cn("forge-logo-plate inline-flex h-11 items-center px-2 py-1.5 sm:h-12", className)}>
      <img
        src={logoSrc}
        alt="Tena Forge"
        className={cn("h-full w-auto object-contain", logoTone)}
        onError={() => setMissing(true)}
      />
    </span>
  );
}

export function SiteLogoMark({ className }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  const { theme } = useTheme();
  const markSrc = theme === "light" ? "/tenaforge-mark.png?v=1" : "/tenaforge-mark-dark.png?v=1";
  const markTone = theme === "light" ? "brightness-0" : "brightness-0 invert";

  return (
    <span className={cn("forge-logo-plate inline-flex h-12 w-12 items-center justify-center p-1.5", className)}>
      {missing ? (
        <span className="text-base font-black text-foreground">T</span>
      ) : (
        <img
          src={markSrc}
          alt=""
          className={cn("h-full w-full object-contain", markTone)}
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}
