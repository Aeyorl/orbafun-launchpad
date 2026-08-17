// Arc chain configuration — confirmed from docs, see DECISION_LOG.md
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

// Contract addresses on Arc Testnet
export const ARC_CONTRACTS = {
  USDC_ERC20: "0x3600000000000000000000000000000000000000", // 6 decimals
  USDC_NATIVE_EMITTER: "0xfffffffffffffffffffffffffffffffffffffffe", // 18 decimals (EIP-7708)
  BLOCKLISTED_TEST_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  // Graduation/AMM stack, verified on Arc testnet at factory block 57533864.
  AMM_FACTORY: "0xf2FDf9ea4efEFb49910A96e959642112d1A00B8b",
  AMM_ROUTER: "0x3F762785CC165eFa28108649A15a70dc19D448Cd",
  TOKEN_FACTORY: "0x6CaD9423f886b1098DF47C4C6104DD83D2557eFc",
  TREASURY: "0xDC9471561269845249614cfB4e42cFdd73F2E828",
  MIGRATOR: "0xcF22F6557D8dDcc7fbA38F6f5784cB50c1744149",
  TIMELOCK: "0x0DD8666e2819d36f01Dae53923b8A42ac5DA87ca",
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
