/**
 * Layout for /legal/* pages — shared wrapper with consistent styling.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="card p-8">{children}</div>
      <div className="text-center mt-6 text-xs text-text-muted space-y-1">
        <p>Questions about these policies?</p>
        <p>
          Email:{' '}
          <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
            legal@orba.fun
          </a>
          {' · '}
          <a
            href="https://x.com/orbafun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline"
          >
            @orbafun
          </a>
        </p>
      </div>
    </div>
  );
}
