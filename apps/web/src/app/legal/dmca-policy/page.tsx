import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'DMCA Policy — Orba' };

export default function DmcaPolicyPage() {
  return (
    <LegalPage title="DMCA Policy" lastUpdated="July 2026">
      <p>
        Orba respects the intellectual property rights of others and expects users of
        our Service to do the same. This policy describes how to report copyright
        infringement under the Digital Millennium Copyright Act (DMCA).
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        1. Designated Copyright Agent
      </h2>
      <p>
        Notices under the DMCA should be sent to our designated copyright agent:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Email:{' '}
          <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">
            legal@orba.fun
          </a>
        </li>
        <li>Subject line: &quot;DMCA Takedown Notice&quot;</li>
        <li>Include the token contract address or URL of the allegedly infringing content</li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        2. Filing a DMCA Notice
      </h2>
      <p>
        If you believe that content on Orba infringes your copyright, send a written
        notice to our designated copyright agent including:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Your physical or electronic signature</li>
        <li>Identification of the copyrighted work you claim has been infringed</li>
        <li>
          Identification of the material on Orba that you claim is infringing
          (include the token address or URL)
        </li>
        <li>Your address, telephone number, and email address</li>
        <li>
          A statement that you have a good-faith belief that the use is not authorized
          by the copyright owner
        </li>
        <li>
          A statement that the information in the notice is accurate and, under penalty
          of perjury, that you are authorized to act on behalf of the copyright owner
        </li>
      </ul>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        3. Counter-Notification
      </h2>
      <p>
        If you believe your content was removed or disabled in error, you may file a
        counter-notification with our designated agent including:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Your physical or electronic signature</li>
        <li>Identification of the material that was removed and its location before removal</li>
        <li>
          A statement under penalty of perjury that you have a good-faith belief the
          material was removed or disabled as a result of mistake or
          misidentification
        </li>
        <li>Your name, address, telephone number, and email address</li>
        <li>
          A statement that you consent to the jurisdiction of the federal district
          court for the judicial district in which you reside (or, if outside the
          U.S., any U.S. district court where Orba may be found) and that you will
          accept service of process from the person who filed the original notice
        </li>
      </ul>
      <p>
        Unless we receive notice from the original complainant that they have filed a
        court action to restrain the alleged infringement, we will restore the
        removed material (or cease disabling access to it) within 10 to 14 business
        days of receiving a valid counter-notification.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        4. Misrepresentation Penalties
      </h2>
      <p>
        Under 17 U.S.C. § 512(f), any person who knowingly materially misrepresents
        that material or activity is infringing — or that material was removed or
        disabled by mistake or misidentification — may be subject to liability for
        damages, including costs and attorney&apos;s fees incurred by the alleged
        infringer. Do not file a notice or counter-notification unless you are
        confident in your claim.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        5. Repeat Infringers
      </h2>
      <p>
        In accordance with 17 U.S.C. § 512(i), we will, in appropriate
        circumstances, terminate access for users and agents who are determined to
        be repeat infringers. This includes revoking API credentials, blocking
        display of tokens launched by repeat infringers, and disabling the
        deployer-wallet privilege for affected agents.
      </p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">
        6. Limitations of a Decentralized Platform
      </h2>
      <p>
        Orba is a decentralized application. Token metadata (names, symbols, images)
        is stored on-chain or on IPFS and cannot be unilaterally removed by us or
        anyone else — the Arc blockchain is an immutable public ledger. Our ability
        to respond to a valid DMCA notice is therefore limited to off-chain
        measures, including:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>Filtering or hiding the offending token from our frontend and API listings</li>
        <li>Revoking agent API credentials and deployer-wallet access for the responsible launcher</li>
        <li>Flagging the token in our indexer so downstream integrations can choose to filter it</li>
      </ul>
      <p>
        We cannot delete the underlying on-chain metadata, recall tokens from
        holders, or reverse the launch. Users interacting directly with the smart
        contracts (bypassing our frontend) will still be able to view and trade the
        token regardless of any frontend filtering we apply.
      </p>
    </LegalPage>
  );
}
