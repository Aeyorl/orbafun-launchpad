import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog — Orba',
  description:
    'The Orba publication hub for product updates, protocol explanations, agent research, security notes, and market-building lessons.',
  alternates: { canonical: '/blog' },
};

const topics = [
  {
    title: 'Product updates',
    description:
      'Release notes, interface changes, launch milestones, and clear explanations of what changed for users.',
  },
  {
    title: 'Protocol & engineering',
    description:
      'Bonding-curve mechanics, graduation, indexing, infrastructure, and the tradeoffs behind Orba’s architecture.',
  },
  {
    title: 'Agents & markets',
    description:
      'Practical research on agent-launched tokens, automation controls, market behavior, and operator responsibility.',
  },
  {
    title: 'Security notes',
    description:
      'Evidence-based write-ups on reviews, incidents, mitigations, and the limits of each security claim.',
  },
] as const;

export default function BlogPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Blog</h1>
        <p className="text-text-secondary">
          Orba&apos;s home for product updates, technical explanations, agent
          research, and honest notes about building markets on NEAR.
        </p>
      </header>

      <div className="card p-6 mb-6">
        <p className="font-semibold text-lg mb-2">No posts published yet</p>
        <p className="text-sm text-text-secondary leading-relaxed">
          The publication is ready, but the archive is intentionally empty. Orba
          will publish only when there is a concrete release, result, risk, or
          lesson worth documenting. No placeholder articles, invented authors, or
          artificial publication dates are included.
        </p>
      </div>

      <section aria-labelledby="planned-coverage">
        <h2 id="planned-coverage" className="text-xl font-bold mb-4">Planned coverage</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {topics.map((topic) => (
            <article key={topic.title} className="card p-5">
              <h3 className="font-semibold mb-2">{topic.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{topic.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-8 border-t border-bg-border pt-6 text-sm text-text-secondary">
        <p className="mb-3">
          Need product instructions now? The documentation and fee breakdown are
          maintained separately from editorial posts.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/docs" className="btn-secondary inline-block">Read the docs</Link>
          <Link href="/fees" className="btn-secondary inline-block">Review fees</Link>
        </div>
      </div>
    </div>
  );
}
