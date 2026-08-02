// Orba Indexer Event Handlers — HyperIndex V3
//
// V3 uses the unified `indexer.onEvent()` and `indexer.contractRegister()` API.
// Handlers receive `{ event, context }` and use `context.Entity.set/get` for DB ops.
//
// Architecture:
// - Envio indexes events from Arc testnet into its own DB + GraphQL API
// - Our NestJS API polls Envio's GraphQL endpoint for new events
// - This file handles the Envio-side indexing (storing entities in Envio's DB)
//
// Dynamic contracts:
// - BondingCurve and AMMPair are deployed per-token
// - We register them dynamically via contractRegister handlers
// - BondingCurve is registered when TokenFactory emits TokenCreated
// - AMMPair is registered when BondingCurve emits Graduated

import { indexer } from "envio";
import type { Token, Trade, Graduation, AmmSwap, User, IndexerState, CurveMapping, AmmPairMapping } from "envio";

// ─── Constants ─────────────────────────────────────────────────────────────
const TOTAL_SUPPLY = 1_000_000_000n; // 1B tokens

// Convert BigInt USDC (6-dec) and BigInt tokens (18-dec) to a BigDecimal
// price string (USDC per whole token).
function computePriceString(usdcAmount: bigint, tokenAmount: bigint): string {
  if (tokenAmount === 0n) return "0";
  // price = (usdcAmount / 1e6) / (tokenAmount / 1e18)
  //       = usdcAmount * 1e12 / tokenAmount
  // Scale by 1e18 (not 1e12) to preserve precision for sub-micro prices.
  // Without the extra 1e6 factor, integer division truncates to 0 when
  // the price is < 1e-6 USDC/token (common for early bonding curve buys).
  const scaled = (usdcAmount * 10n ** 18n) / tokenAmount;
  // scaled is in micro-USDC per token (1e-6 USDC per token)
  // Convert to USDC string with 6 decimal places
  const intPart = scaled / 10n ** 6n;
  const fracPart = scaled % 10n ** 6n;
  return `${intPart}.${fracPart.toString().padStart(6, "0")}`;
}

function computeMarketCapString(price: string): string {
  // marketCap = price * 1_000_000_000 (1B tokens)
  // Simple string multiplication — price is a decimal string
  const [intPart, decPart = ""] = price.split(".");
  const fullStr = intPart + decPart.padEnd(18, "0").slice(0, 18);
  // Multiply by 1e9
  const mcap = BigInt(fullStr) * 10n ** 9n;
  // Convert back to string with appropriate decimals
  const mcapInt = mcap / 10n ** 18n;
  const mcapFrac = mcap % 10n ** 18n;
  return `${mcapInt}.${mcapFrac.toString().padStart(18, "0").slice(0, 6)}`;
}

function scaledCurvePriceString(value: bigint): string {
  const scale = 10n ** 30n;
  const intPart = value / scale;
  const fractional = (value % scale).toString().padStart(30, "0").slice(0, 18);
  return `${intPart}.${fractional}`;
}

