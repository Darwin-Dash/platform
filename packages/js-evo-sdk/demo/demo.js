// Auto-refresh status dashboard
async function initDashboardWhenReady() {
  // DOM elements
  const loadingElement = document.getElementById('loading');
  const dashboardElement = document.getElementById('dashboard');
  const errorElement = document.getElementById('error');
  const connectionStatusElement = document.getElementById('connectionStatus');
  const lastUpdatedElement = document.getElementById('lastUpdated');

  // Metric elements
  const blockHeightElement = document.getElementById('blockHeight');
  const blockSyncElement = document.getElementById('blockSync');
  const peersCountElement = document.getElementById('peersCount');
  const networkElement = document.getElementById('network');
  const networkStatusElement = document.getElementById('networkStatus');
  const syncStatusElement = document.getElementById('syncStatus');
  const syncInfoElement = document.getElementById('syncInfo');

  // Info elements
  const versionSDKElement = document.getElementById('versionSDK');
  const versionDAPIElement = document.getElementById('versionDAPI');
  const versionDriveElement = document.getElementById('versionDrive');
  const versionTenderdashElement = document.getElementById('versionTenderdash');
  const protocolP2PElement = document.getElementById('protocolP2P');
  const protocolBlockElement = document.getElementById('protocolBlock');
  const protocolDriveCurrentElement = document.getElementById('protocolDriveCurrent');
  const protocolDriveLatestElement = document.getElementById('protocolDriveLatest');
  const latestHashElement = document.getElementById('latestHash');
  const maxPeerHeightElement = document.getElementById('maxPeerHeight');
  const coreChainLockedElement = document.getElementById('coreChainLocked');
  const nodeIdElement = document.getElementById('nodeId');
  const listeningElement = document.getElementById('listening');

  // Initialize SDK
  let sdk = null;
  let isConnected = false;
  let lastUpdateTime = null;
  let sdkVersion = '2.1.0-rc.1'; // SDK version from package.json
  let currentNetwork = 'testnet';
  let refreshIntervalHandle = null;

  // Get DOM elements
  const lastUpdatedText = document.getElementById('lastUpdatedText');
  const networkSelect = document.getElementById('networkSelect');
  const networkDescription = document.getElementById('networkDescription');

  // Format hash for display (first and last 12 chars)
  function formatHash(hash) {
    if (!hash || hash.length < 24) return hash;
    return `${hash.slice(0, 12)}...${hash.slice(-12)}`;
  }

  // Update last updated timestamp
  function updateTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    lastUpdateTime = `${hours}:${minutes}:${seconds}`;
    lastUpdatedText.textContent = `Last updated: ${lastUpdateTime}`;
  }

  // Initialize SDK
  async function initializeSDK() {
    try {
      console.log(`Initializing SDK for ${currentNetwork}...`);

      // Access the EvoSDK from the global scope
      const module = await import('../dist/evo-sdk.module.js');
      const { EvoSDK } = module;

      // Create SDK instance based on selected network
      if (currentNetwork === 'mainnet') {
        sdk = EvoSDK.mainnetTrusted();
      } else {
        sdk = EvoSDK.testnetTrusted();
      }

      // Connect to the network
      await sdk.connect();
      isConnected = true;
      connectionStatusElement.textContent = 'Connected';
      connectionStatusElement.className = 'status-badge connected';

      console.log(`SDK initialized and connected to ${currentNetwork}`);

    } catch (error) {
      console.error('Initialization error:', error);
      isConnected = false;
      connectionStatusElement.textContent = 'Connection Failed';
      connectionStatusElement.className = 'status-badge error';
      errorElement.textContent = `Connection Error: ${error.message}`;
      errorElement.style.display = 'block';
    }
  }

  // Fetch and update platform status
  async function updateStatus() {
    if (!sdk || !isConnected) {
      return;
    }

    try {
      errorElement.style.display = 'none';

      // Get system status
      const status = await sdk.system.status();

      // Extract and display metrics
      const blockHeight = status.chain?.latestBlockHeight || '—';
      const maxPeerHeight = status.chain?.maxPeerBlockHeight || '—';
      const peersCount = status.network?.peersCount || '—';
      const chainId = status.network?.chainId?.split('-')[1] || '—';
      const listening = status.network?.listening ? 'Yes' : 'No';
      const catchingUp = status.chain?.catchingUp ? 'Catching Up' : 'Synced';

      blockHeightElement.textContent = blockHeight;
      blockSyncElement.textContent = `${blockHeight === '—' ? '—' : `Network max: ${maxPeerHeight}`}`;
      peersCountElement.textContent = peersCount;
      networkElement.textContent = chainId || 'testnet';
      networkStatusElement.textContent = listening === 'Yes' ? 'Listening' : 'Not Listening';
      syncStatusElement.textContent = catchingUp;
      syncInfoElement.textContent = catchingUp === 'Synced' ? 'Network is fully synced' : 'Syncing with network';

      // Software versions
      versionSDKElement.textContent = sdkVersion;
      versionDAPIElement.textContent = status.version?.software?.dapi || '—';
      versionDriveElement.textContent = status.version?.software?.drive || '—';
      versionTenderdashElement.textContent = status.version?.software?.tenderdash || '—';

      // Protocol versions
      protocolP2PElement.textContent = status.version?.protocol?.tenderdash?.p2p || '—';
      protocolBlockElement.textContent = status.version?.protocol?.tenderdash?.block || '—';
      protocolDriveCurrentElement.textContent = status.version?.protocol?.drive?.current || '—';
      protocolDriveLatestElement.textContent = status.version?.protocol?.drive?.latest || '—';

      // Chain information
      latestHashElement.textContent = formatHash(status.chain?.latestBlockHash);
      maxPeerHeightElement.textContent = maxPeerHeight;
      coreChainLockedElement.textContent = status.chain?.coreChainLockedHeight || '—';

      // Node information
      nodeIdElement.textContent = status.node?.id ? status.node.id.slice(0, 12) + '...' : '—';
      listeningElement.textContent = listening;

      updateTimestamp();

      // Show dashboard and hide loading
      loadingElement.style.display = 'none';
      dashboardElement.style.display = 'block';

    } catch (error) {
      console.error('Status update error:', error);
      errorElement.textContent = `Error fetching status: ${error.message}`;
      errorElement.style.display = 'block';
    }
  }

  // Handle network selection change
  async function handleNetworkChange(network) {
    currentNetwork = network;
    networkDescription.textContent = `${network.charAt(0).toUpperCase() + network.slice(1)} Live Status Dashboard`;

    // Clear the existing interval if there is one
    if (refreshIntervalHandle) {
      clearInterval(refreshIntervalHandle);
    }

    // Reset connection status
    connectionStatusElement.textContent = 'Connecting...';
    connectionStatusElement.className = 'status-badge connecting';
    loadingElement.style.display = 'block';
    dashboardElement.style.display = 'none';
    errorElement.style.display = 'none';

    // Disconnect existing SDK if connected
    if (sdk && isConnected) {
      try {
        await sdk.disconnect();
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
    }

    // Re-initialize with new network
    await initializeSDK();
    if (isConnected) {
      await updateStatus();
      refreshIntervalHandle = setInterval(updateStatus, 30000);
    } else {
      loadingElement.style.display = 'none';
    }
  }

  // Setup network selector listener
  if (networkSelect) {
    networkSelect.addEventListener('change', (e) => {
      handleNetworkChange(e.target.value);
    });
  }

  // Initialize SDK and start auto-refresh
  await initializeSDK();
  if (isConnected) {
    // Initial update
    await updateStatus();

    // Auto-refresh every 30 seconds
    refreshIntervalHandle = setInterval(updateStatus, 30000);
  } else {
    loadingElement.style.display = 'none';
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardWhenReady);
} else {
  initDashboardWhenReady();
}
