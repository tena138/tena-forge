"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "tena-forge-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(_value: string | null | undefined): ThemeMode {
  return "light";
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    const initialTheme = normalizeTheme(document.documentElement.dataset.theme || window.localStorage.getItem(THEME_STORAGE_KEY));
    setThemeState(initialTheme);
    applyTheme(initialTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme);
    } catch {
      // Theme still applies for the current tab when storage is unavailable.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: () => {
        const nextTheme: ThemeMode = "light";
        setThemeState(nextTheme);
        applyTheme(nextTheme);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          // Theme still applies for the current tab when storage is unavailable.
        }
      },
      toggleTheme: () => {
        const nextTheme: ThemeMode = "light";
        setThemeState(nextTheme);
        applyTheme(nextTheme);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          // Theme still applies for the current tab when storage is unavailable.
        }
      },
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "light" as ThemeMode,
      setTheme: () => undefined,
      toggleTheme: () => undefined,
    };
  }
  return context;
}
