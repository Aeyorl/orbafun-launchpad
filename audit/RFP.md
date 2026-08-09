# Request for proposal: Orba launchpad security review

Orba is a Solidity memecoin launchpad for Arc with USDC-denominated bonding
curves, automatic graduation to a purpose-built constant-product AMM, burned LP
tokens and timelocked protocol administration.

We request:

1. A full manual smart-contract audit of the files in `audit/SCOPE.md`.
2. Economic/invariant review of curve and AMM math.
3. Arc-specific integration review covering 6-decimal ERC-20 and 18-decimal
   native representations of the same USDC asset.
4. A remediation review and final public report.
5. Mainnet deployment bytecode/configuration verification.
6. An optional separate assessment of the NestJS API, Next.js frontend,
   PostgreSQL/Redis controls, cloud deployment and operational key management.

Please quote team size, earliest start, duration, price, retest terms, report
publication policy and relevant bonding-curve/AMM/launchpad work. The engagement
must pin the audited Git commit and compiler settings.

Candidate providers to request proposals from:

- OpenZeppelin Security: https://www.openzeppelin.com/security-audits
- Trail of Bits: https://www.trailofbits.com/services/software-assurance
- Zellic: https://www.zellic.io/audits
- Spearbit: https://spearbit.com/

No provider is selected by this document. Commercial selection should consider
scope quality, named reviewers, methodology, availability and fix-review terms,
not marketing claims alone.
