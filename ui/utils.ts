import * as SubframeCore from "@subframe/core";

export const twClassNames = SubframeCore.createTwClassNames([
  "text-caption",
  "text-caption-bold",
  "text-body",
  "text-body-bold",
  "text-heading-3",
  "text-heading-2",
  "text-heading-1",
  "text-monospace-body",
]);

// Shared display helpers
export function formatName(parts: { firstName?: string; middleName?: string; lastName?: string; fallback?: string }): string {
  const name = [parts.firstName, parts.middleName, parts.lastName].filter(Boolean).join(" ").trim();
  return name || (parts.fallback ?? "");
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
