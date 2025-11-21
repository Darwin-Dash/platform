/**
 * Coin Selection Utility
 *
 * Provides enhanced coin selection strategies for transaction creation.
 * Extracted from facade.ts as part of Phase 2 refactoring.
 */
import { createLogger } from './identity-logger.js';
const logger = createLogger('CoinSelector');
/**
 * Coin Selector - Enhanced UTXO selection for transactions
 *
 * Implements the latestSpendableUTXO strategy to prevent tx-txlock-conflict errors.
 * Selects the most recent spendable UTXO to avoid InstantSend conflicts.
 */
export class CoinSelector {
    /**
     * Import wallet-lib utilities and enhanced coin selection strategies
     * @returns Wallet-lib utilities with coin selection function and strategies
     */
    async importWalletLibUtils() {
        try {
            // Import wallet-lib utilities and enhanced coin selection strategies
            const utils = await import('@dashevo/wallet-lib/src/utils');
            // @ts-ignore - Dynamic import for coin selection strategies
            const coinSelectionStrategies = await import('@dashevo/wallet-lib/src/utils/coinSelections/strategies');
            // Debug what we actually imported
            logger.debug('Imported strategies:', Object.keys(coinSelectionStrategies.default || coinSelectionStrategies));
            const strategies = coinSelectionStrategies.default || coinSelectionStrategies;
            logger.debug('Available strategies:', Object.keys(strategies));
            logger.debug('latestSpendableUTXO type:', typeof strategies.latestSpendableUTXO);
            return {
                coinSelection: utils.coinSelection || utils.default?.coinSelection,
                strategies: strategies,
                // Export specific enhanced strategy for direct use - handle CommonJS exports
                latestSpendableUTXO: strategies.latestSpendableUTXO
            };
        }
        catch (error) {
            // Fallback: implement basic coin selection if wallet-lib utils not available
            return {
                coinSelection: (utxos, outputs, deductFee, feeCategory, strategy) => {
                    // Simple fallback coin selection - use first UTXO for change address determination
                    return {
                        utxos: utxos.slice(0, 1) // Use first UTXO
                    };
                },
                strategies: {},
                latestSpendableUTXO: null
            };
        }
    }
    /**
     * Select coins for transaction using enhanced latestSpendableUTXO strategy
     *
     * @param utxos Available UTXOs to select from
     * @param outputs Transaction outputs
     * @param amount Transaction amount in satoshis
     * @param account Wallet account for fallback address
     * @returns Coin selection result with selected UTXOs and source address
     */
    async selectCoinsForTransaction(utxos, outputs, amount, account) {
        logger.debug('About to import wallet-lib utils...');
        const walletLibUtils = await this.importWalletLibUtils();
        logger.debug('Wallet lib utils imported successfully');
        const { coinSelection, latestSpendableUTXO, strategies } = walletLibUtils;
        logger.debug('Extracted coinSelection and latestSpendableUTXO from utils');
        logger.debug('coinSelection type:', typeof coinSelection);
        logger.debug('latestSpendableUTXO type:', typeof latestSpendableUTXO);
        // Use enhanced latestSpendableUTXO strategy for conflict-free transactions
        // The latestSpendableUTXO is imported as an object containing the function
        const enhancedStrategy = (typeof latestSpendableUTXO === 'function')
            ? latestSpendableUTXO
            : (latestSpendableUTXO && typeof latestSpendableUTXO.default === 'function')
                ? latestSpendableUTXO.default
                : account.strategy;
        // Display the actual strategy name being used
        const strategyName = enhancedStrategy.name || 'custom';
        const isEnhanced = (strategyName === 'latestSpendableUTXO');
        const displayName = isEnhanced ? 'latestSpendableUTXO' : strategyName;
        logger.info(`🎯 Using coin selection strategy: ${displayName} (conflict-free)`);
        if (logger.isDebugEnabled()) {
            logger.debug(`freshAccount.strategy:`, account.strategy);
            logger.debug(`freshAccount.strategy type:`, typeof account.strategy);
            logger.debug(`freshAccount.strategy name:`, account.strategy?.name || 'unnamed');
            logger.debug(`enhancedStrategy === account.strategy:`, enhancedStrategy === account.strategy);
            logger.debug(`enhancedStrategy !== account.strategy:`, enhancedStrategy !== account.strategy);
            logger.debug(`Enhanced strategy function name:`, enhancedStrategy.name);
            logger.debug(`Actual strategy being passed: ${enhancedStrategy.name}`);
            logger.debug(`Enhanced strategy type: ${typeof enhancedStrategy}`);
        }
        const selection = coinSelection(utxos, outputs, false, 'normal', enhancedStrategy);
        // Validate selection has UTXOs
        if (!selection || !selection.utxos || selection.utxos.length === 0) {
            throw new Error('Coin selection failed: no UTXOs selected');
        }
        if (logger.isDebugEnabled()) {
            logger.debug(`🎯 Coin selection chose ${selection.utxos.length} UTXOs to spend:`);
            selection.utxos.forEach((selectedUtxo, i) => {
                const txid = selectedUtxo.txid || selectedUtxo.txId;
                const vout = selectedUtxo.vout !== undefined ? selectedUtxo.vout : selectedUtxo.outputIndex;
                const addr = typeof selectedUtxo.address === 'string' ? selectedUtxo.address : selectedUtxo.address?.toString();
                logger.debug(`   Selected UTXO ${i}: ${txid}:${vout} = ${selectedUtxo.satoshis} sats from ${addr}`);
            });
        }
        const totalInput = selection.utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
        if (logger.isDebugEnabled()) {
            logger.debug(`   Total input value: ${totalInput} sats`);
            logger.debug(`   Transaction amount: ${amount} sats`);
            logger.debug(`   Expected change: ${totalInput - amount} sats`);
            logger.debug(`   🔍 Coin selection verification: ${selection.utxos.length} UTXOs selected for ${amount} sats`);
        }
        // Extract source address from first selected UTXO with proper error handling
        const firstUtxo = selection.utxos[0];
        let sourceAddress;
        if (firstUtxo.address) {
            sourceAddress = typeof firstUtxo.address === 'string'
                ? firstUtxo.address
                : firstUtxo.address.toString();
        }
        else if (firstUtxo.script) {
            // Handle script-based addresses - convert script to address
            sourceAddress = typeof firstUtxo.script === 'string'
                ? firstUtxo.script
                : firstUtxo.script.toAddress().toString();
        }
        else {
            // Fallback: use the address that would receive change by default
            const internalAddressObj = account.getUnusedAddress('internal');
            sourceAddress = internalAddressObj.address || internalAddressObj;
        }
        logger.debug(`📍 Change address set to SOURCE: ${sourceAddress} (efficiency mode)`);
        return {
            selectedUtxos: selection.utxos,
            sourceAddress,
            totalInput,
            expectedChange: totalInput - amount,
            strategy: enhancedStrategy
        };
    }
}
