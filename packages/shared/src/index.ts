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
  AMM_FACTORY: "", // TODO: deploy to mainnet
  TOKEN_FACTORY: "", // TODO: deploy to mainnet
  TREASURY: "", // TODO: deploy to mainnet
  MIGRATOR: "", // TODO: deploy to mainnet
} as const;

// Contract addresses on Arc Testnet
export const ARC_CONTRACTS = {
  USDC_ERC20: "0x3600000000000000000000000000000000000000", // 6 decimals
  USDC_NATIVE_EMITTER: "0xfffffffffffffffffffffffffffffffffffffffe", // 18 decimals (EIP-7708)
  BLOCKLISTED_TEST_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  // Remediated stack, source-verified on Arc testnet at deployment block 59881981.
  AMM_FACTORY: "0x50432933755E3d292eE2d7589c3CFab18f5d87BD",
  AMM_ROUTER: "0x0459984dEE1b0d7b3D031E28f1A68f4DdEC50A6A",
  TOKEN_FACTORY: "0xD6e64999f94e31a290CE006dD2D8dAEA5846b81E",
  TREASURY: "0x26770f604415be9DaBB7211a8d272D4EDB32d9c3",
  MIGRATOR: "0x07106479Cd70BE67378dA39afB846b363F00cDfe",
  TIMELOCK: "0xDd139CD311278C385cB4d578f76cc51aaece9e7d",
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
