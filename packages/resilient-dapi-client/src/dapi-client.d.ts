/**
 * Type declarations for @dashevo/dapi-client
 */

declare module '@dashevo/dapi-client' {
  export interface DAPIClientConfig {
    network?: 'mainnet' | 'testnet' | 'regtest';
    dapiAddresses?: string[];
    seeds?: string[];
    timeout?: number;
    retries?: number;
    baseBanTime?: number;
  }

  export default class DAPIClient {
    constructor(config: DAPIClientConfig);

    core: {
      getBestBlockHeight(): Promise<number>;
      getBlockchainStatus(): Promise<any>;
      subscribeToTransactionsWithProofs(filter: any, options?: any): Promise<any>;
      subscribeToBlockHeadersWithChainLocks(options?: any): Promise<any>;
      sendRawTransaction(rawTx: string): Promise<string>;
      getTransaction(txid: string): Promise<any>;
      getBlockByHeight(height: number): Promise<any>;
      getBlockByHash(hash: string): Promise<any>;
      getBestBlockHash(): Promise<string>;
      getMasternodeStatus(proTxHash: string): Promise<any>;
      [key: string]: any;
    };

    platform: {
      getIdentity(id: string): Promise<any>;
      getDataContract(id: string): Promise<any>;
      getDocuments(contractId: string, type: string, options?: any): Promise<any>;
      getEpochsInfo(options?: any): Promise<any>;
      broadcastStateTransition(stateTransition: any): Promise<any>;
      waitForStateTransitionResult(hash: string, options?: any): Promise<any>;
      getIdentityNonce(identityId: string, options?: any): Promise<any>;
      [key: string]: any;
    };

    [key: string]: any;
  }
}
