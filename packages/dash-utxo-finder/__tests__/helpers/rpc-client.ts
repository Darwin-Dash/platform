/**
 * Dash JSON-RPC Client
 *
 * Direct HTTP-based JSON-RPC implementation for interacting with Dash nodes.
 * Replaces subprocess-based dash-cli with proper HTTP requests.
 *
 * Supports:
 * - Local testnet nodes (localhost RPC)
 * - Remote nodes through SSH tunnels (regtest)
 * - Authentication via Basic auth
 * - Error handling and timeouts
 * - Logging and debugging
 */

/**
 * JSON-RPC 2.0 Request format
 */
interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number | string;
}

/**
 * JSON-RPC 2.0 Response format
 */
interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string;
}

/**
 * RPC Client options
 */
interface RPCClientOptions {
  endpoint: string;
  username?: string;
  password?: string;
  timeout?: number;
  loggerIdentifier?: string;
}

/**
 * Dash JSON-RPC Client
 *
 * Communicates with Dash Core via JSON-RPC 2.0 protocol over HTTP.
 * Handles authentication, error handling, and timeouts.
 */
export class DashRPCClient {
  private endpoint: string;
  private username: string;
  private password: string;
  private timeout: number;
  private loggerIdentifier: string;
  private requestId: number = 0;

  /**
   * Create a new Dash RPC client
   * @param options Configuration options
   */
  constructor(options: RPCClientOptions) {
    this.endpoint = options.endpoint;
    this.username = options.username || '';
    this.password = options.password || '';
    this.timeout = options.timeout || 30000;
    this.loggerIdentifier = options.loggerIdentifier || 'DashRPC';
  }

  /**
   * Private: Log messages with context
   */
  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.loggerIdentifier}]`;

    switch (level) {
      case 'debug':
        console.debug(`${prefix} ${message}`);
        break;
      case 'info':
        console.log(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ❌ ${message}`);
        break;
    }
  }

  /**
   * Private: Create Basic auth header
   */
  private getAuthHeader(): string {
    if (!this.username || !this.password) {
      return '';
    }
    const credentials = `${this.username}:${this.password}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Private: Make a raw JSON-RPC request
   */
  private async makeRequest(method: string, params: any[] = []): Promise<any> {
    const id = ++this.requestId;

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    this.log(`→ ${method}(${params.length} params)`, 'debug');

    try {
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => abortController.abort(), this.timeout);

      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };

        // Add authentication header if credentials provided
        const authHeader = this.getAuthHeader();
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        clearTimeout(timeoutHandle);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = (await response.json()) as JSONRPCResponse;

        // Check for JSON-RPC error
        if (data.error) {
          throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
        }

        if (data.result === undefined) {
          throw new Error('No result in JSON-RPC response');
        }

        this.log(`← ${method} = ${JSON.stringify(data.result).substring(0, 100)}`, 'debug');
        return data.result;
      } catch (error) {
        clearTimeout(timeoutHandle);
        throw error;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes('abort')) {
        throw new Error(`RPC timeout (${this.timeout}ms) calling ${method}`);
      }

      throw new Error(`Failed to call RPC ${method}: ${errorMsg}`);
    }
  }

  /**
   * Public: Generic RPC call method
   *
   * @param method RPC method name
   * @param params RPC method parameters
   * @returns RPC method result
   */
  async call(method: string, ...params: any[]): Promise<any> {
    return this.makeRequest(method, params);
  }

  /**
   * Public: Send funds to an address
   *
   * @param address Dash address to send to
   * @param amount Amount in DASH
   * @returns Transaction ID
   */
  async sendToAddress(address: string, amount: number): Promise<string> {
    return this.call('sendtoaddress', address, amount);
  }

  /**
   * Public: Generate blocks (mine new blocks)
   *
   * For regtest/testnet with functional miner. Uses newly generated address
   * for block rewards to ensure clean state.
   *
   * @param blockCount Number of blocks to generate
   * @returns Array of generated block hashes
   */
  async generateBlocks(blockCount: number): Promise<string[]> {
    // Get a fresh address from the wallet for block generation
    let minerAddress: string;

    try {
      minerAddress = await this.call('getnewaddress');
    } catch (error) {
      this.log('Could not get new address, using fallback', 'warn');
      // For testnet, use a known address if getnewaddress fails
      minerAddress = 'yN5wYJFhF9fWTHvP4pxkD1fj4zVa8tQiZD';
    }

    // Generate to the address
    const blockHashes: string[] = await this.call('generatetoaddress', blockCount, minerAddress);

    if (!Array.isArray(blockHashes)) {
      throw new Error(`generatetoaddress returned non-array: ${typeof blockHashes}`);
    }

    return blockHashes;
  }

  /**
   * Public: Get current block count (chain height)
   *
   * @returns Current block height
   */
  async getBlockCount(): Promise<number> {
    const count: number = await this.call('getblockcount');

    if (typeof count !== 'number') {
      throw new Error(`getblockcount returned non-number: ${typeof count}`);
    }

    return count;
  }

  /**
   * Public: Get wallet balance
   *
   * @returns Total balance in DASH
   */
  async getBalance(): Promise<number> {
    const balance: number = await this.call('getbalance');

    if (typeof balance !== 'number') {
      throw new Error(`getbalance returned non-number: ${typeof balance}`);
    }

    return balance;
  }

  /**
   * Public: Get a new address from wallet
   *
   * @returns New Dash address
   */
  async getNewAddress(): Promise<string> {
    const address: string = await this.call('getnewaddress');

    if (typeof address !== 'string') {
      throw new Error(`getnewaddress returned non-string: ${typeof address}`);
    }

    return address;
  }

  /**
   * Public: Get transaction details
   *
   * @param txid Transaction ID
   * @returns Transaction details object
   */
  async getTransaction(txid: string): Promise<any> {
    return this.call('gettransaction', txid);
  }

  /**
   * Public: Get block details by hash
   *
   * @param blockHash Block hash
   * @returns Block details object
   */
  async getBlockByHash(blockHash: string): Promise<any> {
    return this.call('getblock', blockHash);
  }

  /**
   * Public: Get block details by height
   *
   * @param height Block height
   * @returns Block hash or details depending on verbosity
   */
  async getBlockByHeight(height: number): Promise<any> {
    const blockHash: string = await this.call('getblockhash', height);
    return this.call('getblock', blockHash);
  }

  /**
   * Public: Test RPC connection
   *
   * Verifies that the RPC endpoint is reachable and responding.
   *
   * @returns true if connection successful, throws otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getBlockCount();
      this.log(`✓ Connected to RPC endpoint: ${this.endpoint}`, 'info');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`✗ Failed to connect to RPC: ${msg}`, 'error');
      throw error;
    }
  }

  /**
   * Public: Get endpoint URL
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Public: Set timeout for RPC requests
   */
  setTimeout(timeoutMs: number): void {
    this.timeout = timeoutMs;
  }
}

/**
 * Create and initialize an RPC client
 *
 * Helper function that creates a client and verifies connection.
 *
 * @param options Configuration options
 * @returns Initialized RPC client
 */
export async function createRPCClient(options: RPCClientOptions): Promise<DashRPCClient> {
  const client = new DashRPCClient(options);
  await client.testConnection();
  return client;
}

export type { RPCClientOptions };
