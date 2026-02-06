/**
 * @dashevo/dash-rpc-client
 *
 * Simple RPC client for Dash Core nodes (testnet/mainnet)
 */

export { DashRpcClient } from './rpc-client.js';
export { TransactionBroadcaster } from './transaction-broadcaster.js';

export type {
  Network,
  RpcClientConfig,
  UTXO,
  TransactionInput,
  TransactionOutputs,
  SignedTransaction,
  BroadcastResult,
  RpcError,
  RpcResponse,
  BlockInfo,
  NetworkInfo,
  WalletInfo,
} from './types.js';
