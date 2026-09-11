import { useCallback } from "react";
import { useLocation } from "wouter";

const RETURN_TO_PARAM = "returnTo";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function isInternalPath(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function withoutBasePath(value: string): string {
  if (!basePath || basePath === "/") return value;
  if (value === basePath) return "/";
  return value.startsWith(`${basePath}/`) ? value.slice(basePath.length) : value;
}

export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return withoutBasePath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export function replaceCurrentQuery(values: Record<string, string | number | null | undefined>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Add the current in-portal location to a detail/create URL.
 * The value is restricted to an app-relative path so it cannot become an
 * open redirect.
 */
export function withReturnTo(target: string, from = currentPath()): string {
  if (typeof window === "undefined" || !isInternalPath(from)) return target;

  const url = new URL(target, window.location.origin);
  if (url.origin !== window.location.origin) return target;
  url.searchParams.set(RETURN_TO_PARAM, from);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getReturnTarget(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const returnTo = new URLSearchParams(window.location.search).get(RETURN_TO_PARAM);
  return isInternalPath(returnTo) ? withoutBasePath(returnTo) : fallback;
}

/**
 * Application Back buttons should use the originating context when one was
 * recorded by a list/detail link, and otherwise use the module fallback.
 * Native browser Back remains untouched and continues to follow real history.
 */
export function useReturnNavigation(fallback: string): () => void {
  const [, navigate] = useLocation();

  return useCallback(() => {
    navigate(getReturnTarget(fallback), { replace: true });
  }, [fallback, navigate]);
}