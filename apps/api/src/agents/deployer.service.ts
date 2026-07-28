import { Injectable, Logger } from '@nestjs/common';

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
 *   - DEPLOYER_PRIVATE_KEY is loaded from env, never logged or exposed.
 *   - All transactions are submitted via viem with the Arc testnet chain.
 *   - RPC rotation across 4 providers (same as the frontend/poller).
 *
 * Note: viem is imported via require() (CommonJS) to avoid TypeScript deep
 * type instantiation errors from the ox dependency. The e2e scripts use the
 * same pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  keccak256,
  toHex,
} = require('viem');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { privateKeyToAccount } = require('viem/accounts');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { arcTestnet } = require('viem/chains');

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

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const MAX_UINT256 = (1n << 256n) - 1n;

// TokenFactory.TokenCreated event signature
// event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string image, uint256 createdAt)
const TOKEN_CREATED_EVENT_TOPIC = keccak256(
  toHex('TokenCreated(address,address,address,string,string,string,uint256)'),
);

const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
)
  .split(',')
  .map((u: string) => u.trim())
  .filter(Boolean);

export interface LaunchResult {
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  gasUsed: bigint;
  creationFee: bigint;
}

@Injectable()
export class DeployerService {
  private readonly logger = new Logger(DeployerService.name);
  private walletClient: any;
  private publicClient: any;
  private account: any;
  private tokenFactoryAddress: string;

  constructor() {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      this.logger.warn('DEPLOYER_PRIVATE_KEY not set — agent launches disabled');
      return;
    }

    this.account = privateKeyToAccount(privateKey);
    this.tokenFactoryAddress = (
      process.env.ARC_TOKEN_FACTORY_ADDRESS || '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b'
    ).toLowerCase();

    const transport = fallback(RPC_URLS.map((url: string) => http(url)));

    this.walletClient = createWalletClient({
      account: this.account,
      chain: arcTestnet,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport,
    });

    this.logger.log(`Deployer wallet initialized: ${this.account.address}`);
  }

  /** Check if the deployer wallet is configured. */
  isConfigured(): boolean {
    return !!this.account;
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
  ): Promise<LaunchResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured (DEPLOYER_PRIVATE_KEY missing)');
    }

    this.logger.log(`Launching token "${name}" (${symbol}) via deployer wallet`);

    // Submit the createToken transaction.
    const txHash = await this.walletClient.writeContract({
      address: this.tokenFactoryAddress,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name, symbol.toUpperCase(), image, description],
      chain: arcTestnet,
      account: this.account,
    });

    this.logger.log(`createToken tx submitted: ${txHash}`);

    // Wait for receipt to get the deployed addresses and gas used.
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 30_000,
    });

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

    // Get the creation fee from the contract (for accounting).
    const creationFee = await this.publicClient.readContract({
      address: this.tokenFactoryAddress,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'creationFee',
    });

    this.logger.log(
      `Token launched: ${tokenAddress} (curve: ${curveAddress}), gas: ${receipt.gasUsed}`,
    );

    return {
      tokenAddress: tokenAddress.toLowerCase(),
      curveAddress: curveAddress.toLowerCase(),
      txHash: txHash as string,
      gasUsed: receipt.gasUsed,
      creationFee: creationFee as bigint,
    };
  }

  /**
   * Check the deployer wallet's USDC balance (native, 18-dec).
   * Used to monitor if the wallet needs topping up.
   */
  async getBalance(): Promise<bigint> {
    if (!this.isConfigured()) return 0n;
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    return balance;
  }

  /**
   * Approve the TokenFactory to spend USDC on behalf of the deployer wallet.
   * This is a one-time setup step — the TokenFactory pulls the creation fee
   * via transferFrom, so the deployer must approve it first.
   *
   * Uses max uint256 approval so it only needs to be called once.
   * Called via the POST /agents/deployer/approve endpoint (admin-only).
   */
  async approveTokenFactory(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }

    const txHash = await this.walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.tokenFactoryAddress, MAX_UINT256],
      chain: arcTestnet,
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
    if (!this.isConfigured()) return false;

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
    slippageBps: bigint = 500n, // 5% default
  ): Promise<TradeResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }

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

    // Approve USDC to the bonding curve (max approval for simplicity).
    const allowance = await this.publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, curve],
    });

    if ((allowance as bigint) < usdcAmount) {
      const approveTx = await this.walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [curve, MAX_UINT256],
        chain: arcTestnet,
        account: this.account,
      });
      await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1,
        timeout: 30_000,
      });
      this.logger.log(`USDC approved for curve ${curve}`);
    }

    // Execute the buy.
    const buyTx = await this.walletClient.writeContract({
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'buy',
      args: [usdcAmount, minTokensOut],
      chain: arcTestnet,
      account: this.account,
    });

    this.logger.log(`Buy tx submitted: ${buyTx}`);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: buyTx,
      confirmations: 1,
      timeout: 30_000,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Buy transaction reverted (tx: ${buyTx})`);
    }

    this.logger.log(`Buy confirmed, gas: ${receipt.gasUsed}`);

    return {
      txHash: buyTx as string,
      tokenAmount: quote as bigint, // tokens received (approx — actual may differ slightly)
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
    slippageBps: bigint = 500n, // 5% default
  ): Promise<TradeResult> {
    if (!this.isConfigured()) {
      throw new Error('Deployer wallet not configured');
    }

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

    if ((allowance as bigint) < tokenAmount) {
      const approveTx = await this.walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [curve, MAX_UINT256],
        chain: arcTestnet,
        account: this.account,
      });
      await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1,
        timeout: 30_000,
      });
      this.logger.log(`Token approved for curve ${curve}`);
    }

    // Execute the sell.
    const sellTx = await this.walletClient.writeContract({
      address: curve,
      abi: BONDING_CURVE_ABI,
      functionName: 'sell',
      args: [tokenAmount, minUsdcOut],
      chain: arcTestnet,
      account: this.account,
    });

    this.logger.log(`Sell tx submitted: ${sellTx}`);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: sellTx,
      confirmations: 1,
      timeout: 30_000,
    });

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
