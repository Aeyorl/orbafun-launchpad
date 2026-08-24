import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Trademark Guidelines — Orba',
  description:
    'Draft guidelines for referring to Orba and reporting brand confusion or trademark misuse on the platform.',
  alternates: { canonical: '/legal/trademark-guidelines' },
  robots: { index: false, follow: false },
};

export default function TrademarkGuidelinesPage() {
  return (
    <LegalPage title="Trademark Guidelines" draft>
      <p>These draft guidelines explain acceptable references to Orba and how to report potentially confusing token names, symbols, images, and promotions. They are not yet effective and should not be read as a representation that any Orba mark is federally registered.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">1. Orba Brand Assets</h2>
      <p>Orba claims rights, as available under applicable law, in the Orba name, logos, wordmarks, domain, and other distinctive brand assets (the &quot;Orba Brand Assets&quot;). No license is granted except for the limited descriptive uses below. Any registration status must be verified before these guidelines are published as effective.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">2. Permitted Descriptive Use</h2>
      <p>You may accurately state that a token launched or trades through Orba, link to an Orba page, or discuss and criticize Orba. Use only what is reasonably necessary to identify the Service, keep the reference truthful, and make clear that you are independent. For example, &quot;launched on Orba&quot; is ordinarily acceptable when true.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">3. Permission Required</h2>
      <p>Unless Orba gives written permission, do not:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>use an Orba logo or confusingly similar design as your token, product, company, account, or community identity;</li>
        <li>include &quot;Orba&quot; or a confusingly similar term in a domain, app name, token name, ticker, or commercial service;</li>
        <li>alter, stretch, recolor, combine, or animate official brand assets in a way presented as official;</li>
        <li>describe a token, agent, template, event, partnership, endorsement, or promotion as official when it is not;</li>
        <li>use Orba Brand Assets in advertising or metadata to misdirect traffic or create confusion; or</li>
        <li>use the brand in connection with unlawful, deceptive, infringing, or harmful activity.</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">4. User and Agent Content</h2>
      <p>Token launchers, content submitters, and agent operators are responsible for confirming that names, symbols, likenesses, logos, artwork, descriptions, and links do not violate another person&apos;s trademark, publicity, or other rights. A disclaimer does not cure confusing or unauthorized use. Orba&apos;s acceptance or display of content is not legal clearance.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">5. Circle, Arc, and USDC</h2>
      <p>Circle, Arc, USDC, and their associated logos and brand assets belong to Circle or its licensors. Orba refers to Arc and USDC only to identify the network and asset used by the Service. Orba is an independent project and is not affiliated with, sponsored by, or endorsed by Circle. Nothing in these guidelines grants permission to use Circle brand assets. Refer to <a href="https://www.circle.com/pressroom" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">Circle&apos;s current brand materials</a> before using them.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">6. Reporting a Concern</h2>
      <p>Send a report to <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">legal@orba.fun</a> with:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>your name, organization, contact information, and authority to act;</li>
        <li>the mark, registration details if any, relevant territory, and goods or services;</li>
        <li>the Orba URL, token address, agent, image, message, or other material at issue;</li>
        <li>an explanation of the likely confusion, impersonation, or infringement; and</li>
        <li>supporting evidence and the action you request.</li>
      </ul>
      <p>Orba may request additional information and may forward the report to the affected user or operator.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">7. Available Actions and Limits</h2>
      <p>Depending on the circumstances, Orba may label, rank lower, filter, or hide content from Orba-controlled interfaces; remove off-chain metadata; or restrict API and platform-agent access. These measures do not erase on-chain token names, symbols, addresses, transactions, or third-party copies, and do not resolve ownership disputes between private parties.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">8. Reservation of Rights</h2>
      <p>Orba may withdraw permission, update these guidelines, and take proportionate action to protect its brand and users. Failure to act in one instance is not a waiver. Requests for broader logo or partnership use must be approved in writing by Orba.</p>
    </LegalPage>
  );
}
