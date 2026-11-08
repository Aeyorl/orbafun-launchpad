"""Generate the Orba 60-day buy-only simulation (requires matplotlib)."""

import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

USDC = 10**6
TOKEN = 10**18
BPS = 10_000
SUPPLY = 1_000_000_000 * TOKEN
RESERVED = 120_000_000 * TOKEN
VIRTUAL_USDC = 5_866_666_700
VIRTUAL_TOKENS = 1_466_666_667 * TOKEN
PRESETS = {
    "Spark": (10, 50, 150),
    "Momentum": (25, 100, 500),
    "Marathon": (100, 500, 2500),
}
SCENARIOS = {
    "Quiet": [USDC // 2] * 60,
    "Steady": [3 * USDC] * 60,
    "Bursty": [30 * USDC if day % 10 == 1 else 0 for day in range(1, 61)],
    "High": [50 * USDC] * 60,
}


def simulate(buys, thresholds):
    reserve, volume, pool, unlocked, sold, step = RESERVED, 0, 0, 0, 0, 0
    yield 0, volume, SUPPLY, reserve, pool, unlocked, step
    for day, gross in enumerate(buys, 1):
        fee = gross * 100 // BPS
        net = gross - fee
        if net:
            sold += max(
                0, VIRTUAL_TOKENS - sold
                - VIRTUAL_USDC * VIRTUAL_TOKENS // (VIRTUAL_USDC + volume + net)
            )
        volume += net
        pool += (fee - fee // 2) // 2
        market_cap = (VIRTUAL_USDC + volume) * SUPPLY // (VIRTUAL_TOKENS - sold)
        if sold >= SUPPLY - RESERVED or market_cap >= 30_000 * USDC:
            raise ValueError("Scenario reaches curve limits; this model assumes uncapped buys.")
        while step < len(thresholds) and volume >= thresholds[step] * USDC:
            available = pool - unlocked
            reserve -= reserve if step == 2 else reserve * (1000, 2500)[step] // BPS
            unlocked += available if step == 2 else available * (2000, 3000)[step] // BPS
            step += 1
        if step == len(thresholds):
            unlocked = pool
        yield day, volume, SUPPLY - RESERVED + reserve, reserve, pool, unlocked, step


def main():
    output = Path(__file__).resolve().parents[1] / "docs"
    matplotlib.rcParams["svg.hashsalt"] = "orba-60-day"
    fig, axes = plt.subplots(2, 3, figsize=(13, 6), sharex=True)
    fig.suptitle("Orba · 60 days of simulated NEAR testnet trading")
    with (output / "simulation-60-day.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow([
            "preset", "scenario", "day", "net_volume_micro_usdc", "supply_base_units",
            "reserve_base_units", "treasury_pool_micro_usdc",
            "unlocked_micro_usdc", "milestones_completed",
        ])
        for column, (preset, thresholds) in enumerate(PRESETS.items()):
            for scenario, buys in SCENARIOS.items():
                rows = list(simulate(buys, thresholds))
                writer.writerows((preset, scenario, *row) for row in rows)
                days, _, supply, _, _, unlock, _ = zip(*rows)
                axes[0, column].step(days, [x / (TOKEN * 10**6) for x in supply],
                                     where="post", label=scenario)
                axes[1, column].step(days, [x / USDC for x in unlock], where="post")
            axes[0, column].set_title(preset)
            axes[0, column].set_ylim(875, 1005)
            axes[1, column].set_xlabel("Day")
            for ax in axes[:, column]:
                ax.grid(alpha=0.22)
    axes[0, 0].set_ylabel("Total supply (million tokens)")
    axes[1, 0].set_ylabel("Cumulative unlock (USDC)")
    axes[0, 0].legend(loc="lower left", fontsize=8)
    fig.tight_layout()
    fig.savefig(output / "simulation-60-day.svg", metadata={"Date": None})


if __name__ == "__main__":
    main()