async function handleAccountingV2(event: any, context: any, isBuy: boolean): Promise<void> {
  const mapping = await context.CurveMapping.get(event.srcAddress);
  if (!mapping) return;
  const token = await context.Token.get(mapping.tokenId);
  if (!token) return;

  const grossUsdc = isBuy ? event.params.usdcIn : event.params.usdcGross;
  const netUsdc = isBuy ? event.params.usdcToCurve : event.params.usdcOut;
  const tokenAmount = isBuy ? event.params.tokensOut : event.params.tokensIn;
  const wallet = isBuy ? event.params.buyer : event.params.seller;
  const fee = event.params.fee;
  const creatorFee = fee / 2n;
  const protocolFee = fee - creatorFee;
  const newPrice = scaledCurvePriceString(event.params.price);
  const newMarketCap = computeMarketCapString(newPrice);
  const realUsdcAfter = isBuy
    ? token.realUsdc + netUsdc
    : token.realUsdc > grossUsdc ? token.realUsdc - grossUsdc : 0n;
  const tokensSoldAfter = isBuy
    ? token.tokensSold + tokenAmount
    : token.tokensSold > tokenAmount ? token.tokensSold - tokenAmount : 0n;

  context.Token.set({
    ...token,
    price: newPrice,
    marketCap: newMarketCap,
    realUsdc: realUsdcAfter,
    tokensSold: tokensSoldAfter,
    creatorFeesAccrued: token.creatorFeesAccrued + creatorFee,
    protocolFeesAccrued: token.protocolFeesAccrued + protocolFee,
  });
  context.Trade.set({
    id: makeTradeId(event.transaction.hash, event.logIndex),
    token_id: mapping.tokenId,
    wallet,
    type: isBuy ? "buy" : "sell",
    usdcAmount: grossUsdc,
    tokenAmount,
    price: newPrice,
    marketCapAfter: newMarketCap,
    realUsdcAfter,
    tokensSoldAfter,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    timestamp: event.block.timestamp,
  });

  const user = await context.User.get(wallet);
  context.User.set(user
    ? { ...user, totalVolumeUsdc: user.totalVolumeUsdc + grossUsdc }
    : {
        id: wallet,
        tokensLaunched: 0,
        totalVolumeUsdc: grossUsdc,
        createdAt: event.block.timestamp,
      });
  await updateIndexerState(context, event.block.number, event.block.timestamp);
}

// Generate unique trade ID from tx hash + log index
function makeTradeId(txHash: string, logIndex: number): string {
  return `${txHash}-${logIndex}`;
}

// ─── Dynamic Contract Registration ─────────────────────────────────────────

// Register BondingCurve contracts when TokenCreated fires
indexer.contractRegister(
  { contract: "TokenFactory", event: "TokenCreated" },
  ({ event, context }) => {
    const curveAddress = event.params.curve;
    context.chain.BondingCurve.add(curveAddress);
    context.log.info(`Registered BondingCurve at ${curveAddress} for token ${event.params.token}`);
  },
);

// Register AMMPair contracts when Graduated fires
indexer.contractRegister(
  { contract: "BondingCurve", event: "Graduated" },
  ({ event, context }) => {
    const ammPairAddress = event.params.ammPair;
    context.chain.AMMPair.add(ammPairAddress);
    context.log.info(`Registered AMMPair at ${ammPairAddress} for token ${event.params.token}`);
  },
);

// ─── TokenFactory: TokenCreated ────────────────────────────────────────────
indexer.onEvent(
  { contract: "TokenFactory", event: "TokenCreated" },
  async ({ event, context }) => {
    const tokenAddress = event.params.token;
    const curveAddress = event.params.curve;
    const creator = event.params.creator;

    // Create or update user
    let user = await context.User.get(creator);
    if (!user) {
      context.User.set({
        id: creator,
        tokensLaunched: 1,
        totalVolumeUsdc: 0n,
        createdAt: event.block.timestamp,
      });
    } else {
      context.User.set({
        ...user,
        tokensLaunched: user.tokensLaunched + 1,
      });
    }

    // Create the Token entity
    context.Token.set({
      id: tokenAddress,
      curve: curveAddress,
      ammPair: undefined,
      creator: creator,
      name: event.params.name,
      symbol: event.params.symbol,
      image: event.params.image,
      price: "0.000004545454545", // Initial: $4000 MC / 880M tokens
      marketCap: "4000",
      volume24h: "0",
      realUsdc: 0n,
      tokensSold: 0n,
      creatorFeesAccrued: 0n,
      protocolFeesAccrued: 0n,
      status: "active",
      graduatedAt: undefined,
      lpBurned: undefined,
      createdAtBlock: event.block.number,
      createdAtTx: event.transaction.hash,
      createdAt: event.block.timestamp,
    });

    // Create curve→token mapping
    context.CurveMapping.set({
      id: curveAddress,
      tokenId: tokenAddress,
    });

    context.log.info(`Token created: ${event.params.name} (${event.params.symbol}) at ${tokenAddress}`);
  },
);

