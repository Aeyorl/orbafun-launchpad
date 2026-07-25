import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-7xl font-bold text-accent-green mb-4 tabular-nums">
          404
        </div>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-primary">
            Back to board
          </Link>
          <Link href="/explore" className="btn-secondary">
            Explore tokens
          </Link>
        </div>
      </div>
    </div>
  );
}
