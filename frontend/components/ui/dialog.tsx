"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ className, children, ...props }: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[3010] max-h-[90vh] w-[92vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[14px] bg-card p-4 shadow-[0_24px_90px_rgba(15,23,42,0.24)]",
          className
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">대화상자</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">작업을 진행하기 위한 팝업 창입니다.</DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-[8px] bg-white text-zinc-950 shadow-[0_8px_24px_rgba(0,0,0,0.14)] transition hover:bg-zinc-100" aria-label="닫기">
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
