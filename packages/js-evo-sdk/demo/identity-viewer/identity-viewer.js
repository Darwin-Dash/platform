// Identity Viewer Dashboard
async function initIdentityViewerWhenReady() {
  // DOM elements
  const loadingElement = document.getElementById('loading');
  const dashboardElement = document.getElementById('dashboard');
  const errorElement = document.getElementById('error');
  const connectionStatusElement = document.getElementById('connectionStatus');
  const identityInput = document.getElementById('identityInput');
  const searchBtn = document.getElementById('searchBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const testnetBtn = document.getElementById('testnetBtn');
  const mainnetBtn = document.getElementById('mainnetBtn');
  const networkDescription = document.getElementById('networkDescription');
  const footerNetworkText = document.getElementById('footerNetworkText');
  const lastUpdatedText = document.getElementById('lastUpdatedText');

  // Metric elements
  const identityIdElement = document.getElementById('identityId');
  const balanceElement = document.getElementById('balance');
  const balanceNoteElement = document.getElementById('balanceNote');
  const publicKeysCountElement = document.getElementById('publicKeysCount');
  const revisionElement = document.getElementById('revision');

  // Info elements
  const publicKeysListElement = document.getElementById('publicKeysList');

  // SDK state
  let sdk = null;
  let isConnected = false;
  let currentNetwork = 'testnet';
  let currentIdentity = null;

  // Default test identity from .env
  const DEFAULT_IDENTITY_ID = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';

  // Format large numbers with commas
  function formatNumber(num) {
    if (num === null || num === undefined || num === '—') return '—';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Format timestamp to readable format
  function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    try {
      const date = new Date(timestamp);
      return date.toISOString();
    } catch {
      return timestamp;
    }
  }

  // Format hash for display (truncate long values)
  function formatHash(hash, length = 32) {
    if (!hash || hash.length <= length) return hash;
    return `${hash.slice(0, length)}...`;
  }

  // Update last updated timestamp
  function updateTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    lastUpdatedText.textContent = `Last updated: ${hours}:${minutes}:${seconds}`;
  }

  // Copy to clipboard helper
  function createCopyButton(text) {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      });
    });
    return button;
  }

  // Initialize SDK
  async function initializeSDK() {
    try {
      console.log(`[initializeSDK] Starting initialization for ${currentNetwork}...`);

      // Access the EvoSDK from the global scope
      console.log('[initializeSDK] Importing SDK module...');
      const module = await import('../../dist/evo-sdk.module.js');
      console.log('[initializeSDK] Module imported:', module);

      const { EvoSDK } = module;
      console.log('[initializeSDK] EvoSDK extracted:', EvoSDK ? 'SUCCESS' : 'FAILED');

      // Create SDK instance based on selected network
      console.log(`[initializeSDK] Creating ${currentNetwork} SDK instance...`);
      if (currentNetwork === 'mainnet') {
        sdk = EvoSDK.mainnetTrusted();
      } else {
        sdk = EvoSDK.testnetTrusted();
      }
      console.log('[initializeSDK] SDK instance created:', sdk ? 'SUCCESS' : 'FAILED');

      // Connect to the network
      console.log('[initializeSDK] Connecting to network...');
      await sdk.connect();
      console.log('[initializeSDK] Connection successful');

      isConnected = true;
      connectionStatusElement.textContent = 'Connected';
      connectionStatusElement.className = 'status-badge connected';

      console.log(`[initializeSDK] SDK initialized and connected to ${currentNetwork}`);
      updateTimestamp();

    } catch (error) {
      console.error('[initializeSDK] ERROR:', error);
      console.error('[initializeSDK] Error stack:', error.stack);
      console.error('[initializeSDK] Error message:', error.message);
      isConnected = false;
      connectionStatusElement.textContent = 'Connection Failed';
      connectionStatusElement.className = 'status-badge error';
      errorElement.innerHTML = `
        <h4>Connection Error</h4>
        <p>${error.message}</p>
      `;
      errorElement.style.display = 'block';
    }
  }

  // Fetch and display identity information
  async function loadIdentity(identityId) {
    console.log('[loadIdentity] Starting with ID:', identityId);

    if (!sdk || !isConnected) {
      console.error('[loadIdentity] SDK not connected:', { sdk: !!sdk, isConnected });
      showError('SDK not connected. Please wait for the connection to establish.');
      return;
    }

    // Validate identity ID format
    if (!identityId || identityId.trim().length === 0) {
      console.error('[loadIdentity] Invalid identity ID:', identityId);
      showError('Please enter a valid identity ID.');
      return;
    }

    showLoading(true);
    errorElement.style.display = 'none';

    try {
      console.log(`[loadIdentity] Fetching identity: ${identityId}`);

      // Fetch the identity using getWithProof to get metadata in proof object
      // WithProof returns: { data: IdentityWasm, proof: ProofInfo }
      console.log('[loadIdentity] Fetching identity with proof...');
      const identityWithProof = await sdk.identities.getWithProof(identityId);
      console.log('[loadIdentity] Identity with proof fetched:', identityWithProof ? 'SUCCESS' : 'NULL');

      if (!identityWithProof || !identityWithProof.data) {
        console.error('[loadIdentity] Identity not found');
        showError(`Identity not found: ${identityId}`);
        showLoading(false);
        return;
      }

      const identity = identityWithProof.data;
      const proof = identityWithProof.proof;

      // Store the current identity with the ID we know
      currentIdentity = {
        id: identityId,
        data: identity,
        proof: proof
      };
      console.log('[loadIdentity] Current identity stored with proof');

      // Fetch identity data using separate SDK methods
      // The WASM identity object doesn't have direct accessor methods
      // We must use the SDK facade methods instead
      console.log('[loadIdentity] Fetching balance and revision...');
      const balanceAndRevisionData = await sdk.identities.balanceAndRevision(identityId);
      console.log('[loadIdentity] Balance and revision data:', balanceAndRevisionData);

      const balance = balanceAndRevisionData?.balance ?? 0;
      const revision = balanceAndRevisionData?.revision ?? 0;
      console.log('[loadIdentity] Parsed balance:', balance, 'revision:', revision);

      // Fetch public keys separately using getKeys method
      console.log('[loadIdentity] Fetching public keys...');
      const publicKeys = await sdk.identities.getKeys({
        identityId: identityId,
        keyRequestType: 'all',
        limit: 100,
        offset: 0
      });
      console.log('[loadIdentity] Public keys:', publicKeys);
      console.log('[loadIdentity] Public keys count:', publicKeys?.length || 0);

      // Validate we got expected data
      if (balance === 0 && revision === 0 && publicKeys.length === 0) {
        console.warn('[loadIdentity] WARNING: All values are zero/empty - may indicate API issue');
      }

      // Update metric cards
      console.log('[loadIdentity] Updating UI with data...');
      identityIdElement.textContent = formatHash(identityId, 16);
      balanceElement.textContent = formatNumber(balance);
      balanceNoteElement.textContent = `${balance || 0} credits available`;
      publicKeysCountElement.textContent = (publicKeys && publicKeys.length) || 0;
      revisionElement.textContent = revision || 0;
      console.log('[loadIdentity] Metrics updated');

      // Display public keys
      console.log('[loadIdentity] Displaying public keys...');
      displayPublicKeys(publicKeys);

      updateTimestamp();

      // Show dashboard and hide loading
      console.log('[loadIdentity] Showing dashboard');
      showLoading(false);
      dashboardElement.style.display = 'block';
      console.log('[loadIdentity] SUCCESS - Identity loaded and displayed');

    } catch (error) {
      console.error('[loadIdentity] ERROR:', error);
      console.error('[loadIdentity] Error stack:', error.stack);
      console.error('[loadIdentity] Error name:', error.name);
      console.error('[loadIdentity] Error message:', error.message);
      showError(`Error loading identity: ${error.message}`);
      showLoading(false);
    }
  }

  // Display public keys in a readable format
  function displayPublicKeys(publicKeys) {
    if (!publicKeys || publicKeys.length === 0) {
      publicKeysListElement.innerHTML = '<p style="color: #999; margin: 0;">No public keys found</p>';
      return;
    }

    let keysHTML = '';
    publicKeys.forEach((key, index) => {
      const keyId = key.id !== undefined ? key.id : index;
      const keyType = key.type || 'Unknown';
      const keyPurpose = key.purpose ? `Purpose: ${key.purpose}` : 'No purpose';
      const publicKeyData = key.publicKeyData ? key.publicKeyData.toString('hex') : key.data || 'N/A';
      const isDisabled = key.isDisabled ? ' (DISABLED)' : '';

      keysHTML += `
        <div class="key-item">
          <div class="key-purpose">Key ${keyId}${isDisabled} - ${keyType}</div>
          <div style="margin-bottom: 6px; font-size: 11px; color: #999;">${keyPurpose}</div>
          <div class="key-value">${formatHash(publicKeyData.toString(), 64)}</div>
        </div>
      `;
    });

    publicKeysListElement.innerHTML = keysHTML;
  }

  // Show error message
  function showError(message) {
    errorElement.innerHTML = `
      <h4>Error</h4>
      <p>${message}</p>
    `;
    errorElement.style.display = 'block';
    dashboardElement.style.display = 'none';
  }

  // Show/hide loading indicator
  function showLoading(show) {
    if (show) {
      loadingElement.style.display = 'block';
      dashboardElement.style.display = 'none';
    } else {
      loadingElement.style.display = 'none';
    }
  }

  // Handle network switch
  async function switchNetwork() {
    const newNetwork = currentNetwork === 'testnet' ? 'mainnet' : 'testnet';
    currentNetwork = newNetwork;
    const networkName = newNetwork.charAt(0).toUpperCase() + newNetwork.slice(1);

    // Update UI
    networkDescription.textContent = `${networkName} Identity Inspector`;
    footerNetworkText.textContent = `${networkName} Identity Inspector`;
    testnetBtn.classList.toggle('active', newNetwork === 'testnet');
    mainnetBtn.classList.toggle('active', newNetwork === 'mainnet');

    // Reset connection status
    connectionStatusElement.textContent = 'Connecting...';
    connectionStatusElement.className = 'status-badge connecting';
    showLoading(true);
    errorElement.style.display = 'none';

    // Disconnect existing SDK if connected
    if (sdk && isConnected) {
      try {
        await sdk.disconnect();
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
    }

    // Re-initialize SDK with new network
    await initializeSDK();
    showLoading(false);
  }

  // Event listeners
  searchBtn.addEventListener('click', () => {
    const identityId = identityInput.value.trim();
    if (identityId) {
      loadIdentity(identityId);
    }
  });

  refreshBtn.addEventListener('click', () => {
    if (currentIdentity && currentIdentity.id) {
      loadIdentity(currentIdentity.id);
    } else {
      showError('No identity loaded to refresh.');
    }
  });

  identityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const identityId = identityInput.value.trim();
      if (identityId) {
        loadIdentity(identityId);
      }
    }
  });

  testnetBtn.addEventListener('click', () => {
    if (currentNetwork !== 'testnet') {
      switchNetwork();
    }
  });

  mainnetBtn.addEventListener('click', () => {
    if (currentNetwork !== 'mainnet') {
      switchNetwork();
    }
  });

  // Initialize
  await initializeSDK();

  if (isConnected) {
    // Set default identity ID in input
    identityInput.value = DEFAULT_IDENTITY_ID;
    // Load default identity
    await loadIdentity(DEFAULT_IDENTITY_ID);
  } else {
    showLoading(false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIdentityViewerWhenReady);
} else {
  initIdentityViewerWhenReady();
}
