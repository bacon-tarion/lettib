import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <Link href="/" className="text-xl font-bold tracking-tight select-none">
          LettiB
        </Link>
      </div>
      {children}
    </div>
  );
}
