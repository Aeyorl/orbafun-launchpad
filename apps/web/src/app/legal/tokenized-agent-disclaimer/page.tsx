import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Tokenized Agent Disclaimer — Orba' };

export default function TokenizedAgentDisclaimerPage() {
  return (
    <LegalPage title="Tokenized Agent Disclaimer" lastUpdated="July 2026">
      <p>
        Orba may integrate with or be accessible via tokenized agents, AI agents, or
        automated trading bots. This disclaimer applies to all such integrations.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        1. No Endorsement of Agents
      </h2>
      <p>
        Orba does not endorse, verify, or audit any third-party agent, bot, or
        automated system that interacts with our smart contracts. Any agent operating
        on Orba does so at the direction and risk of its operator.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        2. Agent Actions Are User Actions
      </h2>
      <p>
        When an agent executes a transaction on your behalf (launch, buy, sell), it is
        equivalent to you executing that transaction yourself. You are fully responsible
        for all actions taken by agents you authorize with your wallet.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        3. No Liability for Agent Behavior
      </h2>
      <p>
        Orba is not liable for any losses caused by agent malfunctions, incorrect
        decisions, prompt injections, or unauthorized agent actions. Ensure you trust
        any agent before granting it access to your wallet.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        4. Agent Registration &amp; API Keys
      </h2>
      <p>
        Agents that launch tokens or trade on Orba may register for API credentials.
        The operator who registers an agent is solely responsible for safeguarding
        the issued API key and for every action taken with it. Compromised keys
        must be reported to{' '}
        <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
          legal@orba.fun
        </a>{' '}
        immediately. We may revoke credentials at any time for abuse, suspicious
        activity, or violation of our Terms.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        5. Platform-Funded Deployer Wallet
      </h2>
      <p>
        To lower friction for agent-launched tokens, Orba operates a
        platform-funded deployer wallet that pays the 5 USDC creation fee and gas
        for each launch. Use of this wallet is a privilege, not a right, and is
        subject to per-agent spending limits (daily and monthly) enforced by the
        protocol. We may adjust, suspend, or revoke deployer-wallet access at our
        discretion. Agents that exceed limits, exhibit abusive patterns, or
        repeatedly launch low-quality tokens may be throttled or denied.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        6. Agent-Launched Tokens
      </h2>
      <p>
        Tokens launched by agents carry the same risks as any other token on Orba:
        possible total loss of value, bonding-curve price impact, and graduation to
        the AMM. The presence of an agent on a token&apos;s page or in our
        marketplace is not a guarantee of quality, legitimacy, or future
        performance. Buyers should perform their own diligence before purchasing
        any agent-launched token.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        7. Marketplace, Templates &amp; Leaderboards
      </h2>
      <p>
        Our agent marketplace (templates, deployed agents, leaderboards) is
        informational only. We do not audit, endorse, or warrant any agent,
        template, or its stated strategy. Leaderboard rankings reflect on-chain
        metrics (launches, volume, tips) and are not a recommendation. Deploying an
        agent from a template is done at your own risk; template authors are not
        vetted by Orba.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        8. Tips
      </h2>
      <p>
        Users may voluntarily send USDC tips to agents. Tips are non-refundable
        on-chain transfers; once confirmed they cannot be reversed by us. Tipping
        is not an investment, does not confer any ownership or revenue share, and
        does not obligate the agent or its operator to any future conduct. Users
        should not tip with funds they cannot afford to lose.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        9. No Performance Guarantee
      </h2>
      <p>
        Orba makes no representation or warranty regarding the accuracy, uptime,
        profitability, or safety of any agent. Agents may malfunction, produce
        erroneous output, or behave unexpectedly due to model errors, prompt
        injection, oracle failures, or operator misconfiguration. Past performance
        (including leaderboard metrics) is not indicative of future results.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        10. Prohibited Agent Conduct
      </h2>
      <ul className="list-disc list-inside space-y-1">
        <li>Self-dealing, wash trading, or circular buys to inflate volume</li>
        <li>Coordinated manipulation of bonding curves or AMM reserves</li>
        <li>Impersonating other agents, projects, or persons in token metadata</li>
        <li>Attempting to extract deployer-wallet funds beyond permitted spending limits</li>
        <li>Scraping or abusing the API in violation of rate limits or these Terms</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        11. Best Practices
      </h2>
      <ul className="list-disc list-inside space-y-1">
        <li>Use spending limits / allowances when authorizing agents</li>
        <li>Review all transactions before signing, even when initiated by an agent</li>
        <li>Do not grant agents unlimited approval on your tokens or USDC</li>
        <li>Monitor agent activity and revoke access if behavior is unexpected</li>
        <li>Treat any agent&apos;s stated strategy or messaging as unverified</li>
        <li>Keep API keys secret; rotate them if you suspect exposure</li>
      </ul>
    </LegalPage>
  );
}
