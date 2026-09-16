/**
 * Draft public facts shared by the Docs and Fees pages.
 *
 * These are the target parameters in the current mainnet release candidate.
 * They are not publication-ready until they have been checked against the
 * final deployed contracts and production configuration.
 */
export const PUBLIC_PROTOCOL_FACTS = {
  publicationStatus: 'draft',
  publicationLabel: 'Mainnet draft — not yet effective',
  networkName: 'Arc',
  tokenSupply: 1_000_000_000,
  creationFeeUsdc: 0,
  bondingCurveTradeFeeBps: 100,
  creatorShareOfTradeFeeBps: 5_000,
  protocolShareOfTradeFeeBps: 5_000,
  referralAccrualBps: 10,
  ammSwapFeeBps: 30,
  graduationMarketCapUsdc: 30_000,
  liquiditySeedUsdc: 8_500,
  transferPolicy: 'uncapped',
  transferCooldownBlocks: 30,
} as const;

export function formatBps(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

export function shareOfTradePercent(
  tradeFeeBps: number,
  shareBps: number,
): string {
  return formatBps((tradeFeeBps * shareBps) / 10_000);
}
