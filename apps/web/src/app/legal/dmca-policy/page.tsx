import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'DMCA Policy — Orba',
  description:
    'Draft process for reporting copyright infringement involving content displayed through Orba.',
  alternates: { canonical: '/legal/dmca-policy' },
  robots: { index: false, follow: false },
};

export default function DmcaPolicyPage() {
  return (
    <LegalPage title="DMCA Policy" draft>
      <p>Orba respects copyright and expects users and agent operators to do the same. This draft describes the intended process for notices under the U.S. Digital Millennium Copyright Act (&quot;DMCA&quot;). It is not yet effective and does not represent that Orba currently has a registered designated agent.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">1. Registration Status</h2>
      <p>Before this policy is published as effective, Orba must designate and register an agent with the U.S. Copyright Office and publish the same agent name, service-provider identity, mailing address, telephone number, and email address shown in that registration. Until those steps are complete, <a href="mailto:legal@orba.fun" className="text-accent-blue hover:underline">legal@orba.fun</a> may receive general copyright questions but is not presented by this draft as a registered DMCA agent.</p>
      <p>Information about the federal designation process is available from the <a href="https://www.copyright.gov/dmca-directory/" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">U.S. Copyright Office DMCA Designated Agent Directory</a>.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">2. Copyright Notice Requirements</h2>
      <p>After the agent is registered, a copyright owner or authorized representative may send a written notice containing:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>a physical or electronic signature of an authorized person;</li>
        <li>identification of the copyrighted work, or a representative list if multiple works are involved;</li>
        <li>identification and location of the material claimed to infringe, including the relevant Orba URL, token address, message, image, or IPFS reference;</li>
        <li>the reporting party&apos;s name, mailing address, telephone number, and email address;</li>
        <li>a statement of good-faith belief that the disputed use is not authorized by the owner, its agent, or the law; and</li>
        <li>a statement that the notice is accurate and, under penalty of perjury, the sender is authorized to act for the owner.</li>
      </ul>
      <p>Notices should address specific copyrighted material. A token&apos;s price, market activity, or use of a similar idea is not by itself a copyright claim.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">3. Orba&apos;s Response</h2>
      <p>When Orba receives a substantially complete notice, it may request missing information and may disable or remove access to the identified material from Orba-controlled interfaces, notify the affected uploader or operator, preserve relevant records, and take other steps required by law. A response is not an admission that infringement occurred.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">4. Counter-Notification</h2>
      <p>A person whose material was disabled as a result of a DMCA notice may submit a written counter-notification containing:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>a physical or electronic signature;</li>
        <li>identification of the material and its location before access was disabled;</li>
        <li>a statement under penalty of perjury that the person has a good-faith belief the action resulted from mistake or misidentification;</li>
        <li>the person&apos;s name, address, telephone number, and email address; and</li>
        <li>the jurisdiction and service-of-process consent required by 17 U.S.C. § 512(g).</li>
      </ul>
      <p>Where the DMCA applies, Orba may restore access after forwarding a valid counter-notification and waiting the statutory period, unless the original claimant reports that it has filed a qualifying court action.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">5. Misrepresentations</h2>
      <p>Knowingly making a material misrepresentation in a notice or counter-notification may create liability under 17 U.S.C. § 512(f). Consider obtaining legal advice before submitting a notice if you are uncertain about ownership, authorization, licensing, or fair use.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">6. Repeat Infringers</h2>
      <p>Where appropriate and within Orba&apos;s control, Orba may terminate or restrict repeat infringers by revoking API credentials or platform-agent access, removing or filtering content from Orba-controlled interfaces and APIs, or restricting other off-chain features. The final repeat-infringer process must be approved before this policy takes effect.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">7. Blockchain and IPFS Limits</h2>
      <p>Orba can act on infrastructure it controls. It may hide a token or message, remove off-chain metadata from its API, stop serving an image through an Orba-controlled gateway, or ask a pinning provider to unpin content. Those actions do not erase a token&apos;s on-chain name, symbol, address, transaction history, or copies maintained by other nodes, gateways, indexers, users, or services. Orba cannot reverse a token launch or confiscate tokens solely through a content complaint.</p>

      <h2 className="text-lg font-semibold text-text-primary mt-6 mb-2">8. Other Intellectual Property Claims</h2>
      <p>This policy concerns copyright. Trademark, impersonation, and brand-confusion reports should follow the <a href="/legal/trademark-guidelines" className="text-accent-blue hover:underline">Trademark Guidelines</a>.</p>
    </LegalPage>
  );
}
