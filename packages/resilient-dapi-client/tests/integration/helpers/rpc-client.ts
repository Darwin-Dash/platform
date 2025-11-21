/**
 * Dash Core RPC Client for Integration Tests
 *
 * Provides utilities for interacting with local Dash Core node
 * to broadcast transactions and generate blocks for testing.
 */

export interface RPCConfig {
  url: string;
  user: string;
  pass: string;
  wallet?: string;
}

export interface TransactionInfo {
  txid: string;
  size: number;
  vsize: number;
  version: number;
  locktime: number;
  vin: any[];
  vout: any[];
  hex: string;
}

export interface BlockchainInfo {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  chainwork: string;
  pruned: boolean;
}

/**
 * Simple RPC client for Dash Core
 */
export class DashRPCClient {
  private authHeader: string;

  constructor(private config: RPCConfig) {
    this.authHeader = 'Basic ' + Buffer.from(
      `${config.user}:${config.pass}`
    ).toString('base64');
  }

  /**
   * Make RPC request
   */
  private async request<T>(method: string, params: any[] = []): Promise<T> {
    const walletPath = this.config.wallet ? `/wallet/${this.config.wallet}` : '';
    const url = `${this.config.url}${walletPath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: `test-${Date.now()}`,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * Get blockchain info
   */
  async getBlockchainInfo(): Promise<BlockchainInfo> {
    return this.request<BlockchainInfo>('getblockchaininfo');
  }

  /**
   * Get current block count
   */
  async getBlockCount(): Promise<number> {
    return this.request<number>('getblockcount');
  }

  /**
   * Get best block hash
   */
  async getBestBlockHash(): Promise<string> {
    return this.request<string>('getbestblockhash');
  }

  /**
   * Generate blocks (regtest only)
   */
  async generateBlocks(count: number, address?: string): Promise<string[]> {
    if (!address) {
      address = await this.getNewAddress();
    }
    return this.request<string[]>('generatetoaddress', [count, address]);
  }

  /**
   * Get new address from wallet
   */
  async getNewAddress(label?: string): Promise<string> {
    return this.request<string>('getnewaddress', label ? [label] : []);
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<number> {
    return this.request<number>('getbalance');
  }

  /**
   * Send to address
   */
  async sendToAddress(
    address: string,
    amount: number,
    comment?: string
  ): Promise<string> {
    const params = [address, amount];
    if (comment) {
      params.push(comment);
    }
    return this.request<string>('sendtoaddress', params);
  }

  /**
   * Get raw transaction
   */
  async getRawTransaction(txid: string, verbose = true): Promise<TransactionInfo | string> {
    return this.request<TransactionInfo | string>('getrawtransaction', [txid, verbose]);
  }

  /**
   * Send raw transaction
   */
  async sendRawTransaction(hexString: string): Promise<string> {
    return this.request<string>('sendrawtransaction', [hexString]);
  }

  /**
   * Get transaction (from wallet)
   */
  async getTransaction(txid: string): Promise<any> {
    return this.request<any>('gettransaction', [txid]);
  }

  /**
   * List unspent transaction outputs
   */
  async listUnspent(minConf = 0, maxConf = 9999999): Promise<any[]> {
    return this.request<any[]>('listunspent', [minConf, maxConf]);
  }

  /**
   * Import address to wallet (watch-only)
   */
  async importAddress(address: string, label?: string, rescan = false): Promise<void> {
    await this.request<void>('importaddress', [address, label || '', rescan]);
  }

  /**
   * Validate address
   */
  async validateAddress(address: string): Promise<any> {
    return this.request<any>('validateaddress', [address]);
  }

  /**
   * Get mempool info
   */
  async getMempoolInfo(): Promise<any> {
    return this.request<any>('getmempoolinfo');
  }

  /**
   * Get raw mempool
   */
  async getRawMempool(verbose = false): Promise<any> {
    return this.request<any>('getrawmempool', [verbose]);
  }

  /**
   * Ping RPC server
   */
  async ping(): Promise<void> {
    await this.request<void>('ping');
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getBlockCount();
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Create RPC client from config
 */
export function createRPCClient(config: RPCConfig): DashRPCClient {
  return new DashRPCClient(config);
}

/**
 * Wait for transaction to appear in mempool
 */
export async function waitForTransaction(
  rpc: DashRPCClient,
  txid: string,
  timeoutMs = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const mempool = await rpc.getRawMempool(false) as string[];
      if (mempool.includes(txid)) {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  rpc: DashRPCClient,
  txid: string,
  confirmations = 1,
  timeoutMs = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const tx = await rpc.getTransaction(txid);
      if (tx.confirmations >= confirmations) {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return false;
}

/**
 * Ensure wallet has sufficient balance
 */
export async function ensureBalance(
  rpc: DashRPCClient,
  minBalance: number,
  address?: string
): Promise<void> {
  const balance = await rpc.getBalance();

  if (balance < minBalance) {
    // Generate blocks to fund wallet (regtest only)
    const blocksNeeded = Math.ceil((minBalance - balance) / 50); // 50 DASH per block
    await rpc.generateBlocks(blocksNeeded + 100, address); // +100 for maturity
  }
}
