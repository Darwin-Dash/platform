/**
 * Transaction finder mode types
 */
/**
 * Operating mode for the transaction finder
 * - HISTORIC: Blockchain scanning for past transactions (UTXO discovery)
 * - REALTIME: Real-time InstantSend/ChainLock monitoring
 */
export var FinderMode;
(function (FinderMode) {
    FinderMode["HISTORIC"] = "historic";
    FinderMode["REALTIME"] = "realtime";
})(FinderMode || (FinderMode = {}));
//# sourceMappingURL=finder-types.js.map