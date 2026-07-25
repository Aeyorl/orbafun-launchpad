import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Terms & Conditions — Orba' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" lastUpdated="July 2026">
      <p>
        By accessing or using Orba (&quot;the Service&quot;), you agree to be bound by
        these Terms &amp; Conditions. If you do not agree, do not use the Service.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        1. Nature of the Service
      </h2>
      <p>
        Orba is a decentralized, non-custodial application deployed on the Arc
        blockchain. It allows users to launch, buy, and sell memecoins against bonding
        curves. We do not custody your funds, tokens, or private keys. All transactions
        are executed by smart contracts on the Arc blockchain and are irreversible.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        2. Eligibility
      </h2>
      <p>
        You must be at least 18 years old and legally permitted to use the Service in
        your jurisdiction. You are responsible for complying with all applicable laws,
        including tax obligations arising from your use of the Service.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        3. Risks
      </h2>
      <p>
        Using decentralized financial applications involves significant risk, including
        but not limited to:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Total loss of funds spent on tokens that lose value</li>
        <li>Smart contract bugs or exploits that may result in loss of funds</li>
        <li>Network congestion or RPC failures preventing timely transactions</li>
        <li>Regulatory changes that may affect the legality of the Service</li>
        <li>Impermanent loss or slippage during trades</li>
      </ul>
      <p>
        You acknowledge that you are solely responsible for any losses and that
        Orba is not liable for any damages.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        4. No Investment Advice
      </h2>
      <p>
        Orba does not provide investment advice. Tokens launched on the platform are
        memecoins with no intrinsic value or expectation of profit. Do not spend more
        than you can afford to lose.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        5. Fees
      </h2>
      <p>
        A 1% fee is applied to each trade on the bonding curve, split equally: 0.5%
        to the token creator and 0.5% to the protocol. A 5 USDC creation fee is
        charged for launching new tokens. After a token graduates to the AMM, swaps
        are 0% fee. Referral rewards of 0.1% of attributed trade volume (10 basis
        points) are paid to referrers out of the protocol&apos;s share. See our{' '}
        <a href="/fees" className="text-accent-blue hover:underline">Fees page</a> for
        full details. Fee parameters may be updated by the protocol; changes do not
        retroactively affect completed transactions.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        6. Wallet &amp; Key Responsibility
      </h2>
      <p>
        You are solely responsible for the security of your wallet, private keys,
        seed phrases, and any API keys issued to you. We cannot recover lost private
        keys or reverse transactions authorized by your wallet. Any action taken
        with your wallet — including actions initiated by an agent you have
        authorized — is treated as your action.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        7. User-Generated Content &amp; Token Metadata
      </h2>
      <p>
        Token names, symbols, descriptions, and images submitted by launchers are
        user-generated content. By launching a token, you represent and warrant
        that:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>You own or have the right to use all submitted metadata and imagery</li>
        <li>The content does not infringe any third party&apos;s IP, trademark, or right of publicity</li>
        <li>The content is not deceptive, defamatory, or unlawful</li>
      </ul>
      <p>
        Once a token is launched, its metadata is recorded on-chain and/or on IPFS
        and cannot be modified or removed by us. You retain ownership of your
        submitted content and grant Orba a worldwide, non-exclusive, royalty-free
        license to display it for the purpose of operating the Service.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        8. Prohibited Conduct
      </h2>
      <p>You agree not to:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Launch tokens that infringe on trademarks, copyrights, or rights of publicity</li>
        <li>Use the Service for money laundering, terrorist financing, or other illicit activities</li>
        <li>Attempt to manipulate bonding curves, AMM reserves, or exploit smart contracts</li>
        <li>Use bots or automated systems to gain unfair advantages over other users</li>
        <li>Submit misleading token metadata, including impersonation of other projects or persons</li>
        <li>Evade spending limits, sanctions screening, or other platform controls</li>
        <li>Access the Service from a jurisdiction where it is unlawful to do so</li>
        <li>Reverse engineer, scrape, or overload the Service&apos;s APIs or RPC proxy</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        9. API &amp; Agent Access
      </h2>
      <p>
        If you register an agent or receive API credentials, you are responsible for
        keeping them confidential and for all activity conducted with them. API
        keys may be revoked by us for abuse, violation of these Terms, or
        operational reasons. Agent-launched tokens and agent trades are subject to
        the additional terms in our{' '}
        <a
          href="/legal/tokenized-agent-disclaimer"
          className="text-accent-blue hover:underline"
        >
          Tokenized Agent Disclaimer
        </a>
        .
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        10. Indemnification
      </h2>
      <p>
        You agree to indemnify and hold harmless Orba and its contributors from any
        claims, damages, losses, or expenses (including reasonable legal fees)
        arising out of your use of the Service, your violation of these Terms, or
        your infringement of any third party&apos;s rights, including claims
        arising from tokens you launch or content you submit.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        11. Disclaimer of Warranties
      </h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without warranties of any kind, express or implied, including
        merchantability, fitness for a particular purpose, or non-infringement. We
        do not guarantee that the Service will be available, error-free, secure, or
        that smart contracts are free of bugs or exploits. You assume all risk of
        use.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        12. Limitation of Liability
      </h2>
      <p>
        To the maximum extent permitted by law, Orba and its contributors shall not
        be liable for any indirect, incidental, special, consequential, or
        exemplary damages (including loss of profits, tokens, or data) arising from
        your use of, or inability to use, the Service, even if advised of the
        possibility of such damages. Our aggregate liability for all claims is
        limited to the greater of (a) the fees you paid to us in the 12 months
        preceding the claim, or (b) USD 100.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        13. Termination
      </h2>
      <p>
        You may stop using the Service at any time. We may suspend or restrict
        access to the off-chain components of the Service (website, API, indexer)
        at any time for violations of these Terms, legal compliance, or operational
        reasons. We cannot prevent you from interacting with the on-chain smart
        contracts directly.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        14. Governing Law &amp; Dispute Resolution
      </h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without
        regard to conflict-of-laws principles. Any dispute arising out of or
        relating to these Terms or the Service shall be resolved by binding
        arbitration administered in Delaware, except that either party may seek
        injunctive relief in a court of competent jurisdiction to protect
        intellectual property or confidential information. You waive any right to
        participate in a class action.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        15. Force Majeure
      </h2>
      <p>
        We are not liable for any failure or delay in performance caused by events
        beyond our reasonable control, including blockchain network outages, RPC
        provider failures, regulatory actions, acts of God, or cyberattacks.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        16. Severability &amp; Entire Agreement
      </h2>
      <p>
        If any provision of these Terms is found unenforceable, the remaining
        provisions remain in full effect. These Terms, together with the documents
        referenced herein (Privacy Policy, Fees page, Tokenized Agent Disclaimer),
        constitute the entire agreement between you and Orba regarding the Service.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        17. Changes to These Terms
      </h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service
        after changes constitutes acceptance of the new Terms. Material changes will
        be reflected in the &quot;Last updated&quot; date above.
      </p>
    </LegalPage>
  );
}
