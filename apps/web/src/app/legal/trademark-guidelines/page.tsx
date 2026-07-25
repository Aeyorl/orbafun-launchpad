import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Trademark Guidelines — Orba' };

export default function TrademarkGuidelinesPage() {
  return (
    <LegalPage title="Trademark Guidelines" lastUpdated="July 2026">
      <p>
        These guidelines describe how third parties may and may not use Orba
        trademarks, and how to handle third-party trademarks on our platform.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        1. Orba Trademarks
      </h2>
      <p>
        &quot;Orba&quot;, the Orba logo, the orba.fun domain, and related marks
        (collectively, the &quot;Orba Marks&quot;) are trademarks of Orba. You may
        use the Orba name to refer to our Service in a descriptive, non-commercial
        manner (e.g., &quot;I launched a token on Orba&quot;). You may not use our
        marks in a way that implies endorsement, partnership, or affiliation
        without our written permission.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        2. Proper Use of the Orba Marks
      </h2>
      <p>When permitted to refer to Orba, please follow these rules:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Use the mark as an adjective, never as a noun or verb (e.g., &quot;the Orba platform&quot;, not &quot;an Orba&quot;)</li>
        <li>Distinguish the mark from surrounding text with capitalization or styling</li>
        <li>Do not alter, abbreviate, or combine the mark with other words or logos</li>
        <li>Do not use the mark in a way that could suggest Orba endorses you, your token, or your product</li>
        <li>Include attribution such as &quot;Orba is a trademark of Orba. Used with permission&quot; if applicable</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        3. Prohibited Uses
      </h2>
      <p>You may not, without our written permission:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Use the Orba Marks in your own logo, product name, or domain name</li>
        <li>Register or use domain names that incorporate &quot;orba&quot; or confusingly similar terms</li>
        <li>Use the Orba Marks in metadata, keywords, or advertising to attract traffic to non-Orba content</li>
        <li>Use the marks in a way that dilutes their distinctiveness or harms Orba&apos;s reputation</li>
        <li>Imply that tokens you launch are &quot;official&quot; Orba tokens</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        4. Third-Party Trademarks
      </h2>
      <p>
        Users launching tokens on Orba must not use names, symbols, or images that
        infringe on third-party trademarks. This includes:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Brand names (e.g., Nike, Apple, Coca-Cola)</li>
        <li>Celebrity names or likenesses without permission</li>
        <li>Existing crypto project names that could cause confusion</li>
        <li>Logos or imagery protected by trademark</li>
        <li>Names that closely mimic another token&apos;s ticker or branding to mislead buyers</li>
      </ul>
      <p>
        Launchers are solely responsible for any trademark infringement arising from
        their tokens. Orba may, at its discretion, hide infringing tokens from its
        frontend and revoke agent privileges for repeat offenders, but cannot
        remove the underlying on-chain metadata.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        5. Circle &amp; USDC Trademarks
      </h2>
      <p>
        &quot;USDC&quot; and &quot;Circle&quot; are trademarks of Circle Internet
        Financial. Orba is not affiliated with or endorsed by Circle. We use the
        USDC trademark solely to refer to the USDC stablecoin as used on the Arc
        blockchain, in accordance with nominative fair use. &quot;Arc&quot; is a
        trademark of Circle Internet Financial in connection with its blockchain
        network; we refer to it descriptively to identify the chain our Service
        runs on.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        6. Nominative Fair Use
      </h2>
      <p>
        Users and third parties may use the Orba Marks solely to refer to Orba
        itself (nominative fair use), provided the reference is factual, does not
        suggest endorsement, and uses no more of the mark than necessary to
        identify us. Comparative or critical references are permitted so long as
        they are truthful and not misleading.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        7. Linking
      </h2>
      <p>
        You may link to orba.fun from your own site or content. We reserve the right
        to request removal of links that, in our judgment, are defamatory,
        misleading, associated with unlawful activity, or imply endorsement where
        none exists.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        8. Reporting Trademark Infringement
      </h2>
      <p>
        If you believe a token on Orba infringes your trademark, contact us at{' '}
        <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
          legal@orba.fun
        </a>{' '}
        with:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Your trademark registration number and jurisdiction</li>
        <li>The infringing token contract address and a description of the infringement</li>
        <li>Your contact information and a statement of your authority to act</li>
      </ul>
      <p>
        As with copyright claims, our remediation is limited to off-chain measures
        (frontend filtering, agent privilege revocation) because token metadata is
        immutable on-chain.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        9. Enforcement
      </h2>
      <p>
        We reserve the right to take action to protect the Orba Marks, including
        requesting cessation of unauthorized use, refusing service, and pursuing
        legal remedies where appropriate. Failure to enforce a provision of these
        guidelines in any instance does not waive our right to enforce it later.
      </p>
    </LegalPage>
  );
}
