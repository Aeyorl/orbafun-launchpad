import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export class BroadcastTransactionError extends Error {
  constructor(
    message: string,
    public readonly txHash: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'BroadcastTransactionError';
  }
}
import { createAwsKmsAccount } from './aws-kms-account';

/**
 * DeployerService — manages the platform-funded deployer wallet that submits
 * on-chain transactions on behalf of AI agents.
 *
 * The deployer wallet is funded by the platform operator. It pays:
 *   - The 5 USDC creation fee (transferred to the Treasury via TokenFactory)
 *   - Gas (native USDC, 18-dec)
 *
 * The agent is recorded as the token "creator" in the agent_launches table
 * for attribution, but the on-chain creator is the deployer wallet (msg.sender).
 *
 * Security:
 *   - Testnet may use DEPLOYER_PRIVATE_KEY; Arc mainnet requires AWS KMS.
 *   - All transactions are submitted via viem on the configured Arc chain.
 *   - RPC rotation across 4 providers (same as the frontend/poller).
 *
 * Note: viem is imported via require() (CommonJS) to avoid TypeScript deep
 * type instantiation errors from the ox dependency. The e2e scripts use the
 * same pattern.
 */
const {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  keccak256,
  toHex,
  encodeFunctionData,
  decodeAbiParameters,
} = require('viem');

export type TransactionInspection =
  | { status: 'unknown' }
  | { status: 'reverted'; txHash: string }
  | { status: 'replaced'; txHash: string }
  | {
      status: 'success';
      txHash: string;
      gasUsed: bigint;
      tokenAddress?: string;
      curveAddress?: string;
      tokenAmount?: bigint;
      usdcAmount?: bigint;
    };

export interface TransactionInspectionContext {
  operation: 'launch' | 'buy' | 'sell';
  payload: Record<string, unknown>;
}
const { privateKeyToAccount } = require('viem/accounts');
const { arc, arcTestnet } = require('viem/chains');

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || arcTestnet.id);
if (ARC_CHAIN_ID !== arcTestnet.id && ARC_CHAIN_ID !== arc.id) {
  throw new Error(`Unsupported ARC_CHAIN_ID: ${ARC_CHAIN_ID}`);
}
const ACTIVE_ARC_CHAIN = ARC_CHAIN_ID === arc.id ? arc : arcTestnet;
const IS_ARC_MAINNET = ARC_CHAIN_ID === arc.id;
const DEPLOYER_ACTIONS_ENABLED = process.env.DEPLOYER_ACTIONS_ENABLED === 'true';
const DEPLOYER_SIGNER_PROVIDER = process.env.DEPLOYER_SIGNER_PROVIDER || 'local';

