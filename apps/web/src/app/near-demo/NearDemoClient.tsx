'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { NearConnector } from '@hot-labs/near-connect';

type Wallet = {
  accountId: string;
  signAndSendTransaction: (args: {
    receiverId: string;
    actions: { type: 'FunctionCall'; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }[];
  }) => Promise<unknown>;
  signOut: () => Promise<void>;
};
type Token = {
  account_id: string;
  name: string;
  symbol: string;
  real_usdc: string;
  cumulative_volume_usdc: string;
  tokens_sold: string;
  reserved_remaining: string;
  treasury_pool: string;
  treasury_unlocked: string;
  treasury_claimed: string;
  treasury_recipient: string;
  milestones_completed: number;
  graduated: boolean;
  preset: { thresholds: string[]; burn_bps: number[]; treasury_unlock_bps: number[] };
};

const api = process.env.NODE_ENV === 'development'
  ? process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001'
  : '';
const apiUnavailableNotice = 'Token data is temporarily unavailable.';
const launchpad = process.env.NEXT_PUBLIC_NEAR_LAUNCHPAD_ID || '';
const usdc = process.env.NEXT_PUBLIC_NEAR_USDC_ID || '';
const rpcUrl = process.env.NEXT_PUBLIC_NEAR_RPC_URL || 'https://near-testnet.drpc.org';
const explorerUrl = 'https://testnet.nearblocks.io';
const card = 'card';

async function viewContract<T>(contractId: string, methodName: string, args: Record<string, unknown>): Promise<T> {
  const argsBase64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(args))));
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'orba-view', method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: methodName, args_base64: argsBase64 } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error || !Array.isArray(payload.result?.result)) {
    throw new Error(payload.error?.message || 'Contract view call failed');
  }
  return JSON.parse(new TextDecoder().decode(new Uint8Array(payload.result.result))) as T;
}