// ─── TokenFactory: TokenGraduated ──────────────────────────────────────────
indexer.onEvent(
  { contract: "TokenFactory", event: "TokenGraduated" },
  async ({ event, context }) => {
    const tokenAddress = event.params.token;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    context.Token.set({
      ...token,
      status: "graduated",
      ammPair: event.params.ammPair,
      graduatedAt: event.block.timestamp,
    });

    // Create ammPair→token mapping
    context.AmmPairMapping.set({
      id: event.params.ammPair,
      tokenId: tokenAddress,
    });

    context.log.info(`Token graduated: ${tokenAddress} -> AMM pair ${event.params.ammPair}`);
  },
);

// ─── BondingCurve: Buy ─────────────────────────────────────────────────────
indexer.onEvent(
  { contract: "BondingCurve", event: "Buy" },
  async ({ event, context }) => {
    const curveAddress = event.srcAddress;
    const mapping = await context.CurveMapping.get(curveAddress);
    if (!mapping) return;

    const tokenAddress = mapping.tokenId;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    const usdcIn = event.params.usdcIn;
    const tokensOut = event.params.tokensOut;

    // Compute price and market cap
    const newPrice = computePriceString(usdcIn, tokensOut);
    const newMarketCap = computeMarketCapString(newPrice);

    // Update curve state (1% fee, split 50/50)
    const fee = usdcIn / 100n;
    const netUsdc = usdcIn - fee;
    const creatorFee = fee / 2n;
    const protocolFee = fee - creatorFee;

    context.Token.set({
      ...token,
      price: newPrice,
      marketCap: newMarketCap,
      realUsdc: token.realUsdc + netUsdc,
      tokensSold: token.tokensSold + tokensOut,
      creatorFeesAccrued: token.creatorFeesAccrued + creatorFee,
      protocolFeesAccrued: token.protocolFeesAccrued + protocolFee,
    });

    // Create Trade entity
    const tradeId = makeTradeId(event.transaction.hash, event.logIndex);
    context.Trade.set({
      id: tradeId,
      token_id: tokenAddress,
      wallet: event.params.buyer,
      type: "buy",
      usdcAmount: usdcIn,
      tokenAmount: tokensOut,
      price: newPrice,
      marketCapAfter: newMarketCap,
      realUsdcAfter: token.realUsdc + netUsdc,
      tokensSoldAfter: token.tokensSold + tokensOut,
      txHash: event.transaction.hash,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
    });

    // Update user volume
    let user = await context.User.get(event.params.buyer);
    if (!user) {
      context.User.set({
        id: event.params.buyer,
        tokensLaunched: 0,
        totalVolumeUsdc: usdcIn,
        createdAt: event.block.timestamp,
      });
    } else {
      context.User.set({
        ...user,
        totalVolumeUsdc: user.totalVolumeUsdc + usdcIn,
      });
    }

    // Update indexer state
    await updateIndexerState(context, event.block.number, event.block.timestamp);
  },
);

