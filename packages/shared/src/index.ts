// Arc chain configuration — confirmed from docs, see DECISION_LOG.md
// Mainnet went public on 2026-09-16: all 4 providers below are open,
// no API key required (live-tested: eth_chainId → 0x13b2 on each).
export const ARC_MAINNET = {
  chainId: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.mainnet.arc.io",
        "https://rpc.drpc.mainnet.arc.io",
        "https://rpc.quicknode.mainnet.arc.io",
        "https://rpc.blockdaemon.mainnet.arc.io",
      ],
    },
    public: {
      http: [
        "https://rpc.mainnet.arc.io",
        "https://rpc.drpc.mainnet.arc.io",
        "https://rpc.quicknode.mainnet.arc.io",
        "https://rpc.blockdaemon.mainnet.arc.io",
      ],
    },
  },
  webSocketUrls: {
    default: { webSocket: ["wss://rpc.blockdaemon.mainnet.arc.io/websocket"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://arc-scan.org" },
  },
  testnet: false,
} as const;

export const ARC_TESTNET = {
  chainId: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
    public: { http: ["https://rpc.testnet.arc.io"] },
  },
  webSocketUrls: {
    default: { webSocket: ["wss://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
} as const;

// Contract addresses on Arc Mainnet (chain 5042).
// ⚠️ PLACEHOLDERS — the protocol contracts are NOT yet deployed to mainnet.
// Run contracts/script/DeployArcFun.s.sol against a mainnet RPC with a funded
// deployer wallet, then fill in the resulting addresses here and in .env.
export const ARC_MAINNET_CONTRACTS = {
  USDC_ERC20: "0x3600000000000000000000000000000000000000", // 6 decimals (Arc system contract — same address as testnet)
  USDC_NATIVE_EMITTER: "0xfffffffffffffffffffffffffffffffffffffffe", // 18 decimals (EIP-7708)
  // Deployed 2026-09-16 via DeployArcFun.s.sol (block ~21,125,xxx, txs on arc-scan.org).
  // Owned by deployer EOA 0x74E9...f337 (no Safe/timelock on mainnet yet).
  AMM_FACTORY: "0x7B43cEDAA3e96c98D6f8c981d9d8BF4bFB443A7c",
  TOKEN_FACTORY: "0x8e5710fc5a3f2aA69104AC1b57E6916F7634701B",
  TREASURY: "0xD81C2CDa790231a8e701911175519d3521F1d51c",
  MIGRATOR: "0xd5F18F71FdFB6eB8fC49b32b2B264aC162F31525",
} as const;

// Contract addresses on Arc Testnet
export const ARC_CONTRACTS = {
  USDC_ERC20: "0x3600000000000000000000000000000000000000", // 6 decimals
  USDC_NATIVE_EMITTER: "0xfffffffffffffffffffffffffffffffffffffffe", // 18 decimals (EIP-7708)
  BLOCKLISTED_TEST_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  // Filled during Phase 1 (redeployed with SafeUSDC fix, block 52509682):
  AMM_FACTORY: "0x4058646F179a4f5dF430E8e125b8F30fF3489BF9",
  TOKEN_FACTORY: "0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b",
  TREASURY: "0x2cAc61423fe5d7e74e5f3504901478F52a71156D",
  MIGRATOR: "0x34d4eC02a916164F178885B7ed05127D40847212",
} as const;

// USDC decimal model — critical: native and ERC-20 are the same asset
export const USDC_DECIMALS = {
  NATIVE: 18,
  ERC20: 6,
} as const;

// Conversion: 1 ERC-20 unit (6 dec) = 10^12 native units (18 dec)
export const ERC20_TO_NATIVE_FACTOR = 10n ** 12n;
export const NATIVE_TO_ERC20_FACTOR = 10n ** 12n;

// EIP-7708 Transfer event signature (same for both emitters)
export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Token status enum (matches DB schema)
export enum TokenStatus {
  ACTIVE = "active",
  GRADUATED = "graduated",
  PAUSED = "paused",
}

// Trade type enum
export enum TradeType {
  BUY = "buy",
  SELL = "sell",
}

// WebSocket event types
export enum WsEvent {
  NEW_TOKEN = "NEW_TOKEN",
  NEW_BUY = "NEW_BUY",
  NEW_SELL = "NEW_SELL",
  TOKEN_GRADUATED = "TOKEN_GRADUATED",
}
