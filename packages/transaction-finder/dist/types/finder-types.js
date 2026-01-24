/**
 * Transaction finder mode types
 */
/**
 * Operating mode for the transaction finder
 * - HISTORIC: Blockchain scanning for past transactions (UTXO discovery)
 * - REALTIME: Real-time InstantSend/ChainLock monitoring
 * - HYBRID: Combined historic scanning + realtime monitoring
 */
export var FinderMode;
(function (FinderMode) {
    FinderMode["HISTORIC"] = "historic";
    FinderMode["REALTIME"] = "realtime";
    FinderMode["HYBRID"] = "hybrid";
})(FinderMode || (FinderMode = {}));
//# sourceMappingURL=finder-types.js.map