// ─── BondingCurve: Sell ────────────────────────────────────────────────────
indexer.onEvent(
  { contract: "BondingCurve", event: "Sell" },
  async ({ event, context }) => {
    const curveAddress = event.srcAddress;
    const mapping = await context.CurveMapping.get(curveAddress);
    if (!mapping) return;

    const tokenAddress = mapping.tokenId;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    const usdcOut = event.params.usdcOut;
    const tokensIn = event.params.tokensIn;

    const newPrice = computePriceString(usdcOut, tokensIn);
    const newMarketCap = computeMarketCapString(newPrice);

    const fee = usdcOut / 100n;
    const netUsdcOut = usdcOut - fee;
    const creatorFee = fee / 2n;
    const protocolFee = fee - creatorFee;

    context.Token.set({
      ...token,
      price: newPrice,
      marketCap: newMarketCap,
      realUsdc: token.realUsdc > netUsdcOut ? token.realUsdc - netUsdcOut : 0n,
      tokensSold: token.tokensSold > tokensIn ? token.tokensSold - tokensIn : 0n,
      creatorFeesAccrued: token.creatorFeesAccrued + creatorFee,
      protocolFeesAccrued: token.protocolFeesAccrued + protocolFee,
    });

    const tradeId = makeTradeId(event.transaction.hash, event.logIndex);
    context.Trade.set({
      id: tradeId,
      token_id: tokenAddress,
      wallet: event.params.seller,
      type: "sell",
      usdcAmount: usdcOut,
      tokenAmount: tokensIn,
      price: newPrice,
      marketCapAfter: newMarketCap,
      realUsdcAfter: token.realUsdc > netUsdcOut ? token.realUsdc - netUsdcOut : 0n,
      tokensSoldAfter: token.tokensSold > tokensIn ? token.tokensSold - tokensIn : 0n,
      txHash: event.transaction.hash,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
    });

    // Update user volume
    let user = await context.User.get(event.params.seller);
    if (!user) {
      context.User.set({
        id: event.params.seller,
        tokensLaunched: 0,
        totalVolumeUsdc: usdcOut,
        createdAt: event.block.timestamp,
      });
    } else {
      context.User.set({
        ...user,
        totalVolumeUsdc: user.totalVolumeUsdc + usdcOut,
      });
    }

    await updateIndexerState(context, event.block.number, event.block.timestamp);
  },
);

// ─── BondingCurve: Graduated ───────────────────────────────────────────────
indexer.onEvent(
  { contract: "BondingCurve", event: "BuyV2" },
  async ({ event, context }) => handleAccountingV2(event, context, true),
);

indexer.onEvent(
  { contract: "BondingCurve", event: "SellV2" },
  async ({ event, context }) => handleAccountingV2(event, context, false),
);

indexer.onEvent(
  { contract: "BondingCurve", event: "Graduated" },
  async ({ event, context }) => {
    const tokenAddress = event.params.token;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    context.Token.set({
      ...token,
      status: "graduated",
      ammPair: event.params.ammPair,
      graduatedAt: event.block.timestamp,
    });

    // Create ammPair→token mapping
    context.AmmPairMapping.set({
      id: event.params.ammPair,
      tokenId: tokenAddress,
    });

    // Create Graduation entity
    const gradId = makeTradeId(event.transaction.hash, event.logIndex);
    context.Graduation.set({
      id: gradId,
      token_id: tokenAddress,
      ammPair: event.params.ammPair,
      lpUsdc: event.params.lpUsdc,
      lpTokens: event.params.lpTokens,
      lpBurned: 0n, // Set by TokenMigrated event
      txHash: event.transaction.hash,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    });

    context.log.info(`Token graduated via BondingCurve: ${tokenAddress}`);
    await updateIndexerState(context, event.block.number, event.block.timestamp);
  },
);

// ─── BondingCurve: CreatorFeesClaimed ──────────────────────────────────────
indexer.onEvent(
  { contract: "BondingCurve", event: "CreatorFeesClaimed" },
  async ({ event, context }) => {
    const mapping = await context.CurveMapping.get(event.srcAddress);
    if (!mapping) return;
    const token = await context.Token.get(mapping.tokenId);
    if (!token) return;
    context.Token.set({
      ...token,
      creatorFeesAccrued: 0n,
    });
  },
);

// ─── BondingCurve: ProtocolFeesClaimed ─────────────────────────────────────
indexer.onEvent(
  { contract: "BondingCurve", event: "ProtocolFeesClaimed" },
  async ({ event, context }) => {
    const mapping = await context.CurveMapping.get(event.srcAddress);
    if (!mapping) return;
    const token = await context.Token.get(mapping.tokenId);
    if (!token) return;
    context.Token.set({
      ...token,
      protocolFeesAccrued: 0n,
    });
  },
);

