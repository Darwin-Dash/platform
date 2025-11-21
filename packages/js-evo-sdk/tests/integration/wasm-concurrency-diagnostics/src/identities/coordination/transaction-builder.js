/**
 * TransactionBuilder - Asset Lock Transaction Creation
 *
 * Handles creation and broadcasting of type 8 asset lock transactions.
 * Refactored to work with direct address derivation (no wallet-lib account).
 *
 * CRITICAL: Imports dashcore-lib directly (same instance as facade.ts due to module caching)
 * Static methods like Address.fromString() require the actual class import.
 *
 * Type 8 Structure:
 * - Regular inputs (UTXOs)
 * - OP_RETURN burn output (empty buffer)
 * - AssetLockPayload in extraPayload
 * - Change output (optional)
 */
import dashcoreLib from '@dashevo/dashcore-lib';
const { Transaction, Script, Opcode, Address, PrivateKey } = dashcoreLib;
import { createLogger } from '../utils/identity-logger.js';
const logger = createLogger('TransactionBuilder');
/**
 * TransactionBuilder handles type 8 asset lock transaction creation
 *
 * Uses direct dashcore-lib with explicit UTXO and private key management.
 *
 * Key Responsibilities:
 * - Generate asset lock key pair (for credit output)
 * - Create type 8 transaction structure
 * - Add OP_RETURN burn output
 * - Attach AssetLockPayload
 * - Sign transaction with provided private key
 */
export class TransactionBuilder {
    constructor() {
        // No dependency injection needed - direct imports work due to module caching
    }
    /**
     * Create type 8 asset lock transaction
     *
     * @param options Transaction configuration with explicit UTXO and address
     * @returns Complete transaction with asset lock details
     */
    async createAssetLockTransaction(options) {
        const { amount, utxo, sourceAddress, changeAddress, network = 'testnet' } = options;
        // Step 1: Generate asset lock key pair (one-time use for this identity operation)
        const assetLockPrivateKey = new PrivateKey();
        const assetLockPublicKey = assetLockPrivateKey.toPublicKey();
        const assetLockPrivateKeyWif = assetLockPrivateKey.toWIF();
        // @ts-ignore - toAddress returns Address object
        const assetLockAddressObj = assetLockPublicKey.toAddress(network);
        const assetLockAddress = assetLockAddressObj.toString();
        logger.debug(`Generated asset lock key pair`);
        logger.debug(`   Address: ${assetLockAddress}`);
        // Step 2: Create AssetLockPayload with credit output
        // CRITICAL: Use Address object directly (not string)
        // @ts-ignore - dashcore-lib Script methods
        const realOutput = {
            satoshis: amount,
            // @ts-ignore - dashcore-lib Script methods - pass Address object
            script: Script.buildPublicKeyHashOut(assetLockAddressObj).toString()
        };
        // @ts-ignore - dashcore-lib Transaction.Payload
        const payload = Transaction.Payload.AssetLockPayload.fromJSON({
            version: 1,
            creditOutputs: [{
                    satoshis: realOutput.satoshis,
                    script: realOutput.script
                }]
        });
        if (logger.isDebugEnabled()) {
            logger.debug(`AssetLockPayload created`);
            logger.debug(`   Version: ${payload.version}`);
            logger.debug(`   Credit outputs: ${payload.creditOutputs.length}`);
            logger.debug(`   Output 0 satoshis: ${payload.creditOutputs[0].satoshis}`);
            logger.debug(`   Output 0 script length: ${payload.creditOutputs[0].script.length}`);
        }
        // Step 3: Create UnspentOutput from UTXO
        logger.info(`   Input UTXO: ${utxo.txId}:${utxo.vout} = ${utxo.satoshis} sats`);
        // @ts-ignore - Transaction.UnspentOutput constructor
        const unspentOutput = new Transaction.UnspentOutput({
            txId: utxo.txId,
            outputIndex: utxo.vout,
            address: utxo.address,
            script: utxo.script,
            satoshis: utxo.satoshis
        });
        // Step 4: Create and build transaction
        // @ts-ignore - dashcore-lib Transaction constructor
        const transaction = new Transaction(undefined);
        try {
            // Build type 8 transaction using method chaining
            transaction
                .setType(Transaction.TYPES.TRANSACTION_ASSET_LOCK)
                .from([unspentOutput])
                .addOutput(new Transaction.Output({
                satoshis: amount,
                script: new Script().add(Opcode.OP_RETURN).add(Buffer.alloc(0))
            }))
                .change(changeAddress)
                .setExtraPayload(payload);
        }
        catch (error) {
            logger.error(`Transaction creation failed:`, error);
            throw error;
        }
        logger.info(`   Type: ${transaction.type} (ASSET_LOCK)`);
        logger.info(`   Fee: ${transaction.getFee()} sats`);
        // Step 5: Sign transaction with source address private key
        const signingKey = sourceAddress.privateKey;
        // @ts-ignore - sign method signature
        transaction.sign([signingKey]);
        const transactionId = transaction.id || transaction.hash;
        const transactionHex = transaction.toString();
        const transactionSize = transactionHex.length / 2;
        if (logger.isDebugEnabled()) {
            logger.debug(`Type 8 transaction created:`);
            logger.debug(`   Transaction ID: ${transactionId}`);
            logger.debug(`   Type: ${transaction.type} (ASSET_LOCK)`);
            logger.debug(`   Amount: ${amount} duffs`);
            logger.debug(`   Change: ${changeAddress}`);
            logger.debug(`   Size: ${transactionSize} bytes`);
            logger.debug(`   Hex: ${transactionHex}`);
        }
        logger.info(`   Transaction size: ${transactionSize} bytes`);
        return {
            transaction,
            transactionId,
            transactionHex,
            assetLockPrivateKeyWif,
            assetLockAddress
        };
    }
    /**
     * Broadcast transaction via DAPI
     *
     * Now uses ResilientDAPIClient directly (no wallet-lib account needed).
     * InstantLock monitoring is handled separately by InstantSendChainLockMonitor.
     *
     * @param transactionHex Transaction hex string
     * @param dapiClient DAPI client instance
     * @returns Transaction ID
     */
    async broadcastTransaction(transactionHex, dapiClient) {
        logger.debug(`Broadcasting transaction via DAPI (${transactionHex.length / 2} bytes)...`);
        // Broadcast using ResilientDAPIClient (automatic retry + failover)
        const transactionId = await dapiClient.core.broadcastTransaction(Buffer.from(transactionHex, 'hex'));
        logger.info(`   ✅ Transaction broadcast successful: ${transactionId}`);
        logger.debug('InstantLock monitoring will be handled by InstantSendChainLockMonitor');
        return transactionId;
    }
}
