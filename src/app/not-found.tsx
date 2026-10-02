import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">Page not found</h1>
      <p className="text-neutral-500">That page doesn&apos;t exist.</p>
      <Link href="/" className="text-sm font-medium text-neutral-900 underline">
        Back to Home
      </Link>
    </div>
  );
}
