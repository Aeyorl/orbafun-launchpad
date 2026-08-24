import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Orba',
  description:
    'Draft terms governing use of Orba, including wallets, token launches, trading, agents, content, fees, and risk.',
  alternates: { canonical: '/legal/terms' },
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" draft>
      <p>
        These draft Terms &amp; Conditions (&quot;Terms&quot;) govern access to
        Orba&apos;s website, APIs, indexer, smart-contract interfaces, agent
        features, and related services (collectively, the &quot;Service&quot;). They
        are not yet effective. By using the Service after the final Terms take
        effect, you agree to them. If you do not agree, do not use the Service.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">1. Nature of the Service</h2>
      <p>Orba provides interfaces and off-chain services for launching, discovering, buying, and selling user-created tokens on Arc. Transactions are executed by smart contracts and the connected wallet or, for specifically identified agent features, by a platform-funded deployer wallet. Orba does not custody user wallets, private keys, or recovery phrases. Confirmed blockchain transactions are generally irreversible.</p>
      <p>Website, API, indexer, metadata, ranking, referral, and agent functions are off-chain services that Orba can change, suspend, filter, or discontinue. The underlying blockchain and independently accessible smart contracts may continue to operate without those services.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">2. Eligibility and Legal Compliance</h2>
      <p>You must be at least 18, have legal capacity to agree to these Terms, and be permitted to use the Service where you live. You may not use the Service if you are subject to applicable sanctions or if your use would violate law. You are responsible for taxes, reporting, licensing, and other obligations arising from your activity.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">3. Wallets, Signatures, and Approvals</h2>
      <p>You control your connected wallet and are responsible for its security. Review the network, contract address, function, amount, recipient, slippage setting, and token approval before signing. Orba cannot recover a wallet, reverse a transaction, or return assets sent to the wrong address. Token approvals remain effective until spent, expired, or revoked; use bounded approvals where available.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">4. Token and Market Risk</h2>
      <p>User-created tokens are highly speculative and may lose all market value. Risks include price volatility, low liquidity, slippage, transaction ordering and MEV, smart-contract defects, malicious or misleading content, compromised wallets, RPC or infrastructure failures, blockchain outages, regulatory action, and changes to third-party services. A token&apos;s presence, ranking, creator, agent association, or graduation status is not an endorsement or a promise of safety, liquidity, or future performance.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">5. No Advice or Fiduciary Relationship</h2>
      <p>Orba does not provide investment, legal, tax, accounting, or other professional advice. Market data, rankings, charts, messages, agent output, and documentation are informational and may be incomplete or delayed. Nothing on the Service is an offer, recommendation, promise of profit, or fiduciary undertaking. Make your own assessment and do not commit funds you cannot afford to lose.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">6. Fees, Gas, and Price Impact</h2>
      <p>The Service may charge token-creation and bonding-curve trading fees. Network gas, token approvals, slippage, and price impact are separate from Orba&apos;s fees. The interface may estimate costs, but estimates can change before confirmation. The final deployed contracts, transaction preview, and signed transaction are authoritative. Current target parameters and their status are described on the <Link href="/fees" className="text-accent-blue hover:underline">Fees page</Link>. Fee parameters may change where the contracts and law permit, with prospective disclosure before the change takes effect.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">7. Referrals</h2>
      <p>Referral attribution and reward amounts are maintained off-chain. An accrued amount is an accounting record, not an on-chain balance, deposit, vested right, or guarantee of payment. No payout is available unless Orba separately enables and announces a claim or distribution process with eligibility, verification, minimums, timing, and legal conditions. Orba may reject self-referrals, manipulation, duplicate attribution, or activity that violates these Terms.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">8. User Content and Token Metadata</h2>
      <p>Token names, symbols, descriptions, images, websites, social links, and messages are user content. You represent that you have the necessary rights to submit that content and that it is accurate, lawful, non-deceptive, and does not infringe intellectual property, privacy, publicity, or other rights. You retain your rights and grant Orba a worldwide, non-exclusive, royalty-free license to host, copy, display, format, moderate, and distribute the content as needed to operate and promote the Service.</p>
      <p>Some token facts and transactions are recorded on-chain and cannot be edited by Orba. Images pinned to IPFS may remain available through third parties. Other descriptions, banners, and social links are stored off-chain and may be updated by an authorized creator or agent, or hidden by Orba from its interfaces. Removing content from Orba does not erase blockchain history or every third-party copy.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">9. Agents and Automated Access</h2>
      <p>Orba may permit registered agents and documented automation. Operators are responsible for their API credentials, configuration, instructions, content, and resulting actions. Platform-agent spending controls apply to Orba&apos;s deployer wallet; they do not cap, insure, or protect funds in a user&apos;s self-custody wallet. Agent capabilities may be unavailable, disabled, rate-limited, or revoked. Additional risks and responsibilities appear in the <Link href="/legal/tokenized-agent-disclaimer" className="text-accent-blue hover:underline">Tokenized Agent Disclaimer</Link>.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">10. Prohibited Conduct</h2>
      <p>You may not:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>use the Service for fraud, sanctions evasion, money laundering, terrorist financing, or other unlawful activity;</li>
        <li>launch infringing, deceptive, impersonating, defamatory, or unlawful tokens or content;</li>
        <li>wash trade, self-deal, front-run through deception, manipulate rankings or prices, or coordinate market abuse;</li>
        <li>exploit or attempt to exploit smart contracts, APIs, wallets, rate limits, referrals, agent limits, or infrastructure;</li>
        <li>use automation in a way that overloads the Service, bypasses controls, misleads users, or creates an unfair or unlawful market advantage;</li>
        <li>introduce malware, scrape protected or non-public data, probe without authorization, or interfere with another user; or</li>
        <li>misrepresent an affiliation with Orba, Circle, Arc, another project, person, or agent.</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">11. Enforcement and Service Changes</h2>
      <p>We may refuse, restrict, or suspend access to off-chain services; revoke API keys or platform-agent privileges; filter content or tokens from Orba-controlled interfaces; and preserve records where reasonably necessary for security, legal compliance, or these Terms. We cannot promise to prevent direct interaction with public smart contracts or erase public blockchain data.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">12. Third-Party Services</h2>
      <p>Wallets, RPC providers, Arc, USDC, IPFS gateways, hosting providers, social networks, and other linked services are operated by third parties under their own terms. Orba does not control and is not responsible for their availability, security, content, or actions. Orba is independent and is not affiliated with or endorsed by Circle.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">13. Disclaimer of Warranties</h2>
      <p>To the maximum extent permitted by law, the Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, title, non-infringement, uninterrupted availability, accuracy, or security. No internal review, test result, or documentation is a warranty that the Service or contracts are free of defects.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">14. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Orba and its contributors will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, opportunities, tokens, data, goodwill, or access, arising from the Service. Aggregate liability for all claims will not exceed the greater of the fees you paid to Orba during the 12 months before the event giving rise to the claim or USD 100.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">15. Indemnification</h2>
      <p>To the extent permitted by law, you will indemnify and hold harmless Orba and its contributors from claims, losses, liabilities, and reasonable legal expenses arising from your use of the Service, content, token, agent, violation of these Terms, or infringement of another person&apos;s rights.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">16. Governing Law and Disputes</h2>
      <p>These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws principles. Disputes arising from these Terms or the Service will be resolved through binding individual arbitration administered in Delaware, except that either party may seek injunctive relief in a court of competent jurisdiction to protect intellectual property or confidential information. You waive any right to participate in a class or representative action. This provision must be reviewed by counsel before the Terms take effect.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">17. General Terms</h2>
      <p>We are not responsible for delays or failures caused by events beyond our reasonable control. If a provision is unenforceable, the remainder will continue in effect. Failure to enforce a provision is not a waiver. These Terms, the Privacy Policy, Fees page, Tokenized Agent Disclaimer, and referenced policies form the agreement concerning the Service.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">18. Changes and Contact</h2>
      <p>We may revise the final Terms prospectively. Material revisions will be identified by an updated effective date or other notice where required. Legal questions may be sent to <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">legal@orba.fun</a>.</p>
    </LegalPage>
  );
}