// ─── LiquidityMigration: TokenMigrated ─────────────────────────────────────
indexer.onEvent(
  { contract: "LiquidityMigration", event: "TokenMigrated" },
  async ({ event, context }) => {
    const tokenAddress = event.params.token;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    context.Token.set({
      ...token,
      lpBurned: event.params.lpBurned,
    });

    context.log.info(`Token migrated: ${tokenAddress}, LP burned: ${event.params.lpBurned}`);
  },
);

// ─── AMMPair: Swap ─────────────────────────────────────────────────────────
indexer.onEvent(
  { contract: "AMMPair", event: "Swap" },
  async ({ event, context }) => {
    const mapping = await context.AmmPairMapping.get(event.srcAddress);
    if (!mapping) return;

    const tokenAddress = mapping.tokenId;
    const token = await context.Token.get(tokenAddress);
    if (!token) return;

    // Determine swap direction: USDC is 0x3600... (low address) = token0
    const isBuy = event.params.amount0In > 0n;
    const usdcIn = isBuy ? event.params.amount0In : 0n;
    const usdcOut = isBuy ? 0n : event.params.amount0Out;
    const tokenIn = isBuy ? 0n : event.params.amount1In;
    const tokenOut = isBuy ? event.params.amount1Out : 0n;

    const usdcAmount = usdcIn + usdcOut;
    const tokenAmount = tokenIn + tokenOut;
    const newPrice = computePriceString(usdcAmount, tokenAmount);
    const newMarketCap = computeMarketCapString(newPrice);

    context.Token.set({
      ...token,
      price: newPrice,
      marketCap: newMarketCap,
    });

    const swapId = makeTradeId(event.transaction.hash, event.logIndex);
    context.AmmSwap.set({
      id: swapId,
      token_id: tokenAddress,
      ammPair: event.srcAddress,
      sender: event.params.sender,
      to: event.params.to,
      isBuy: isBuy,
      usdcIn: usdcIn,
      usdcOut: usdcOut,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      priceAfter: newPrice,
      txHash: event.transaction.hash,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
    });

    await updateIndexerState(context, event.block.number, event.block.timestamp);
  },
);

// ─── AMMPair: Sync ─────────────────────────────────────────────────────────
indexer.onEvent(
  { contract: "AMMPair", event: "Sync" },
  async ({ event, context }) => {
    const mapping = await context.AmmPairMapping.get(event.srcAddress);
    if (!mapping) return;

    const token = await context.Token.get(mapping.tokenId);
    if (!token) return;

    // reserve0 = USDC (6-dec), reserve1 = token (18-dec)
    if (event.params.reserve1 > 0n) {
      const newPrice = computePriceString(event.params.reserve0, event.params.reserve1);
      context.Token.set({
        ...token,
        price: newPrice,
        marketCap: computeMarketCapString(newPrice),
      });
    }
  },
);

// ─── Helper: Update indexer state ──────────────────────────────────────────
async function updateIndexerState(
  context: any,
  blockNumber: bigint,
  timestamp: number,
): Promise<void> {
  let state = await context.IndexerState.get("1");
  if (!state) {
    context.IndexerState.set({
      id: "1",
      lastBlock: blockNumber,
      lastBlockHash: undefined,
      lastEventTimestamp: timestamp,
      eventsIndexed: 1n,
      updatedAt: timestamp,
    });
  } else {
    context.IndexerState.set({
      ...state,
      lastBlock: blockNumber > state.lastBlock ? blockNumber : state.lastBlock,
      lastEventTimestamp: timestamp,
      eventsIndexed: state.eventsIndexed + 1n,
      updatedAt: timestamp,
    });
  }
}
