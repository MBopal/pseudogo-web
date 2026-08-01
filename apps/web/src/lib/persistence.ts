/**
 * Persistence: localStorage autosave + URL-encoded sharing (see PRD
 * "Persistence" decision). No backend, no accounts -- both mechanisms are
 * pure client-side and static-hosting-friendly. Deliberately no compression
 * library: realistic teaching-sized PseudoGo programs (a few dozen lines)
 * fit comfortably in a URL as plain base64, and skipping a compression
 * dependency keeps this simple.
 */

import { DEFAULT_PROGRAM } from "./defaultProgram";

const STORAGE_KEY = "pseudogo:autosave";
const CODE_PARAM = "code";

function encodeSource(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSource(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Builds a full shareable URL encoding `source` in the `code` query param. */
export function buildShareUrl(source: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set(CODE_PARAM, encodeSource(source));
  return url.toString();
}

/** Updates the address bar to match `source` without reloading the page
 * (so refreshing after clicking Share preserves the shared program). */
export function syncUrlToSource(source: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(CODE_PARAM, encodeSource(source));
  window.history.replaceState(null, "", url.toString());
}

export function saveAutosave(source: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, source);
  } catch {
    // Storage can fail (private browsing, quota, disabled) -- autosave is a
    // convenience, not a guarantee, so fail silently rather than crash.
  }
}

/** Resolves the program to show on load: a `?code=` link takes priority
 * (an explicit "open this program" action), then the last autosaved
 * program, then the built-in starter example. */
export function loadInitialSource(): string {
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get(CODE_PARAM);
  if (codeParam) {
    const decoded = decodeSource(codeParam);
    if (decoded !== null) return decoded;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch {
    // ignore
  }

  return DEFAULT_PROGRAM;
}
