import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Orba',
  description:
    'Draft privacy policy explaining how Orba handles wallet, service, device, and public blockchain data.',
  alternates: { canonical: '/legal/privacy-policy' },
  robots: { index: false, follow: false },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" draft>
      <p>
        This draft explains how Orba (&quot;we&quot;, &quot;us&quot;, or
        &quot;our&quot;) handles information when you visit or use the Orba
        website, APIs, indexer, agent features, and related services
        (collectively, the &quot;Service&quot;). It is not yet effective and must
        be reviewed before Orba launches on mainnet.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">1. Information We Handle</h2>
      <p>Depending on how you use the Service, we may handle:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Wallet and blockchain data:</strong> wallet addresses, transactions, token launches, trades, balances, approvals, tips, and other activity recorded on Arc.</li>
        <li><strong>Authentication data:</strong> wallet-signature challenges, signatures, nonces, session tokens, and related security records.</li>
        <li><strong>Service records:</strong> profiles derived from wallet activity, favorites, messages, referral relationships and statistics, token positions, and leaderboard data.</li>
        <li><strong>Agent records:</strong> agent profiles, operator wallet addresses, hashed API-key records, templates, launches, trades, spend reservations, limits, tips, and operational status.</li>
        <li><strong>Submitted content:</strong> token descriptions, images, banners, websites, and social links. Images submitted through Orba may be sent to an IPFS pinning provider.</li>
        <li><strong>Technical data:</strong> IP address, request time, route, browser or device information, RPC requests, error and security logs, and rate-limit records generated when your device communicates with our infrastructure.</li>
      </ul>
      <p>We do not ask for your wallet seed phrase or private key. Never provide either one to Orba or to anyone claiming to represent Orba.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">2. Public Blockchain Data</h2>
      <p>Arc is a public blockchain. Wallet addresses and confirmed transactions are visible to anyone and may be copied, indexed, or analyzed by third parties. We do not control the blockchain and cannot correct, erase, or reverse confirmed on-chain activity. A wallet address may be personal data under some laws when it can be linked to a person.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">3. How We Use Information</h2>
      <p>We use information to:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>operate wallet authentication and requested product features;</li>
        <li>index and display token, market, profile, referral, and agent activity;</li>
        <li>process image uploads and display user-submitted token content;</li>
        <li>protect the Service, enforce limits, prevent abuse, and investigate incidents;</li>
        <li>maintain reliability, diagnose errors, and measure infrastructure health;</li>
        <li>comply with law and respond to valid legal requests; and</li>
        <li>establish, exercise, or defend legal claims.</li>
      </ul>
      <p>Where applicable, our legal bases may include providing the Service you request, our legitimate interests in operating and securing it, compliance with legal obligations, and consent where the law requires it.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">4. Browser Storage and Cookies</h2>
      <p>Orba uses local storage to remember theme and referral information, session storage to preserve an in-progress token launch, and a SameSite theme cookie. Wallet connectors may use their own storage to maintain a connection. These technologies support requested functionality; they are not used by Orba for cross-site behavioral advertising.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">5. How Information Is Shared</h2>
      <p>We disclose information only as needed to operate the Service, comply with law, protect users and infrastructure, or complete a business transition. Providers used for the mainnet Service may include:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Vercel for website hosting and delivery;</li>
        <li>Render for API hosting;</li>
        <li>Supabase for PostgreSQL data storage;</li>
        <li>Upstash for Redis caching, rate limits, and event delivery;</li>
        <li>Circle, dRPC, QuickNode, and Blockdaemon for Arc RPC access;</li>
        <li>Pinata and public IPFS gateways for token media;</li>
        <li>WalletConnect and the wallet provider selected by you; and</li>
        <li>professional advisers, authorities, or counterparties where reasonably necessary.</li>
      </ul>
      <p>This list must be checked against the production provider inventory before publication. Each independent provider may handle IP addresses, device data, wallet addresses, or request metadata under its own terms.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">6. Sale, Sharing, and Advertising</h2>
      <p>Orba does not sell personal information and does not use personal information for cross-context behavioral advertising. If those practices change, we will update this policy and provide any notices or choices required by law before the change takes effect.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">7. Retention</h2>
      <p>We retain off-chain information for as long as reasonably necessary for the purposes described above. Authentication challenges and transient cache data are short-lived. Security logs may be retained long enough to detect abuse and investigate incidents. Token, trade, referral, agent, message, and profile records may be retained while the Service operates and afterward where needed for security, dispute resolution, legal compliance, or reliable historical market records. Backups may persist for a limited recovery period. Production retention periods must be approved before this draft is published.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">8. Your Choices and Rights</h2>
      <p>Depending on where you live, you may have rights to know about, access, correct, delete, restrict, object to, or obtain a copy of personal data we control, and to appeal or complain to a regulator. These rights are subject to legal exceptions and do not allow Orba to alter public blockchain data.</p>
      <p>To make a request, email <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">legal@orba.fun</a>. We may ask for reasonable proof that you control the wallet address involved, such as a narrowly worded signature challenge. We will never ask for your seed phrase or private key.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">9. Security</h2>
      <p>We use technical and organizational measures intended to protect off-chain information, including encrypted transport, access controls, rate limiting, secret management, and monitoring. No system is completely secure. You remain responsible for protecting your wallet, device, recovery phrase, and any API credentials issued to you.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">10. International Transfers</h2>
      <p>Orba and its providers may process information in the United States and other countries whose privacy laws differ from those where you live. Where required, we will use an appropriate transfer mechanism or other safeguard.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">11. Children</h2>
      <p>The Service is not directed to anyone under 18, and people under 18 may not use it. Contact us if you believe a minor has provided off-chain personal data.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">12. External Services</h2>
      <p>The Service may link to wallets, block explorers, faucets, social networks, and other third-party services. Their privacy practices are governed by their own policies, not this policy.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">13. Changes and Contact</h2>
      <p>We may update this policy as the Service, providers, or law changes. The final policy will show its effective date. Questions and rights requests may be sent to <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">legal@orba.fun</a>.</p>
    </LegalPage>
  );
}
