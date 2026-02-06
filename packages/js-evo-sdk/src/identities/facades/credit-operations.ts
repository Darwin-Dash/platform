/**
 * CreditOperations Facade - Identity credit transfer and withdrawal
 *
 * Provides operations for:
 * - Transferring credits between identities
 * - Withdrawing credits to blockchain addresses
 *
 * No dependencies on wallet-lib or stateful components.
 */

import * as wasm from '../../wasm.js';
import { asJsonString } from '../../util.js';
import type { EvoSDK } from '../../sdk.js';
import { createLogger } from '../utils/identity-logger.js';

const logger = createLogger('CreditOperations');

export class CreditOperations {
  constructor(private sdk: EvoSDK) {}

  /**
   * Transfer credits from one identity to another
   *
   * @param senderId ID of identity sending credits (Base58)
   * @param recipientId ID of identity receiving credits (Base58)
   * @param amount Amount of credits to transfer (in duffs)
   * @param privateKeyWif Private key (WIF format) for signing the transfer
   * @param keyId (optional) Specific key ID to use for signing (default: uses first available)
   * @returns Transfer result with transaction ID and new balances
   * @throws Error if transfer fails or parameters invalid
   *
   * @example
   * ```typescript
   * const result = await creditOps.creditTransfer({
   *   senderId: 'identityId1',
   *   recipientId: 'identityId2',
   *   amount: 100000,
   *   privateKeyWif: 'privateKey...'
   * });
   * ```
   */
  async creditTransfer(args: {
    senderId: string;
    recipientId: string;
    amount: number | bigint | string;
    privateKeyWif: string;
    keyId?: number;
  }): Promise<any> {
    const { senderId, recipientId, amount, privateKeyWif, keyId } = args;

    // Validation
    if (!senderId) {
      throw new Error('Sender identity ID is required');
    }

    if (!recipientId) {
      throw new Error('Recipient identity ID is required');
    }

    if (senderId === recipientId) {
      throw new Error('Cannot transfer credits to the same identity');
    }

    // Validate amount
    const numAmount = this.validateAmount(amount, 'transfer');

    if (!privateKeyWif) {
      throw new Error('Private key (WIF) is required for signing');
    }

    try {
      logger.info(
        `Transferring ${numAmount} credits from ${senderId} to ${recipientId}` +
          (keyId !== undefined ? ` (keyId: ${keyId})` : '')
      );

      const w = await this.sdk.getWasmSdkConnected();
      const result = await w.identityCreditTransfer(
        senderId,
        recipientId,
        BigInt(numAmount),
        privateKeyWif,
        keyId ?? null
      );

      logger.info(`Credit transfer successful: ${numAmount} duffs transferred`);
      return result;
    } catch (error) {
      logger.error(`Credit transfer failed (${senderId} → ${recipientId}):`, error);
      throw new Error(`Credit transfer failed: ${(error as Error).message}`);
    }
  }

  /**
   * Withdraw credits from an identity to a blockchain address
   *
   * Converts identity credits back to blockchain funds at the specified address.
   *
   * @param identityId ID of identity to withdraw from (Base58)
   * @param toAddress Blockchain address to receive withdrawn funds
   * @param amount Amount of credits to withdraw (in duffs)
   * @param privateKeyWif Private key (WIF format) for signing the withdrawal
   * @param coreFeePerByte (optional) Core fee per byte for transaction (default: 1)
   * @param keyId (optional) Specific key ID to use for signing (default: uses first available)
   * @returns Withdrawal result with transaction ID and new balance
   * @throws Error if withdrawal fails or parameters invalid
   *
   * @example
   * ```typescript
   * const result = await creditOps.creditWithdrawal({
   *   identityId: 'identityId...',
   *   toAddress: 'yXxxx...',
   *   amount: 100000,
   *   privateKeyWif: 'privateKey...',
   *   coreFeePerByte: 1
   * });
   * ```
   */
  async creditWithdrawal(args: {
    identityId: string;
    toAddress: string;
    amount: number | bigint | string;
    privateKeyWif: string;
    coreFeePerByte?: number;
    keyId?: number;
  }): Promise<any> {
    const { identityId, toAddress, amount, privateKeyWif, coreFeePerByte = 1, keyId } = args;

    // Validation
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    if (!toAddress) {
      throw new Error('Withdrawal address is required');
    }

    // Validate amount
    const numAmount = this.validateAmount(amount, 'withdrawal');

    if (!privateKeyWif) {
      throw new Error('Private key (WIF) is required for signing');
    }

    if (typeof coreFeePerByte !== 'number' || coreFeePerByte < 0) {
      throw new Error(
        `Invalid coreFeePerByte: ${coreFeePerByte}. Must be a non-negative number`
      );
    }

    try {
      logger.info(
        `Withdrawing ${numAmount} credits from ${identityId} to ${toAddress}` +
          (keyId !== undefined ? ` (keyId: ${keyId})` : '')
      );

      const w = await this.sdk.getWasmSdkConnected();
      const result = await w.identityCreditWithdrawal(
        identityId,
        toAddress,
        BigInt(numAmount),
        coreFeePerByte ?? null,
        privateKeyWif,
        keyId ?? null
      );

      logger.info(`Credit withdrawal successful: ${numAmount} duffs withdrawn`);
      return result;
    } catch (error) {
      logger.error(`Credit withdrawal failed (${identityId} → ${toAddress}):`, error);
      throw new Error(`Credit withdrawal failed: ${(error as Error).message}`);
    }
  }

  /**
   * Validate amount parameter
   * Ensures amount is a valid number in the acceptable range
   *
   * @param amount Amount to validate
   * @param operation Operation name for error messages
   * @returns Validated amount as number
   * @throws Error if amount is invalid
   */
  private validateAmount(amount: number | bigint | string, operation: string): number {
    let numAmount: number;

    try {
      if (typeof amount === 'bigint') {
        numAmount = Number(amount);
      } else if (typeof amount === 'string') {
        numAmount = parseInt(amount, 10);
      } else {
        numAmount = amount;
      }
    } catch (error) {
      throw new Error(`Invalid amount: ${amount}. Must be a valid number`);
    }

    if (!Number.isInteger(numAmount) || numAmount < 0) {
      throw new Error(
        `Invalid amount for ${operation}: ${numAmount}. Must be a non-negative integer`
      );
    }

    // Check reasonable bounds (0 to 100 billion duffs)
    const MAX_AMOUNT = 100_000_000_000; // 100 billion duffs = 1 million DASH
    if (numAmount > MAX_AMOUNT) {
      throw new Error(
        `Amount exceeds maximum: ${numAmount} > ${MAX_AMOUNT}. Maximum is 100 billion duffs`
      );
    }

    return numAmount;
  }
}
