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
  // Hardened graduation/AMM stack, verified on Arc testnet at factory block 59870678.
  AMM_FACTORY: "0x9f2E34c3A32819268E6e37c0Cb76F53724F222b1",
  AMM_ROUTER: "0x194f27364bAdE80DF0C5b4f31CcE667FF6ea8F39",
  TOKEN_FACTORY: "0x3dD9bA8Aa1d92ebfdBE10438618d643757bE64B3",
  TREASURY: "0x41712d8cebdAfc5b7eac343F2add73288248bd5c",
  MIGRATOR: "0x93E16Bd952E3d60a99E27BB7ED06A612Def7a77d",
  TIMELOCK: "0x23a038742a12d9D8ABcfF62c5bFA36b608fFe17e",
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
