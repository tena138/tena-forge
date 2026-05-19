"use client";

import { useEffect } from "react";

export type ReviewHotkeyHandlers = {
  enabled?: boolean;
  shortcutsPaused?: boolean;
  onComplete: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onDifficulty: (difficulty: "하" | "중" | "상" | "최상") => void;
  onToggleSolution: () => void;
  onRequestReextract: () => void;
  onRequestTrash: () => void;
  onToggleHelp: () => void;
  onToggleBatchSelector: () => void;
};

const difficultyByKey = {
  "1": "하",
  "2": "중",
  "3": "상",
  "4": "최상",
} as const;

function isEditableElement(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return false;
}

export function useReviewHotkeys({
  enabled = true,
  shortcutsPaused = false,
  onComplete,
  onNext,
  onPrevious,
  onDifficulty,
  onToggleSolution,
  onRequestReextract,
  onRequestTrash,
  onToggleHelp,
  onToggleBatchSelector,
}: ReviewHotkeyHandlers) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableElement(document.activeElement)) return;

      const key = event.key;
      if (shortcutsPaused && key !== "?") return;
      if (key in difficultyByKey) {
        event.preventDefault();
        onDifficulty(difficultyByKey[key as keyof typeof difficultyByKey]);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        onComplete();
      } else if (key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      } else if (key === " ") {
        event.preventDefault();
        onToggleSolution();
      } else if (key.toLowerCase() === "r") {
        event.preventDefault();
        onRequestReextract();
      } else if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        onRequestTrash();
      } else if (key === "?") {
        event.preventDefault();
        onToggleHelp();
      } else if (key === "Escape") {
        event.preventDefault();
        onToggleBatchSelector();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    shortcutsPaused,
    onComplete,
    onDifficulty,
    onNext,
    onPrevious,
    onRequestReextract,
    onRequestTrash,
    onToggleBatchSelector,
    onToggleHelp,
    onToggleSolution,
  ]);
}