export default function NearDemoClient({ mode = 'demo', tokenId = '' }: { mode?: 'demo' | 'launch' | 'trade'; tokenId?: string }) {
  const [walletSlot, setWalletSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setWalletSlot(document.getElementById('near-wallet-slot')); }, []);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const accountRef = useRef('');
  const walletBusyRef = useRef(false);
  const reconcilingRef = useRef(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const connectorRef = useRef<NearConnector | null>(null);
  const connectorInitRef = useRef<Promise<NearConnector> | null>(null);
  const [selected, setSelected] = useState(tokenId);
  const [balance, setBalance] = useState('—');
  const [tokenBalance, setTokenBalance] = useState('—');
  const [sellerClaimable, setSellerClaimable] = useState('0');
  const [claimableViewAvailable, setClaimableViewAvailable] = useState(true);
  const [tokenStorageRegistered, setTokenStorageRegistered] = useState(false);
  const [usdcStorageRegistered, setUsdcStorageRegistered] = useState(false);
  const [name, setName] = useState(mode === 'demo' ? 'Orba Demo' : '');
  const [symbol, setSymbol] = useState(mode === 'demo' ? 'ORBA' : '');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [lastTransaction, setLastTransaction] = useState('');
  const [launchSigner, setLaunchSigner] = useState('');
  const [recipient, setRecipient] = useState('');
  const [preset, setPreset] = useState('spark');
  const [amount, setAmount] = useState('1');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (mode === 'launch') return;
    try {
      const path = mode === 'trade' ? `/api/tokens/${encodeURIComponent(tokenId)}` : '/api/tokens';
      const response = await fetch(`${api}${path}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Token API returned ${response.status}`);
      const data = await response.json();
      const items: Token[] = mode === 'trade' ? [data] : data.items || [];
      setTokens(items);
      setSelected((current) => current || items[0]?.account_id || '');
      setNotice((current) => current === apiUnavailableNotice ? '' : current);
    } catch {
      setNotice(apiUnavailableNotice);
    }
  }

  async function syncIndexer(result: unknown, signerId: string) {
    try {
      const outcome = result as { transaction?: { hash?: unknown }; status?: { Failure?: unknown } } | null;
      if (outcome?.status?.Failure) return null;
      const hash = outcome?.transaction?.hash;
      if (typeof hash === 'string') {
        setLastTransaction(hash);
        const response = await fetch(`${api}/api/indexer/transaction`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tx_hash: hash, signer_id: signerId }),
        });
        if (response.ok) return await response.json() as { created_token?: string | null };
      }
      await fetch(`${api}/api/indexer/sync`, { method: 'POST' });
    } catch {
      // The daily Vercel cron remains the fallback when on-demand sync is unavailable.
    }
    return null;
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requestedToken = new URLSearchParams(window.location.search).get('token');
    if (mode === 'demo' && requestedToken) setSelected(requestedToken);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    async function refreshWalletData() {
      if (!account || !usdc) {
        setBalance('—');
        setTokenBalance('—');
        setSellerClaimable('0');
        setClaimableViewAvailable(true);
        setUsdcStorageRegistered(false);
        setTokenStorageRegistered(false);
        return;
      }
      try {
        const [usdcBalance, tokenUnits, claimable, usdcStorage, tokenStorage] = await Promise.all([
          viewContract<string>(usdc, 'ft_balance_of', { account_id: account }),
          selected ? viewContract<string>(selected, 'ft_balance_of', { account_id: account }) : Promise.resolve('0'),
          viewContract<string>(launchpad, 'get_seller_claimable', { account_id: account }).catch(() => null),
          viewContract<{ total: string } | null>(usdc, 'storage_balance_of', { account_id: account }),
          selected ? viewContract<{ total: string } | null>(selected, 'storage_balance_of', { account_id: account }) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setBalance((Number(usdcBalance) / 1e6).toFixed(2));
        setTokenBalance((Number(tokenUnits) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 }));
        setClaimableViewAvailable(claimable !== null);
        if (claimable !== null) setSellerClaimable(claimable);
        setUsdcStorageRegistered(usdcStorage !== null);
        setTokenStorageRegistered(tokenStorage !== null);
      } catch {
        if (!cancelled) {
          setBalance('Unavailable');
          setTokenBalance('Unavailable');
          setUsdcStorageRegistered(false);
          setTokenStorageRegistered(false);
        }
      }
    }
    void refreshWalletData();
    return () => { cancelled = true; };
  }, [account, selected]);

  function setConnectedWallet(connector: NearConnector, selectedWallet: Awaited<ReturnType<NearConnector['wallet']>>, accountId: string) {
    accountRef.current = accountId;
    setAccount(accountId);
    setWallet({
      accountId,
      signOut: () => connector.disconnect(selectedWallet),
      signAndSendTransaction: ({ receiverId, actions }) => selectedWallet.signAndSendTransaction({
        receiverId,
        actions: actions.map((action) => ({
          enum: 'functionCall',
          functionCall: {
            methodName: action.params.methodName,
            args: new TextEncoder().encode(JSON.stringify(action.params.args)),
            gas: BigInt(action.params.gas),
            deposit: BigInt(action.params.deposit),
          },
        })),
      }),
    });
  }

  function getConnector() {
    if (connectorRef.current) return Promise.resolve(connectorRef.current);
    if (!connectorInitRef.current) {
      connectorInitRef.current = import('@hot-labs/near-connect').then(({ NearConnector }) => {
        const connector = new NearConnector({ network: 'testnet', autoConnect: false });
        connector.on('wallet:signIn', ({ wallet: selectedWallet, accounts }) => {
          const signedIn = accounts[0];
          if (signedIn) setConnectedWallet(connector, selectedWallet, signedIn.accountId);
        });
        connector.on('wallet:signOut', () => {
          accountRef.current = '';
          setWallet(null);
          setAccount('');
        });
        connectorRef.current = connector;
        return connector;
      }).finally(() => { connectorInitRef.current = null; });
    }
    return connectorInitRef.current;
  }

  useEffect(() => {
    let cancelled = false;
    let removeFocusListeners = () => {};
    void getConnector().then(async (connector) => {
      await connector.whenManifestLoaded;
      if (cancelled) return;
      const reconcileWallet = async () => {
        if (cancelled || walletBusyRef.current || reconcilingRef.current) return;
        reconcilingRef.current = true;
        try {
          const { wallet: selectedWallet, accounts } = await connector.getConnectedWallet();
          if (accounts[0]) {
            setConnectedWallet(connector, selectedWallet, accounts[0].accountId);
            return;
          }
          throw new Error('No connected account');
        } catch {
          if (cancelled) return;
          const hadAccount = Boolean(accountRef.current);
          accountRef.current = '';
          setWallet(null);
          setAccount('');
          if (hadAccount) setNotice('NEAR wallet session ended. Reconnect your testnet wallet to continue.');
        } finally {
          reconcilingRef.current = false;
        }
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') void reconcileWallet();
      };
      window.addEventListener('focus', reconcileWallet);
      document.addEventListener('visibilitychange', onVisibilityChange);
      removeFocusListeners = () => {
        window.removeEventListener('focus', reconcileWallet);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
      try {
        const { wallet: selectedWallet, accounts } = await connector.getConnectedWallet();
        if (!cancelled && accounts[0]) setConnectedWallet(connector, selectedWallet, accounts[0].accountId);
      } catch {
        // No previously connected testnet wallet is a normal first-visit state.
      }
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not load NEAR wallets.');
    });
    return () => { cancelled = true; removeFocusListeners(); };
  }, []);

  async function connect() {
    walletBusyRef.current = true;
    setWalletBusy(true);
    setNotice('Loading NEAR testnet wallets…');
    try {
      const connector = await getConnector();
      await connector.whenManifestLoaded;
      await connector.connect();
      setNotice('NEAR testnet wallet connected.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Wallet connection failed.');
    } finally {
      walletBusyRef.current = false;
      setWalletBusy(false);
    }
  }

  async function disconnect() {
    if (!wallet) return;
    walletBusyRef.current = true;
    setWalletBusy(true);
    try {
      await wallet.signOut();
      setNotice('Wallet disconnected.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Wallet disconnect failed.');
    } finally {
      walletBusyRef.current = false;
      setWalletBusy(false);
    }
  }

  async function call(methodName: string, args: Record<string, unknown>, deposit = '0') {
    if (!wallet || !launchpad) {
      setNotice('Connect a NEAR testnet wallet and configure the launchpad account.');
      return;
    }
    walletBusyRef.current = true;
    setBusy(true);
    setNotice('Confirm the transaction in your NEAR wallet…');
    try {
      const result = await wallet.signAndSendTransaction({ receiverId: launchpad, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '150000000000000', deposit } }] });
      setNotice('Transaction submitted. Waiting for finalized indexer data…');
      const indexed = await syncIndexer(result, wallet.accountId);
      if (methodName === 'create_token' && indexed?.created_token) {
        setCreatedToken(indexed.created_token);
        setNotice('Token launched. Your market page is ready.');
      }
      if (methodName === 'create_token') setLaunchSigner(wallet.accountId);
      await Promise.all([load(), refreshWalletData()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transaction failed.');
    } finally {
      walletBusyRef.current = false;
      setBusy(false);
    }
  }

  async function refreshWalletData() {
    if (!account || !usdc) return;
    try {
      const [usdcBalance, tokenUnits, claimable, usdcStorage, tokenStorage] = await Promise.all([
        viewContract<string>(usdc, 'ft_balance_of', { account_id: account }),
        selected ? viewContract<string>(selected, 'ft_balance_of', { account_id: account }) : Promise.resolve('0'),
        viewContract<string>(launchpad, 'get_seller_claimable', { account_id: account }).catch(() => null),
        viewContract<{ total: string } | null>(usdc, 'storage_balance_of', { account_id: account }),
        selected ? viewContract<{ total: string } | null>(selected, 'storage_balance_of', { account_id: account }) : Promise.resolve(null),
      ]);
      setBalance((Number(usdcBalance) / 1e6).toFixed(2));
      setTokenBalance((Number(tokenUnits) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 }));
      setClaimableViewAvailable(claimable !== null);
      if (claimable !== null) setSellerClaimable(claimable);
      setUsdcStorageRegistered(usdcStorage !== null);
      setTokenStorageRegistered(tokenStorage !== null);
    } catch {
      setNotice('Wallet is connected, but one or more on-chain balances could not be refreshed.');
    }
  }

  async function registerStorage(contractId: string) {
    if (!wallet || !account || !contractId) {
      setNotice('Connect a wallet and choose a configured token contract.');
      return;
    }
    walletBusyRef.current = true;
    setBusy(true);
    try {
      const bounds = await viewContract<{ min: string }>(contractId, 'storage_balance_bounds', {});
      await wallet.signAndSendTransaction({ receiverId: contractId, actions: [{ type: 'FunctionCall', params: { methodName: 'storage_deposit', args: { account_id: account, registration_only: true }, gas: '30000000000000', deposit: bounds.min } }] });
      setNotice('Storage registration submitted. Refreshing wallet status…');
      await refreshWalletData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Storage registration failed.');
    } finally {
      walletBusyRef.current = false;
      setBusy(false);
    }
  }

  async function create() {
    const fixedRecipient = recipient.trim() || (mode === 'launch' ? account : '');
    if (!fixedRecipient) {
      setNotice('Set the fixed treasury recipient first.');
      return;
    }
    const utf8Length = (value: string) => new TextEncoder().encode(value).length;
    if (!name.trim() || !symbol.trim() || utf8Length(name.trim()) > 64 || utf8Length(symbol.trim()) > 16) {
      setNotice('Enter a token name and symbol within the size limits.');
      return;
    }
    if (imageUrl.trim()) {
      try {
        const url = new URL(imageUrl.trim());
        if (url.protocol !== 'https:' || url.username || url.password || imageUrl.trim().length > 500) throw new Error();
      } catch {
        setNotice('Enter a public HTTPS image URL.');
        return;
      }
    }
    setCreatedToken('');
    setLastTransaction('');
    setLaunchSigner('');
    await call('create_token', {
      name: name.trim(), symbol: symbol.trim(), treasury_recipient: fixedRecipient, preset_name: preset,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
    }, '4000000000000000000000000');
  }

  async function trade(side: 'buy' | 'sell') {
    if (!wallet || !selected || !usdc) {
      setNotice('Configure the USDC contract, select a token, and connect a wallet.');
      return;
    }
    if (mode === 'demo' && side === 'buy' && (!usdcStorageRegistered || !tokenStorageRegistered)) {
      setNotice('Register USDC and this token’s storage before buying.');
      return;
    }
    let rawAmount: bigint;
    try {
      rawAmount = parseUnits(amount, side === 'buy' ? 6 : 18);
    } catch {
      setNotice(`Enter a valid ${side === 'buy' ? 'USDC' : 'token'} amount with no more than ${side === 'buy' ? 6 : 18} decimals.`);
      return;
    }
    if (rawAmount <= 0n) {
      setNotice('Enter an amount above zero.');
      return;
    }
    walletBusyRef.current = true;
    setBusy(true);
    setNotice('Checking quote…');
    try {
      const quoted = await viewContract<string>(launchpad, side === 'buy' ? 'quote_buy' : 'quote_sell', side === 'buy' ? { token_id: selected, usdc_amount: rawAmount.toString() } : { token_id: selected, token_amount: rawAmount.toString() });
      if (BigInt(quoted) <= 0n) throw new Error('This amount is too small to trade.');
      if (mode === 'trade') {
        const inputToken = side === 'buy' ? usdc : selected;
        const available = await viewContract<string>(inputToken, 'ft_balance_of', { account_id: account });
        if (BigInt(available) < rawAmount) throw new Error('Insufficient token balance.');
        for (const contractId of side === 'buy' ? [usdc, selected] : [usdc]) {
          const args = { account_id: account };
          if (await viewContract(contractId, 'storage_balance_of', args)) continue;
          const bounds = await viewContract<{ min: string }>(contractId, 'storage_balance_bounds', {});
          setNotice(`Approve storage registration for ${contractId === usdc ? 'USDC' : 'this token'} in your wallet.`);
          await wallet.signAndSendTransaction({ receiverId: contractId, actions: [{ type: 'FunctionCall', params: { methodName: 'storage_deposit', args: { ...args, registration_only: true }, gas: '30000000000000', deposit: bounds.min } }] });
          if (!await viewContract(contractId, 'storage_balance_of', args)) throw new Error('Storage registration has not settled. Check your wallet before retrying.');
        }
      }
      const minimumOut = (BigInt(quoted) * 9_900n / 10_000n).toString();
      const message = side === 'buy' ? { action: 'buy', token_id: selected, min_tokens_out: minimumOut } : { action: 'sell', token_id: selected, min_usdc_out: minimumOut };
      setNotice(`Estimated receive: ${(Number(quoted) / (side === 'buy' ? 1e18 : 1e6)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${side === 'buy' ? token?.symbol ?? 'tokens' : 'USDC'}. Confirm in your wallet.`);
      const result = await wallet.signAndSendTransaction({ receiverId: side === 'buy' ? usdc : selected, actions: [{ type: 'FunctionCall', params: { methodName: 'ft_transfer_call', args: { receiver_id: launchpad, amount: rawAmount.toString(), msg: JSON.stringify(message) }, gas: side === 'buy' ? '250000000000000' : '150000000000000', deposit: '1' } }] });
      setNotice(side === 'buy' ? 'Buy submitted. Refreshing indexed data…' : 'Sell submitted. Claim the resulting USDC proceeds after it finalizes.');
      const indexed = await syncIndexer(result, wallet.accountId);
      if (indexed) setNotice(side === 'buy' ? 'Buy confirmed and indexed.' : 'Sell confirmed. Your USDC proceeds are available to claim.');
      await Promise.all([load(), refreshWalletData()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Trade failed.');
    } finally {
      walletBusyRef.current = false;
      setBusy(false);
    }
  }

  const token = tokens.find((item) => item.account_id === selected);
  const explorer = token ? `${explorerUrl}/address/${token.account_id}` : '';
  const claimableUsdc = Number(sellerClaimable) / 1e6;
  const walletButton = <button type="button" className="btn-primary" disabled={walletBusy || busy}
    onClick={() => void (account ? disconnect() : connect())}>
    {walletBusy ? 'Updating wallet…' : account ? 'Disconnect wallet' : 'Connect NEAR wallet'}
  </button>;
  const txLink = lastTransaction && <a className="text-sm text-accent-blue" href={`${explorerUrl}/txns/${lastTransaction}`} target="_blank" rel="noreferrer">View transaction</a>;

  if (mode === 'launch') return <main className="mx-auto max-w-3xl px-5 py-12">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-4xl">Launch a token</h1>{walletButton}
    </div>
    <form className="card grid gap-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label>Token name<input className="input mt-1 w-full" required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Ticker<input className="input mt-1 w-full" required maxLength={16} value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
      <label>Description <span className="text-text-secondary">(optional)</span><textarea className="input mt-1 w-full" maxLength={280} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Image URL <span className="text-text-secondary">(optional)</span><input className="input mt-1 w-full" type="url" placeholder="https://" maxLength={500} value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
      <label>Treasury recipient<input className="input mt-1 w-full" placeholder={account || 'Defaults to your connected account'} value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
      <label>Milestone preset<select className="input mt-1 w-full" value={preset} onChange={(event) => setPreset(event.target.value)}>
        <option value="spark">Spark · 10 / 50 / 150 USDC</option><option value="momentum">Momentum · 25 / 100 / 500 USDC</option><option value="marathon">Marathon · 100 / 500 / 2,500 USDC</option>
      </select></label>
      <button className="btn-primary disabled:opacity-40" disabled={!account || busy || !launchpad || (!!lastTransaction && !createdToken)}>{busy ? 'Waiting for launch…' : 'Launch on NEAR testnet'}</button>
      <p className="text-sm text-text-secondary">Launch attaches 4 testnet NEAR for account creation and storage. Unused deposit is refunded.</p>
      {notice && <p role="status">{notice}</p>}
      {createdToken && <Link className="text-accent-blue" href={`/token/${encodeURIComponent(createdToken)}`}>Open your token page</Link>}
      {lastTransaction && launchSigner && !createdToken && <button type="button" className="btn-secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        const indexed = await syncIndexer({ transaction: { hash: lastTransaction } }, launchSigner);
        if (indexed?.created_token) setCreatedToken(indexed.created_token);
        setNotice(indexed?.created_token ? 'Token launched. Your market page is ready.' : 'Token page is not indexed yet. Check the transaction before launching again.');
        setBusy(false);
      }}>Refresh launch result</button>}
      {txLink}
    </form>
  </main>;

  if (mode === 'trade') return <section className="card mt-8 space-y-4" id="trade">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Trade {token?.symbol}</h2>{walletButton}</div>
    {account && <p className="break-all text-sm text-text-secondary">{account} · {balance} USDC · {tokenBalance} {token?.symbol}</p>}
    {token?.graduated ? <p>Bonding curve trading has ended for this token.</p> : <>
      <label className="block">Amount <span className="text-sm text-text-secondary">(USDC to buy, tokens to sell)</span>
        <input className="input mt-1 w-full" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary disabled:opacity-40" disabled={!account || !token || busy} onClick={() => void trade('buy')}>Buy {amount} USDC</button>
        <button className="btn-secondary disabled:opacity-40" disabled={!account || !token || busy} onClick={() => void trade('sell')}>Sell {amount} {token?.symbol}</button>
      </div>
      <p className="text-sm text-text-secondary">Trades use a fresh quote with 1% slippage protection. Your wallet may first ask you to register storage.</p>
    </>}
    {account && claimableUsdc > 0 && <button className="btn-secondary" disabled={busy} onClick={() => void call('claim_sell_proceeds', {})}>Claim {claimableUsdc.toFixed(6)} USDC proceeds</button>}
    {token && account === token.treasury_recipient && BigInt(token.treasury_unlocked) > BigInt(token.treasury_claimed) &&
      <button className="btn-secondary" disabled={busy} onClick={() => void call('claim_treasury', { token_id: token.account_id })}>Claim treasury</button>}
    {notice && <p role="status">{notice}</p>}
    {txLink}
  </section>;

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 text-text-primary md:px-8">
    {walletSlot && createPortal(
      <button type="button" className="btn-primary px-3 py-2 text-xs whitespace-nowrap disabled:cursor-wait disabled:opacity-60" onClick={account ? () => void disconnect() : () => void connect()} disabled={walletBusy || busy} aria-label={account ? `Disconnect NEAR wallet ${account}` : 'Connect NEAR testnet wallet'} title={account || undefined}>{walletBusy ? (account ? 'Disconnecting…' : 'Connecting…') : account ? `${account.slice(0, 8)}…${account.slice(-8)} · Disconnect` : 'Connect NEAR wallet'}</button>,
      walletSlot,
    )}
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5"><div><h1 className="font-serif text-4xl md:text-6xl">Milestones with consequences.</h1></div></div>
    {notice && <p role="status" className="mb-6 border border-bg-border p-4 text-sm text-text-secondary">{notice}</p>}
    {!launchpad && <p className="mb-6 border border-accent-orange/40 bg-accent-orange/5 p-4 text-sm text-accent-orange">The testnet launchpad is unavailable.</p>}
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className={card}><h2 className="mb-5 text-xl font-semibold">Create token</h2><div className="grid gap-3"><label className="text-sm text-text-secondary">Token name<input className="mt-1 w-full input w-full" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-sm text-text-secondary">Symbol<input className="mt-1 w-full input w-full" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></label><label className="text-sm text-text-secondary">Fixed treasury recipient<input className="mt-1 w-full input w-full" placeholder="recipient.testnet" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label><label className="text-sm text-text-secondary">Milestone preset<select className="mt-1 w-full input w-full" value={preset} onChange={(e) => setPreset(e.target.value)}><option value="spark">Spark · $10 / $50 / $150</option><option value="momentum">Momentum · $25 / $100 / $500</option><option value="marathon">Marathon · $100 / $500 / $2,500</option></select></label><button disabled={busy || !account} onClick={create} className="mt-2 rounded-full bg-accent-green px-5 py-3 font-semibold text-text-primary disabled:opacity-40">Create on testnet</button><p className="text-xs text-text-secondary">No USDC launch fee. Creator attaches 4 NEAR for token storage and account creation; unused amount is refunded.</p></div></section>
      <section className={card}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Mechanics status</h2><button onClick={() => void load()} className="text-sm text-accent-blue">Refresh</button></div><select aria-label="Select token" className="mb-5 w-full input w-full" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose indexed token</option>{tokens.map((t) => <option value={t.account_id} key={t.account_id}>{t.name} ({t.symbol}) · {t.account_id}</option>)}</select>
      {token ? <><div className="grid grid-cols-2 gap-3 text-sm"><Metric label="Cumulative curve volume" value={`${(Number(token.cumulative_volume_usdc) / 1e6).toFixed(2)} USDC`} /><Metric label="Reserved supply left" value={`${(Number(token.reserved_remaining) / 1e24).toFixed(2)}M`} /><Metric label="Treasury unlocked" value={`${(Number(token.treasury_unlocked) / 1e6).toFixed(2)} USDC`} /><Metric label="Treasury claimable" value={`${(Number(token.treasury_unlocked) - Number(token.treasury_claimed)) / 1e6} USDC`} /><Metric label="Treasury claimed" value={`${(Number(token.treasury_claimed) / 1e6).toFixed(2)} USDC`} /><Metric label="Recipient" value={token.treasury_recipient} /><Metric label="Status" value={token.graduated ? 'Graduated · trading locked' : 'Bonding curve active'} /></div><div className="mt-5"><p className="mb-2 text-sm font-medium">Milestones · {token.milestones_completed}/3 complete</p><div className="space-y-2">{token.preset.thresholds.map((threshold, i) => <div key={i} className="flex justify-between border border-bg-border p-3 text-sm"><span>{(Number(threshold) / 1e6).toLocaleString()} USDC cumulative volume</span><span className="text-text-secondary">Burn {token.preset.burn_bps[i] / 100}% · unlock {token.preset.treasury_unlock_bps[i] / 100}%</span></div>)}</div></div><div className="mt-5 flex flex-wrap gap-2"><button disabled={!account || busy || !usdcStorageRegistered || !tokenStorageRegistered} onClick={() => void trade('buy')} className="rounded-full border border-bg-border px-4 py-2 disabled:opacity-40">Buy {amount} USDC</button><button disabled={!account || busy || !tokenStorageRegistered} onClick={() => void trade('sell')} className="rounded-full border border-bg-border px-4 py-2 disabled:opacity-40">Sell {amount} tokens</button><button disabled={!account || account !== token.treasury_recipient || busy || Number(token.treasury_unlocked) <= Number(token.treasury_claimed)} onClick={() => void call('claim_treasury', { token_id: token.account_id })} className="rounded-full bg-accent-green px-4 py-2 font-semibold text-text-primary disabled:opacity-40">Claim treasury</button>{explorer && <a className="px-4 py-2 text-accent-blue" href={explorer} target="_blank" rel="noreferrer">Explorer ↗</a>}</div><p className="mt-3 text-xs text-text-secondary">Token balance: {tokenBalance} {token.symbol}</p></> : <p className="py-12 text-center text-text-secondary">No tokens yet.</p>}</section>
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-2"><section className={card}><h2 className="mb-3 font-semibold">Trading setup</h2><label className="text-sm text-text-secondary">Amount (USDC for buy / token quantity for sell)<input className="mt-1 w-full input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label><div className="mt-4 flex flex-wrap gap-2"><button disabled={!account || !usdc || usdcStorageRegistered || busy} onClick={() => void registerStorage(usdc)} className="rounded-full border border-bg-border px-4 py-2 text-sm disabled:opacity-40">{usdcStorageRegistered ? 'USDC storage registered' : 'Register USDC storage'}</button><button disabled={!account || !selected || tokenStorageRegistered || busy} onClick={() => void registerStorage(selected)} className="rounded-full border border-bg-border px-4 py-2 text-sm disabled:opacity-40">{tokenStorageRegistered ? 'Token storage registered' : 'Register token storage'}</button></div><p className="mt-3 text-xs text-text-secondary">Register storage before receiving USDC or tokens.</p></section><section className={card}><h2 className="mb-3 font-semibold">Wallet & claimable USDC</h2><p className="text-2xl">{balance} <span className="text-sm text-text-secondary">USDC</span></p><p className="mt-3 text-sm">Available to claim: {claimableViewAvailable ? `${claimableUsdc.toFixed(6)} USDC` : 'Check launchpad'}</p><button disabled={!account || busy || (claimableViewAvailable && claimableUsdc <= 0)} onClick={() => void call('claim_sell_proceeds', {})} className="mt-3 rounded-full border border-bg-border px-4 py-2 text-sm disabled:opacity-40">Claim USDC</button><p className="mt-2 text-xs text-text-secondary">Includes sale proceeds and refunds for buys where token delivery did not complete.</p></section></div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 border border-bg-border p-3"><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>; }

function parseUnits(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error('invalid amount');
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(decimals, '0') || '0');
  return whole * 10n ** BigInt(decimals) + fraction;
}