function positiveBigIntEnv(name: string): bigint | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  try {
    const value = BigInt(raw);
    if (value <= 0n) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} must be a positive integer in micro-USDC`);
  }
}

const DEPLOYER_MAX_ACTION_USDC = positiveBigIntEnv(
  'DEPLOYER_MAX_ACTION_MICRO_USDC',
);
const DEPLOYER_MAX_BALANCE_USDC = positiveBigIntEnv(
  'DEPLOYER_MAX_BALANCE_MICRO_USDC',
);

if (
  DEPLOYER_ACTIONS_ENABLED &&
  (!DEPLOYER_MAX_ACTION_USDC || !DEPLOYER_MAX_BALANCE_USDC)
) {
  throw new Error(
    'DEPLOYER_ACTIONS_ENABLED requires DEPLOYER_MAX_ACTION_MICRO_USDC and DEPLOYER_MAX_BALANCE_MICRO_USDC',
  );
}

function requiredMainnetAddress(value: string | undefined, fallbackAddress: string, name: string) {
  if (value) return value;
  if (IS_ARC_MAINNET) throw new Error(`Arc mainnet requires ${name}`);
  return fallbackAddress;
}

function requiredAddress(value: string | undefined, name: string) {
  if (!value && process.env.NODE_ENV === 'test') {
    return '0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E';
  }
  if (!value) throw new Error(`Orba requires ${name}`);
  return value;
}

const TOKEN_FACTORY_ABI = [
  {
    name: 'createToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
  {
    name: 'creationFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const BONDING_CURVE_ABI = [
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'sell',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'quoteBuy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'quoteSell',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'currentPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const USDC_ADDRESS = requiredMainnetAddress(
  process.env.ARC_USDC_ADDRESS,
  '0x3600000000000000000000000000000000000000',
  'ARC_USDC_ADDRESS',
);

// TokenFactory.TokenCreated event signature
// event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string image, uint256 createdAt)
const TOKEN_CREATED_EVENT_TOPIC = keccak256(
  toHex('TokenCreated(address,address,address,string,string,string,uint256)'),
);
const BUY_V2_EVENT_TOPIC = keccak256(
  toHex('BuyV2(address,uint256,uint256,uint256,uint256,uint256)'),
);
const SELL_V2_EVENT_TOPIC = keccak256(
  toHex('SellV2(address,uint256,uint256,uint256,uint256,uint256)'),
);
const FIVE_UINT256_PARAMETERS = Array.from({ length: 5 }, () => ({ type: 'uint256' }));

export function extractBuyTokensOut(
  logs: Array<{ address: string; topics: readonly string[]; data: string }>,
  curveAddress: string,
  buyerAddress: string,
): bigint {
  const expectedBuyerTopic = buyerAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  for (const log of logs) {
    if (log.address.toLowerCase() !== curveAddress.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== BUY_V2_EVENT_TOPIC.toLowerCase()) continue;
    if (log.topics[1]?.toLowerCase().replace(/^0x/, '') !== expectedBuyerTopic) continue;

    const data = log.data.replace(/^0x/, '');
    if (data.length < 64 * 5) break;
    return BigInt(`0x${data.slice(64 * 3, 64 * 4)}`);
  }
  throw new Error('Authoritative BuyV2 event not found in transaction receipt');
}

const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  (IS_ARC_MAINNET
    ? ''
    : 'https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network,https://rpc.blockdaemon.testnet.arc.network')
)
  .split(',')
  .map((u: string) => u.trim())
  .filter(Boolean);

if (RPC_URLS.length === 0) {
  throw new Error('Arc mainnet requires ARC_RPC_URLS');
}

export interface LaunchResult {
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  gasUsed: bigint;
  creationFee: bigint;
}

@Injectable()
export class DeployerService implements OnModuleInit {
  private readonly logger = new Logger(DeployerService.name);
  private walletClient: any;
  private publicClient: any;
  private account: any;
  private tokenFactoryAddress: string;

  constructor(private readonly db: DatabaseService) {
    this.tokenFactoryAddress = requiredAddress(
      process.env.ARC_TOKEN_FACTORY_ADDRESS,
      'ARC_TOKEN_FACTORY_ADDRESS',
    ).toLowerCase();
    const transport = fallback(RPC_URLS.map((url: string) => http(url)));
    this.publicClient = createPublicClient({
      chain: ACTIVE_ARC_CHAIN,
      transport,
    });

    if (IS_ARC_MAINNET && process.env.DEPLOYER_PRIVATE_KEY) {
      throw new Error(
        'DEPLOYER_PRIVATE_KEY is forbidden on Arc mainnet; configure AWS KMS instead',
      );
    }

    if (DEPLOYER_SIGNER_PROVIDER === 'aws-kms') return;
    if (IS_ARC_MAINNET && DEPLOYER_ACTIONS_ENABLED) {
      throw new Error('Arc mainnet deployer actions require DEPLOYER_SIGNER_PROVIDER=aws-kms');
    }
    if (DEPLOYER_SIGNER_PROVIDER !== 'local') {
      throw new Error(`Unsupported DEPLOYER_SIGNER_PROVIDER: ${DEPLOYER_SIGNER_PROVIDER}`);
    }

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      this.logger.warn('No testnet deployer signer configured; funded actions disabled');
      return;
    }

    this.account = privateKeyToAccount(privateKey);

    this.walletClient = createWalletClient({
      account: this.account,
      chain: ACTIVE_ARC_CHAIN,
      transport,
    });

    this.logger.log(
      `Deployer wallet initialized: ${this.account.address}; funded actions ${
        DEPLOYER_ACTIONS_ENABLED ? 'enabled with caps' : 'disabled'
      }`,
    );
  }

  async onModuleInit(): Promise<void> {
    if (DEPLOYER_SIGNER_PROVIDER !== 'aws-kms') return;
    const keyId = process.env.AWS_KMS_KEY_ID;
    const expectedAddress = process.env.AWS_KMS_EXPECTED_ADDRESS;
    if (!keyId || !expectedAddress) {
      if (DEPLOYER_ACTIONS_ENABLED) {
        throw new Error(
          'AWS_KMS_KEY_ID and AWS_KMS_EXPECTED_ADDRESS are required when deployer actions are enabled',
        );
      }
      this.logger.warn('AWS KMS signer is incomplete; funded actions disabled');
      return;
    }
    this.account = await createAwsKmsAccount({
      keyId,
      expectedAddress,
      region: process.env.AWS_REGION,
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: ACTIVE_ARC_CHAIN,
      transport: fallback(RPC_URLS.map((url: string) => http(url))),
    });
    this.logger.log(`AWS KMS deployer initialized: ${this.account.address}`);
  }

  /** Check if the deployer wallet is configured. */
  isConfigured(): boolean {
    return !!this.account && DEPLOYER_ACTIONS_ENABLED;
  }

  private async assertActionAllowed(spendMicroUsdc: bigint): Promise<void> {
    if (!this.account || !DEPLOYER_ACTIONS_ENABLED) {
      throw new Error('Platform-funded deployer actions are disabled');
    }
    if (
      DEPLOYER_MAX_ACTION_USDC === undefined ||
      DEPLOYER_MAX_BALANCE_USDC === undefined
    ) {
      throw new Error('Deployer safety caps are not configured');
    }
    if (spendMicroUsdc > DEPLOYER_MAX_ACTION_USDC) {
      throw new Error('Requested action exceeds the deployer per-action cap');
    }
    const nativeBalance = (await this.publicClient.getBalance({
      address: this.account.address,
    })) as bigint;
    const maxBalance18dec = DEPLOYER_MAX_BALANCE_USDC * 1_000_000_000_000n;
    if (nativeBalance > maxBalance18dec) {
      throw new Error(
        'Deployer balance exceeds its configured hot-wallet ceiling; move excess funds to treasury',
      );
    }
  }

  /** Get the deployer wallet address. */
  getAddress(): string {
    return this.account?.address || '';
  }

  /**
   * Launch a token on-chain via the TokenFactory contract.
   * The deployer wallet pays the creation fee and gas.
   *
   * @param name Token name (1-50 chars)
   * @param symbol Token symbol (1-10 chars)
   * @param image IPFS URI or URL for token image
   * @param description Token description (stored off-chain)
   * @returns Launch result with token/curve addresses and tx hash
   */
  async launchToken(
    name: string,
    symbol: string,
    image: string,
    description: string,
    intentId?: string,
  ): Promise<LaunchResult> {
    return this.withSignerLock(() =>
      this.launchTokenUnlocked(name, symbol, image, description, intentId),
    );
  }

  private async launchTokenUnlocked(
    name: string,
    symbol: string,
    image: string,
    description: string,
    intentId?: string,
  ): Promise<LaunchResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer signer is not configured or funded actions are disabled');
    }

    this.logger.log(`Launching token "${name}" (${symbol}) via deployer wallet`);

    const creationFee = (await this.publicClient.readContract({
      address: this.tokenFactoryAddress,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'creationFee',
    })) as bigint;
    await this.assertActionAllowed(creationFee);
    const allowance = (await this.publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, this.tokenFactoryAddress],
    })) as bigint;

    if (allowance !== creationFee) {
      const approvalHash = await this.walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [this.tokenFactoryAddress, creationFee],
        chain: ACTIVE_ARC_CHAIN,
        account: this.account,
      });
      const approvalReceipt = await this.publicClient.waitForTransactionReceipt({
        hash: approvalHash,
        confirmations: 1,
        timeout: 30_000,
      });
      if (approvalReceipt.status !== 'success') {
        throw new Error(`TokenFactory approval reverted (tx: ${approvalHash})`);
      }
    }

    // Submit the createToken transaction.
    const request = {
      address: this.tokenFactoryAddress,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name, symbol.toUpperCase(), image, description],
      chain: ACTIVE_ARC_CHAIN,
      account: this.account,
    };
    const txHash = intentId
      ? await this.signPersistAndBroadcast(intentId, request)
      : await this.walletClient.writeContract(request);

    this.logger.log(`createToken tx submitted: ${txHash}`);

    // Wait for receipt to get the deployed addresses and gas used.
    let receipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
        timeout: 30_000,
      });
    } catch (err) {
      throw new BroadcastTransactionError(
        `createToken transaction was broadcast but receipt is unresolved (tx: ${txHash})`,
        txHash as string,
        { cause: err },
      );
    }

    if (receipt.status !== 'success') {
      throw new Error(`createToken transaction reverted (tx: ${txHash})`);
    }

    // Parse TokenCreated event from logs to get the deployed addresses.
    // TokenCreated: token (indexed, topic1), curve (indexed, topic2), creator (indexed, topic3)
    let tokenAddress: string | undefined;
    let curveAddress: string | undefined;

    for (const log of receipt.logs) {
      if (log.topics[0] === TOKEN_CREATED_EVENT_TOPIC) {
        tokenAddress = `0x${log.topics[1]?.slice(26)}`;
        curveAddress = `0x${log.topics[2]?.slice(26)}`;
        break;
      }
    }

    if (!tokenAddress || !curveAddress) {
      throw new Error('TokenCreated event not found in transaction logs');
    }

    this.logger.log(
      `Token launched: ${tokenAddress} (curve: ${curveAddress}), gas: ${receipt.gasUsed}`,
    );

    return {
      tokenAddress: tokenAddress.toLowerCase(),
      curveAddress: curveAddress.toLowerCase(),
      txHash: txHash as string,
      gasUsed: receipt.gasUsed,
      creationFee,
    };
  }

  /**
   * Check the deployer wallet's USDC balance (native, 18-dec).
   * Used to monitor if the wallet needs topping up.
   */
  async getBalance(): Promise<bigint> {
    if (!this.account) return 0n;
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    return balance;
  }

  /**
   * Approve the TokenFactory to spend USDC on behalf of the deployer wallet.
   * Administrative reserve approval. Normal launches establish the exact
   * creation-fee allowance automatically, so this is not required for setup.
   */
  async approveTokenFactory(): Promise<string> {
    return this.withSignerLock(() => this.approveTokenFactoryUnlocked());
  }

  private async approveTokenFactoryUnlocked(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }
    await this.assertActionAllowed(0n);
    const approvalCap = positiveBigIntEnv('TOKEN_FACTORY_APPROVAL_CAP_USDC');
    if (!approvalCap || approvalCap > DEPLOYER_MAX_ACTION_USDC!) {
      throw new Error(
        'TOKEN_FACTORY_APPROVAL_CAP_USDC is required and cannot exceed the deployer per-action cap',
      );
    }

    const txHash = await this.walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [
        this.tokenFactoryAddress,
        approvalCap,
      ],
      chain: ACTIVE_ARC_CHAIN,
      account: this.account,
    });

    this.logger.log(`Approved TokenFactory to spend USDC: tx ${txHash}`);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 30_000,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Approval transaction reverted (tx: ${txHash})`);
    }

    this.logger.log('TokenFactory USDC approval confirmed');
    return txHash as string;
  }

  /**
   * Verify an on-chain USDC transfer transaction.
   * Checks that the tx exists, succeeded, and transferred the expected amount
   * of USDC (6-dec) from the expected sender to the expected recipient.
   *
   * Used by TipService to verify that a user actually sent USDC to an agent
   * before recording the tip.
   *
   * @returns true if the transfer is valid, false otherwise
   */
  async verifyUsdcTransfer(
    txHash: string,
    expectedFrom: string,
    expectedTo: string,
    expectedAmount: bigint,
  ): Promise<boolean> {
    if (!this.publicClient) return false;

    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: 1,
        timeout: 10_000,
      });

      if (receipt.status !== 'success') return false;

      // Parse Transfer event from the receipt logs.
      // USDC Transfer event: keccak256("Transfer(address,address,uint256)")
      // = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      const TRANSFER_SIG =
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;
        if (log.topics[0]?.toLowerCase() !== TRANSFER_SIG) continue;

        // topics[1] = from (padded to 32 bytes), topics[2] = to
        const from = '0x' + log.topics[1].slice(-40);
        const to = '0x' + log.topics[2].slice(-40);
        // data = amount (uint256)
        const amount = BigInt(log.data);

        if (
          from.toLowerCase() === expectedFrom.toLowerCase() &&
          to.toLowerCase() === expectedTo.toLowerCase() &&
          amount === expectedAmount
        ) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // ─── Token Management: Buy / Sell ──────────────────────────────────────

  /**
   * Buy tokens on a bonding curve using the deployer wallet.
   * Approves USDC to the curve, then calls buy().
   *
   * @param curveAddress BondingCurve contract address
   * @param usdcAmount 6-dec USDC amount to spend
   * @param slippageBps Slippage tolerance in basis points (e.g. 500 = 5%)
   * @returns Trade result with tx hash, tokens received, and gas used
   */
  async buyTokens(
    curveAddress: string,
    usdcAmount: bigint,
    slippageBps: bigint = 500n,
    intentId?: string,
  ): Promise<TradeResult> {
    return this.withSignerLock(() =>
      this.buyTokensUnlocked(curveAddress, usdcAmount, slippageBps, intentId),
    );
  }

  private async buyTokensUnlocked(
    curveAddress: string,
    usdcAmount: bigint,
    slippageBps: bigint = 500n, // 5% default
    intentId?: string,
  ): Promise<TradeResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }
    await this.assertActionAllowed(usdcAmount);

    const curve = curveAddress.toLowerCase();
    this.logger.log(`Buying on curve ${curve} with ${usdcAmount} USDC (6-dec)`);

    // Get a quote for min tokens out.
    const quote = await this.publicClient.readContract({
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'quoteBuy',
      args: [usdcAmount],
    });
    const minTokensOut = (quote as bigint * (10000n - slippageBps)) / 10000n;

    // Approve only this buy amount.
    const allowance = await this.publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, curve],
    });

    if ((allowance as bigint) !== usdcAmount) {
      const approveTx = await this.walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [curve, usdcAmount],
        chain: ACTIVE_ARC_CHAIN,
        account: this.account,
      });
      const approvalReceipt = await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1,
        timeout: 30_000,
      });
      if (approvalReceipt.status !== 'success') {
        throw new Error(`Curve approval reverted (tx: ${approveTx})`);
      }
      this.logger.log(`USDC approved for curve ${curve}`);
    }

    // Execute the buy.
    const request = {
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'buy',
      args: [usdcAmount, minTokensOut],
      chain: ACTIVE_ARC_CHAIN,
      account: this.account,
    };
    const buyTx = intentId
      ? await this.signPersistAndBroadcast(intentId, request)
      : await this.walletClient.writeContract(request);

    this.logger.log(`Buy tx submitted: ${buyTx}`);

    let receipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash: buyTx,
        confirmations: 1,
        timeout: 30_000,
      });
    } catch (err) {
      throw new BroadcastTransactionError(
        `Buy transaction was broadcast but receipt is unresolved (tx: ${buyTx})`,
        buyTx as string,
        { cause: err },
      );
    }

    if (receipt.status !== 'success') {
      throw new Error(`Buy transaction reverted (tx: ${buyTx})`);
    }

    this.logger.log(`Buy confirmed, gas: ${receipt.gasUsed}`);

    const tokensOut = extractBuyTokensOut(
      receipt.logs,
      curve,
      this.account.address,
    );

    return {
      txHash: buyTx as string,
      tokenAmount: tokensOut,
      usdcAmount,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Sell tokens on a bonding curve using the deployer wallet.
   * Approves the token to the curve, then calls sell().
   *
   * @param tokenAddress MemeToken contract address
   * @param curveAddress BondingCurve contract address
   * @param tokenAmount 18-dec token amount to sell
   * @param slippageBps Slippage tolerance in basis points (e.g. 500 = 5%)
   * @returns Trade result with tx hash, USDC received, and gas used
   */
  async sellTokens(
    tokenAddress: string,
    curveAddress: string,
    tokenAmount: bigint,
    slippageBps: bigint = 500n,
    intentId?: string,
  ): Promise<TradeResult> {
    return this.withSignerLock(() =>
      this.sellTokensUnlocked(tokenAddress, curveAddress, tokenAmount, slippageBps, intentId),
    );
  }

  private async sellTokensUnlocked(
    tokenAddress: string,
    curveAddress: string,
    tokenAmount: bigint,
    slippageBps: bigint = 500n, // 5% default
    intentId?: string,
  ): Promise<TradeResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }
    await this.assertActionAllowed(0n);

    const token = tokenAddress.toLowerCase();
    const curve = curveAddress.toLowerCase();
    this.logger.log(`Selling ${tokenAmount} tokens (18-dec) on curve ${curve}`);

    // Check token balance.
    const balance = await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.account.address],
    });

    if ((balance as bigint) < tokenAmount) {
      throw new Error(
        `Insufficient token balance: have ${balance}, need ${tokenAmount}`,
      );
    }

    // Get a quote for min USDC out.
    const quote = await this.publicClient.readContract({
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'quoteSell',
      args: [tokenAmount],
    });
    const minUsdcOut = (quote as bigint * (10000n - slippageBps)) / 10000n;

    // Approve token to the bonding curve.
    const allowance = await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, curve],
    });

    if ((allowance as bigint) !== tokenAmount) {
      const approveTx = await this.walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [curve, tokenAmount],
        chain: ACTIVE_ARC_CHAIN,
        account: this.account,
      });
      const approvalReceipt = await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1,
        timeout: 30_000,
      });
      if (approvalReceipt.status !== 'success') {
        throw new Error(`Token approval reverted (tx: ${approveTx})`);
      }
      this.logger.log(`Token approved for curve ${curve}`);
    }

    // Execute the sell.
    const request = {
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'sell',
      args: [tokenAmount, minUsdcOut],
      chain: ACTIVE_ARC_CHAIN,
      account: this.account,
    };
    const sellTx = intentId
      ? await this.signPersistAndBroadcast(intentId, request)
      : await this.walletClient.writeContract(request);

    this.logger.log(`Sell tx submitted: ${sellTx}`);

    let receipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash: sellTx,
        confirmations: 1,
        timeout: 30_000,
      });
    } catch (err) {
      throw new BroadcastTransactionError(
        `Sell transaction was broadcast but receipt is unresolved (tx: ${sellTx})`,
        sellTx as string,
        { cause: err },
      );
    }

    if (receipt.status !== 'success') {
      throw new Error(`Sell transaction reverted (tx: ${sellTx})`);
    }

    this.logger.log(`Sell confirmed, gas: ${receipt.gasUsed}`);

    return {
      txHash: sellTx as string,
      tokenAmount,
      usdcAmount: quote as bigint, // USDC received (approx)
      gasUsed: receipt.gasUsed,
    };
  }

  private async signPersistAndBroadcast(intentId: string, request: any): Promise<string> {
    const data = encodeFunctionData({
      abi: request.abi,
      functionName: request.functionName,
      args: request.args,
    });
    const prepared = await this.walletClient.prepareTransactionRequest({
      account: this.account,
      chain: ACTIVE_ARC_CHAIN,
      to: request.address,
      data,
    });
    const signedTx = await this.account.signTransaction(prepared);
    const txHash = keccak256(signedTx) as string;

    // This commit occurs before sendRawTransaction. A crash at any later point
    // is recoverable by broadcasting the same signed bytes (same nonce/hash).
    const persisted = await this.db.query(
      `UPDATE agent_transaction_intents
       SET signed_tx = $2, tx_hash = $3, status = 'prepared', updated_at = NOW()
       WHERE id = $1 AND status = 'created'`,
      [intentId, signedTx, txHash],
    );
    if ((persisted as any).rowCount !== 1) {
      throw new Error(`Transaction intent ${intentId} is not signable`);
    }
    await this.rebroadcastSignedTransaction(signedTx);
    await this.db.query(
      `UPDATE agent_transaction_intents SET status = 'broadcast', updated_at = NOW()
       WHERE id = $1 AND status = 'prepared'`,
      [intentId],
    );
    return txHash;
  }

  private async withSignerLock<T>(operation: () => Promise<T>): Promise<T> {
    // Transaction-scoped advisory lock serializes the shared deployer account
    // across every API replica. PostgreSQL releases it automatically on crash.
    return this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [1_330_790_990]);
      return operation();
    });
  }

  async getTransactionStatus(txHash: string): Promise<'success' | 'reverted' | 'pending'> {
    if (!this.publicClient) return 'pending';
    try {
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      return receipt.status === 'success' ? 'success' : 'reverted';
    } catch {
      return 'pending';
    }
  }

  /** Re-send exactly the bytes persisted before the first RPC submission. */
  async rebroadcastSignedTransaction(signedTx: string): Promise<void> {
    if (!this.walletClient) throw new Error('Deployer wallet is not configured');
    try {
      await this.walletClient.sendRawTransaction({ serializedTransaction: signedTx });
    } catch (err: any) {
      // "already known" / "nonce too low" are normal after a crash following send.
      const message = String(err?.message || err).toLowerCase();
      if (!message.includes('already known') && !message.includes('nonce too low')) throw err;
    }
  }

  async inspectTransaction(
    txHash: string,
    context: TransactionInspectionContext,
  ): Promise<TransactionInspection> {
    if (!this.publicClient) return { status: 'unknown' };
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== 'success') return { status: 'reverted', txHash };
      const base = { status: 'success' as const, txHash, gasUsed: receipt.gasUsed };

      if (context.operation === 'launch') {
        const created = receipt.logs.find(
          (log: any) =>
            log.address.toLowerCase() === this.tokenFactoryAddress &&
            log.topics[0]?.toLowerCase() === TOKEN_CREATED_EVENT_TOPIC.toLowerCase(),
        );
        if (!created?.topics[1] || !created?.topics[2]) return { status: 'unknown' };
        return {
          ...base,
          tokenAddress: `0x${created.topics[1].slice(-40)}`.toLowerCase(),
          curveAddress: `0x${created.topics[2].slice(-40)}`.toLowerCase(),
        };
      }

      if (context.operation === 'buy') {
        const curveAddress = String(context.payload.curveAddress || '').toLowerCase();
        const bought = receipt.logs.find(
          (log: any) =>
            log.address.toLowerCase() === curveAddress &&
            log.topics[0]?.toLowerCase() === BUY_V2_EVENT_TOPIC.toLowerCase(),
        );
        if (!bought) return { status: 'unknown' };
        const decoded = decodeAbiParameters(FIVE_UINT256_PARAMETERS, bought.data);
        return { ...base, tokenAmount: decoded[3] as bigint };
      }

      if (context.operation === 'sell') {
        const curveAddress = String(context.payload.curveAddress || '').toLowerCase();
        const sold = receipt.logs.find(
          (log: any) =>
            log.address.toLowerCase() === curveAddress &&
            log.topics[0]?.toLowerCase() === SELL_V2_EVENT_TOPIC.toLowerCase(),
        );
        if (!sold) return { status: 'unknown' };
        const decoded = decodeAbiParameters(FIVE_UINT256_PARAMETERS, sold.data);
        return { ...base, usdcAmount: decoded[3] as bigint };
      }

      return base;
    } catch {
      // Absence/timeout/provider errors are deliberately indistinguishable and
      // therefore never release a reservation.
      return { status: 'unknown' };
    }
  }

  /**
   * Get the deployer wallet's token balance for a specific token.
   * Used to check if the agent has tokens to sell.
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    if (!this.isConfigured()) return 0n;
    const balance = await this.publicClient.readContract({
      address: tokenAddress.toLowerCase(),
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.account.address],
    });
    return balance as bigint;
  }
}

export interface TradeResult {
  txHash: string;
  tokenAmount: bigint; // 18-dec tokens (bought or sold)
  usdcAmount: bigint;  // 6-dec USDC (spent or received)
  gasUsed: bigint;     // 18-dec native USDC gas cost
}
