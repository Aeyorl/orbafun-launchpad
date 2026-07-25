import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Privacy Policy — Orba' };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 2026">
      <p>
        Orba (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a decentralized
        application deployed on the Arc blockchain. This privacy policy explains how we
        handle information when you use our website and services.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        1. Information We Do Not Collect
      </h2>
      <p>
        Orba is a non-custodial, decentralized application. We do not collect, store,
        or process personal information such as your name, email address, or physical
        address. You interact with our services through a self-custody wallet (e.g.,
        MetaMask, Rabby, or other EVM-compatible wallets).
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        2. On-Chain Data
      </h2>
      <p>
        All transactions you make on Orba are recorded on the Arc blockchain, which is
        a public, permissionless ledger. Your wallet address, transaction amounts, token
        launches, and trades are visible to anyone. This data is not controlled by
        Orba and cannot be deleted by us.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        3. Local Storage &amp; Cookies
      </h2>
      <p>
        We use browser local storage to remember your preferences (e.g., slippage
        settings, theme). We do not use tracking cookies or third-party analytics that
        identify you across sites.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        4. RPC Requests
      </h2>
      <p>
        When you read blockchain data (balances, quotes, transaction receipts), your
        browser sends JSON-RPC requests to Arc RPC providers. These providers may log
        IP addresses and request metadata per their own privacy policies. We route
        reads through our own proxy first to minimize direct exposure.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        5. Third-Party Links
      </h2>
      <p>
        Our site may link to third-party services (Circle faucet, Arc docs, Telegram).
        We are not responsible for the privacy practices of these external sites.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        6. Children&apos;s Privacy
      </h2>
      <p>
        Orba is not directed to individuals under 18. Do not use our services if you
        are under 18.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        7. Data Retention
      </h2>
      <p>
        We do not maintain user accounts or profiles. Off-chain data we may process
        (such as server logs for the RPC read proxy, indexer event records, and
        referral attributions) is retained only as long as necessary to operate the
        Service. On-chain data (wallet addresses, transaction history, token
        metadata) is permanent and cannot be erased by us or anyone else.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        8. Third-Party Processors
      </h2>
      <p>
        In the course of operating the Service, your requests may be processed by:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>
          Arc RPC providers (Circle, dRPC, QuickNode, Blockdaemon) — to read
          blockchain state and broadcast signed transactions
        </li>
        <li>
          IPFS gateways — to retrieve token images and metadata referenced by
          token launchers
        </li>
        <li>
          Your wallet provider (e.g., MetaMask, Rabby) — which signs and submits
          transactions on your behalf
        </li>
      </ul>
      <p>
        Each of these third parties has its own privacy practices governing IP
        addresses, request metadata, and device identifiers. We rotate across
        multiple RPC providers to reduce concentration of any one party&apos;s logs.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        9. Security
      </h2>
      <p>
        We use industry-standard measures to protect the off-chain components of the
        Service, including TLS in transit, server-side rate limiting, and rotation
        of provider credentials. However, no system is perfectly secure. You are
        responsible for safeguarding your wallet&apos;s seed phrase and private keys
        — loss or compromise of these cannot be reversed by us.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        10. Your Privacy Rights (GDPR &amp; CCPA)
      </h2>
      <p>
        Depending on your jurisdiction (e.g., the EU/EEA under the GDPR, or
        California under the CCPA/CPRA), you may have rights regarding personal data
        we hold about you, including the right to access, correct, or delete it,
        and the right to object to or restrict certain processing.
      </p>
      <p>
        Because Orba is non-custodial and does not collect identity-level personal
        data, these rights primarily apply to the limited off-chain data described
        above (server logs, indexer records, referral attributions tied to a wallet
        address). To exercise these rights, contact us at{' '}
        <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
          legal@orba.fun
        </a>{' '}
        from the email associated with your inquiry and include the wallet address
        at issue.
      </p>
      <p>
        Note: We cannot delete or alter on-chain data. Any &quot;deletion&quot; of
        on-chain activity is impossible by design — the Arc blockchain is an
        immutable public ledger.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        11. International Data Transfers
      </h2>
      <p>
        The Service and its third-party processors may be located in jurisdictions
        other than your own. By using the Service, you acknowledge that your
        wallet address, IP address, and request metadata may be processed in the
        United States and other countries with differing data protection laws.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        12. Do Not Track Signals
      </h2>
      <p>
        Orba does not respond to browser &quot;Do Not Track&quot; signals because we
        do not engage in cross-site tracking. We do not use advertising networks,
        retargeting pixels, or third-party analytics that profile you across the
        web.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        13. Changes to This Policy
      </h2>
      <p>
        We may update this policy from time to time. Changes will be posted on this
        page with an updated revision date. Material changes will be reflected in
        the &quot;Last updated&quot; date above.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        14. Contact
      </h2>
      <p>
        For privacy-related questions or to exercise your data rights, contact us at{' '}
        <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
          legal@orba.fun
        </a>{' '}
        or via{' '}
        <a
          href="https://x.com/orbafun"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-blue hover:underline"
        >
          @orbafun
        </a>
        .
      </p>
    </LegalPage>
  );
}
