/**
 * Identity Transformer - Convert WASM Identity Objects to Frontend Format
 *
 * Transforms raw WASM SDK identity objects into the UI-friendly format
 * expected by the demo app's state manager and components.
 */

/**
 * Transform WASM identity to UI format
 * @param {Object} wasmIdentity - Identity object from WASM SDK
 * @param {number} [index] - Optional HD derivation index
 * @returns {Object} UI-formatted identity
 */
export function transformIdentityForUI(wasmIdentity, index = null) {
  // Extract base information
  const id = wasmIdentity.getId ? wasmIdentity.getId().toBase58() : wasmIdentity.id;
  const balance = wasmIdentity.getBalance ? wasmIdentity.getBalance() : wasmIdentity.balance || 0;
  const revision = wasmIdentity.getRevision ? wasmIdentity.getRevision() : wasmIdentity.revision || 0;

  // Extract public keys
  const publicKeys = wasmIdentity.getPublicKeys ? wasmIdentity.getPublicKeys() : wasmIdentity.publicKeys || [];
  const transformedKeys = publicKeys.map((key, idx) => transformKey(key, idx));

  // Build UI identity object
  return {
    id,
    label: null, // User can set custom label later
    balance,
    revision,
    keys: transformedKeys,
    dpnsNames: [], // Query separately if needed via name resolver
    createdAt: Date.now(), // Will be updated from block metadata if available
    updatedAt: Date.now(),
    index: index !== null ? index : null, // HD derivation index if known
    discoveredAt: Date.now()
  };
}

/**
 * Transform a single public key from WASM format to UI format
 * @param {Object} key - WASM public key object
 * @param {number} [keyId] - Optional key ID/index
 * @returns {Object} UI-formatted key
 */
export function transformKey(key, keyId = 0) {
  let publicKeyData;

  // Handle both WASM objects and plain objects
  if (key.getData) {
    publicKeyData = key.getData();
  } else if (key.data) {
    publicKeyData = key.data;
  } else {
    publicKeyData = Buffer.from(key).toString('hex');
  }

  // Convert to hex string if needed
  if (Buffer.isBuffer(publicKeyData)) {
    publicKeyData = publicKeyData.toString('hex');
  } else if (typeof publicKeyData === 'string' && !publicKeyData.startsWith('0x')) {
    publicKeyData = `0x${publicKeyData}`;
  }

  // Extract key purpose (0=auth, 1=encryption, 2=transfer, etc)
  const purpose = key.getPurpose ? key.getPurpose() : key.purpose || 0;

  // Extract security level (0=master, 1=critical, 2=high, 3=medium)
  const securityLevel = key.getSecurityLevel ? key.getSecurityLevel() : key.securityLevel || 0;

  // Extract key type (0=ECDSA_SECP256K1, etc)
  const type = key.getType ? key.getType() : key.type || 0;

  // Extract read-only flag if available
  const isReadOnly = key.isReadOnly ? key.isReadOnly() : key.isReadOnly || false;

  // Extract approval key ID if present
  const approvalKeyId = key.getApprovalKeyId ? key.getApprovalKeyId() : null;

  return {
    id: keyId,
    data: publicKeyData,
    purpose: purpose,
    securityLevel: securityLevel,
    type: type,
    status: 'active', // Default to active, may be updated based on identity state
    isReadOnly: isReadOnly,
    approvalKeyId: approvalKeyId
  };
}

/**
 * Transform batch of WASM identities to UI format
 * @param {Array} identities - Array of WASM identity objects with indices
 * @returns {Array} Array of UI-formatted identities
 */
export function transformIdentitiesBatch(identities) {
  return identities.map(item => {
    const identity = transformIdentityForUI(item.identity || item, item.index);
    return {
      identity,
      index: item.index
    };
  });
}

/**
 * Merge discovered identity with existing identity if it exists
 * Preserves user labels and custom metadata
 * @param {Object} existingIdentity - Existing identity from state
 * @param {Object} discoveredIdentity - Newly discovered identity
 * @returns {Object} Merged identity with preserved metadata
 */
export function mergeIdentityData(existingIdentity, discoveredIdentity) {
  return {
    ...discoveredIdentity,
    label: existingIdentity?.label || null, // Preserve custom label
    dpnsNames: existingIdentity?.dpnsNames || [], // Preserve known DPNS names
    createdAt: existingIdentity?.createdAt || discoveredIdentity.createdAt,
    // Update other fields from discovered data
    balance: discoveredIdentity.balance,
    revision: discoveredIdentity.revision,
    keys: discoveredIdentity.keys,
    updatedAt: Date.now()
  };
}

/**
 * Transform discovery result to UI format
 * @param {Object} discoveryResult - Result from getIdentityIds()
 * @param {Map} existingIdentities - Existing identities map from state
 * @returns {Array} Formatted identities ready for state manager
 */
export function transformDiscoveryResult(discoveryResult, existingIdentities = new Map()) {
  if (!Array.isArray(discoveryResult)) {
    return [];
  }

  return discoveryResult.map(item => ({
    id: item.identityId,
    index: item.index,
    discoveredAt: Date.now()
  }));
}

/**
 * Format identity for display in UI components
 * Adds display-friendly strings for keys and metadata
 * @param {Object} identity - Identity object from state
 * @returns {Object} Enhanced identity with display properties
 */
export function enrichIdentityForDisplay(identity) {
  return {
    ...identity,
    displayName: identity.label || (identity.dpnsNames?.length > 0 ? identity.dpnsNames[0] : 'Unnamed Identity'),
    formattedBalance: formatBalance(identity.balance),
    keyCount: identity.keys?.length || 0,
    nameCount: identity.dpnsNames?.length || 0,
    isNew: Date.now() - identity.discoveredAt < 60000 // New if discovered < 1 min ago
  };
}

/**
 * Format balance for display
 * @param {number} duffs - Amount in duffs
 * @returns {Object} Formatted balance with dash and credit representations
 */
export function formatBalance(duffs) {
  const dash = duffs / 100000000;
  const credits = duffs * 1000;

  return {
    duffs: duffs.toLocaleString(),
    dash: dash.toFixed(8),
    credits: credits.toLocaleString(),
    displayDash: `${dash.toFixed(2)} DASH`,
    displayCredits: `${credits.toLocaleString()} credits`
  };
}

/**
 * Validate transformed identity has all required fields
 * @param {Object} identity - Identity to validate
 * @returns {boolean} True if identity has all required fields
 */
export function isValidTransformedIdentity(identity) {
  return (
    identity &&
    typeof identity.id === 'string' &&
    typeof identity.balance === 'number' &&
    typeof identity.revision === 'number' &&
    Array.isArray(identity.keys) &&
    typeof identity.discoveredAt === 'number'
  );
}
