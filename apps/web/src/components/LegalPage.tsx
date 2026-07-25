/**
 * LegalPage — shared template for legal document pages.
 * Renders a title, last-updated date, and prose content.
 */
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-xs text-text-muted mb-6">Last updated: {lastUpdated}</p>
      <div className="prose prose-invert max-w-none text-sm text-text-secondary leading-relaxed space-y-4">
        {children}
      </div>
    </>
  );
}
