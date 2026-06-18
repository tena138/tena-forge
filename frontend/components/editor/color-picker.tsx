"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { HexAlphaColorPicker, HexColorPicker } from "react-colorful";
import { Pipette, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RECENT_KEY = "tena-forge-editor-recent-colors";
const presets = [
  "#0f1117", "#1f2430", "#475569", "#94a3b8", "#f8fafc", "#ffffff",
  "#8b5cf6", "#6366f1", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308",
  "#f97316", "#ec4899", "#ef4444", "#a855f7", "#06b6d4", "#84cc16",
];

type ColorPickerVariant = "field" | "swatch";

type ColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  variant?: ColorPickerVariant;
  triggerClassName?: string;
  showValue?: boolean;
  allowAlpha?: boolean;
  allowTransparent?: boolean;
};

function readRecent() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function writeRecent(color: string) {
  if (typeof window === "undefined" || color === "transparent") return;
  const next = [color, ...readRecent().filter((item) => item !== color)].slice(0, 10);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("tena-forge-editor-recent-colors-changed"));
}

export function ColorPicker({
  value,
  onChange,
  label,
  variant = "field",
  triggerClassName,
  showValue = variant === "field",
  allowAlpha = true,
  allowTransparent = true,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const displayValue = value || "transparent";
  const solidValue = displayValue === "transparent" ? (allowAlpha ? "#00000000" : "#000000") : displayValue;

  useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  useEffect(() => {
    setDraft(displayValue);
  }, [displayValue]);

  async function pickEyeDropper() {
    const eyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!eyeDropper) return;
    const result = await new eyeDropper().open();
    onChange(result.sRGBHex);
    writeRecent(result.sRGBHex);
    setRecent(readRecent());
  }

  function commit(color: string) {
    onChange(color);
    writeRecent(color);
    setRecent(readRecent());
  }

  const swatchBackground = displayValue === "transparent"
    ? "repeating-conic-gradient(rgb(51 65 85) 0 25%, rgb(15 23 42) 0 50%) 50% / 8px 8px"
    : displayValue;
  const Picker = allowAlpha ? HexAlphaColorPicker : HexColorPicker;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            variant === "swatch"
              ? "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/25 bg-black/30 p-0.5 shadow-sm transition hover:border-white/45 focus:outline-none focus:ring-2 focus:ring-zinc-300/35"
              : "flex h-9 w-full items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.045] px-2 text-left text-xs text-slate-200 shadow-sm transition hover:border-zinc-300/35 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-zinc-300/30",
            triggerClassName
          )}
          aria-label={`${label} 색상 선택`}
          title={`${label} 색상 선택`}
        >
          <span className={cn("rounded border border-white/25", variant === "swatch" ? "h-full w-full" : "h-5 w-5 shrink-0")} style={{ background: swatchBackground }} />
          {variant === "field" ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
          {showValue ? <span className="ml-auto font-mono text-[11px] text-slate-500">{displayValue}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          className="z-[100] w-[304px] rounded-lg border border-white/12 bg-[#11101a]/95 p-3 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-500">{displayValue}</div>
            </div>
            <Popover.Close asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="색상 패널 닫기"><X className="h-4 w-4" /></Button>
            </Popover.Close>
          </div>
          <Picker color={solidValue} onChange={commit} className="tena-colorful mt-3 !h-[190px] !w-full" />
          <div className="mt-3 flex items-center gap-2">
            <div className="h-9 w-12 rounded-md border border-white/12 shadow-inner" style={{ background: swatchBackground }} />
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onChange(event.target.value);
              }}
              onBlur={(event) => commit(event.target.value.trim() || "transparent")}
              className="h-9 border-white/10 bg-black/25 font-mono text-xs text-slate-100 focus-visible:ring-zinc-300/35"
              aria-label="색상 값"
            />
            <Button size="icon" variant="outline" className="h-9 w-9 border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/10 hover:text-white" onClick={pickEyeDropper} aria-label="스포이드">
              <Pipette className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">최근 색상</div>
            <div className="grid min-h-5 grid-cols-10 gap-1">
              {recent.length ? recent.map((color) => (
                <button key={color} className="h-5 rounded border border-white/14 shadow-sm transition hover:scale-105 hover:border-white/35" style={{ background: color }} onClick={() => commit(color)} aria-label={`최근 색상 ${color}`} />
              )) : <div className="col-span-10 text-xs text-slate-600">아직 없음</div>}
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">프리셋</div>
            <div className="grid grid-cols-6 gap-1">
              {presets.map((color) => (
                <button key={color} className="h-7 rounded border border-white/14 shadow-sm transition hover:scale-105 hover:border-white/35" style={{ background: color }} onClick={() => commit(color)} aria-label={`프리셋 색상 ${color}`} />
              ))}
              {allowTransparent ? <button className="h-7 rounded border border-white/14 bg-black/25 text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-100" onClick={() => commit("transparent")} aria-label="투명">투명</button> : null}
            </div>
          </div>
          <Popover.Arrow className="fill-[#11101a]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
