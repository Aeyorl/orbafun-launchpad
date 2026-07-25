import Link from 'next/link';

export const metadata = { title: 'Blog — Orba' };

export default function BlogPage() {  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-text-secondary mb-8">
        Updates, announcements, and technical deep-dives from the Orba team.
      </p>

      <div className="space-y-4">
        {/* Coming soon placeholder */}
        <div className="card p-6 text-center">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="font-semibold text-lg mb-2">Blog coming soon</h2>
          <p className="text-sm text-text-muted mb-4">
            We&apos;re launching Orba on Friday. Blog posts will follow with
            technical deep-dives, launch retrospectives, and roadmap updates.
          </p>
          <Link href="/" className="btn-secondary inline-block">
            Back to home →
          </Link>
        </div>
      </div>
    </div>
  );
}
