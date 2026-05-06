import { Suspense } from "react";
import { SearchClient } from "./search-client";

export const dynamic = "force-dynamic";

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      <Suspense fallback={null}>
        <SearchClient initialQuery={searchParams.q ?? ""} />
      </Suspense>
    </div>
  );
}
