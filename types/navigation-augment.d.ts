import type { ReadonlyURLSearchParams } from "next/navigation";

/**
 * Client navigation hooks are only used under Suspense in this app; treat null
 * as empty so strict builds do not fail on defensive Next.js typings.
 */
declare module "next/navigation" {
  export function useSearchParams(): ReadonlyURLSearchParams;
  export function usePathname(): string;
}
