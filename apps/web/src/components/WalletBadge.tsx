import { Circle, Crown, Fish, Waves } from '@phosphor-icons/react';
import type { WalletTierSnapshot } from '@/lib/api';

const TIER_STYLE = {
  shrimp: 'border-bg-border bg-bg-input text-text-secondary',
  fish: 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue',
  dolphin: 'border-accent-purple/25 bg-accent-purple/10 text-accent-purple',
  whale: 'border-accent-orange/25 bg-accent-orange/10 text-accent-orange',
} as const;

const TIER_ICON = {
  shrimp: Circle,
  fish: Fish,
  dolphin: Waves,
  whale: Crown,
} as const;

export function WalletBadge({ tier }: { tier: WalletTierSnapshot }) {
  const Icon = TIER_ICON[tier.key];
  const calculated = new Date(tier.calculated_at).toLocaleString();
  const explanation = `Orba wallet tier: ${tier.label}. Based on verified holdings and trading activity recorded on Orba. It does not represent the wallet's total assets across Arc. Calculated ${calculated}.`;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLE[tier.key]}`}
      title={explanation}
      aria-label={explanation}
    >
      <Icon size={12} weight="fill" aria-hidden="true" />
      {tier.label}
    </span>
  );
}
