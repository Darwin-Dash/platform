use crate::context_provider::{WasmContext, WasmTrustedContext};
use crate::error::WasmSdkError;
use arc_swap::ArcSwapOption;
use dash_sdk::dpp::dashcore::Network;
use dash_sdk::dpp::version::PlatformVersion;
use dash_sdk::sdk::Uri;
use dash_sdk::{Sdk, SdkBuilder};
use once_cell::sync::Lazy;
use rs_dapi_client::{Address, RequestSettings};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use wasm_bindgen::prelude::wasm_bindgen;

// Global statics for the prefetch pattern.
// These are written during prefetch (Mutex lock is fine for infrequent writes)
// and cloned to instance state during build() (ArcSwap for lock-free reads).
pub(crate) static MAINNET_TRUSTED_CONTEXT: Lazy<Mutex<Option<WasmTrustedContext>>> =
    Lazy::new(|| Mutex::new(None));
pub(crate) static TESTNET_TRUSTED_CONTEXT: Lazy<Mutex<Option<WasmTrustedContext>>> =
    Lazy::new(|| Mutex::new(None));
pub(crate) static LOCAL_TRUSTED_CONTEXT: Lazy<Mutex<Option<WasmTrustedContext>>> =
    Lazy::new(|| Mutex::new(None));
const DEFAULT_LOCAL_QUORUM_URL: &str = "http://127.0.0.1:2444";
static MAINNET_DISCOVERED_ADDRESSES: Lazy<Mutex<Option<Vec<Address>>>> =
    Lazy::new(|| Mutex::new(None));
static TESTNET_DISCOVERED_ADDRESSES: Lazy<Mutex<Option<Vec<Address>>>> =
    Lazy::new(|| Mutex::new(None));
static LOCAL_DISCOVERED_ADDRESSES: Lazy<Mutex<Option<Vec<Address>>>> =
    Lazy::new(|| Mutex::new(None));

/// Instance-specific state shared across clones of the same WasmSdk.
/// Uses ArcSwapOption for lock-free reads (the common case) while still
/// allowing atomic updates when needed.
pub(crate) struct WasmSdkInstanceState {
    /// Trusted context for this SDK instance (if using trusted mode)
    pub(crate) trusted_context: ArcSwapOption<WasmTrustedContext>,
    /// Network this SDK is configured for
    pub(crate) network: Network,
}

impl WasmSdkInstanceState {
    /// Create new instance state with a trusted context
    pub fn new_with_context(context: WasmTrustedContext, network: Network) -> Self {
        Self {
            trusted_context: ArcSwapOption::new(Some(Arc::new(context))),
            network,
        }
    }

    /// Create new instance state without a trusted context (non-trusted mode)
    pub fn new_without_context(network: Network) -> Self {
        Self {
            trusted_context: ArcSwapOption::new(None),
            network,
        }
    }
}
fn parse_addresses(addresses: &'static [&str]) -> Vec<Address> {
    addresses
        .iter()
        .filter_map(|addr| {
            Uri::from_maybe_shared(addr)
                .ok()
                .and_then(|uri| Address::try_from(uri).ok())
        })
        .collect()
}
fn default_mainnet_addresses() -> Vec<Address> {
    // Trimmed seed list to keep bundle size small; used only if no prefetched cache is available.
    parse_addresses(&[
        "https://149.28.241.190:443",
        "https://198.7.115.48:443",
        "https://134.255.182.186:443",
        "https://93.115.172.39:443",
        "https://5.189.164.253:443",
    ])
}
fn default_testnet_addresses() -> Vec<Address> {
    parse_addresses(&[
        "https://52.12.176.90:1443",
        "https://35.82.197.197:1443",
        "https://44.240.98.102:1443",
        "https://52.34.144.50:1443",
        "https://44.239.39.153:1443",
        "https://34.214.48.68:1443",
        "https://54.149.33.167:1443",
        "https://52.24.124.162:1443",
    ])
}
fn default_local_addresses() -> Vec<Address> {
    parse_addresses(&["https://127.0.0.1:2443"])
}
async fn fetch_and_cache_addresses(
    trusted_context: &WasmTrustedContext,
    cache: &Lazy<Mutex<Option<Vec<Address>>>>,
) -> Result<(), WasmSdkError> {
    let address_list = trusted_context
        .fetch_masternode_addresses()
        .await
        .map_err(|e| WasmSdkError::generic(format!("Failed to fetch masternodes: {}", e)))?;
    let addresses: Vec<Address> = address_list
        .into_iter()
        .map(|(addr, _status)| addr)
        .collect();
    *cache.lock().unwrap() = Some(addresses);
    Ok(())
}

#[wasm_bindgen]
pub struct WasmSdk {
    inner: Sdk,
    /// Instance-specific state shared across clones via Arc
    pub(crate) state: Arc<WasmSdkInstanceState>,
}

// Dereference JsSdk to Sdk so that we can use &JsSdk everywhere where &sdk is needed
impl std::ops::Deref for WasmSdk {
    type Target = Sdk;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl AsRef<Sdk> for WasmSdk {
    fn as_ref(&self) -> &Sdk {
        &self.inner
    }
}

impl Clone for WasmSdk {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            state: Arc::clone(&self.state),
        }
    }
}

#[wasm_bindgen]
impl WasmSdk {
    pub fn version(&self) -> u32 {
        self.inner.version().protocol_version
    }

    /// Get reference to the inner SDK for direct gRPC calls
    pub(crate) fn inner_sdk(&self) -> &Sdk {
        &self.inner
    }

    /// Get the network this SDK is configured for
    pub(crate) fn network(&self) -> Network {
        self.state.network
    }
}

impl WasmSdk {
    /// Add a data contract to the context provider's cache.
    /// This is needed so that subsequent operations (like document transitions)
    /// can verify proofs that reference this contract.
    pub(crate) fn add_contract_to_context_cache(
        &self,
        contract: &dash_sdk::dpp::data_contract::DataContract,
    ) -> Result<(), crate::error::WasmSdkError> {
        // Use instance state (lock-free read via ArcSwap)
        if let Some(context) = self.state.trusted_context.load().as_ref() {
            context.add_known_contract(contract.clone());
        }
        Ok(())
    }
}

#[wasm_bindgen]
impl WasmSdk {
    /// Forces reload of the identity nonce from Platform on the next state transition.
    ///
    /// This clears the cached nonce for the given identity, ensuring that the next
    /// state transition will fetch the current nonce from Platform instead of using
    /// a potentially stale cached value.
    ///
    /// @param identityId - The identifier of the identity whose nonce cache should be cleared
    #[wasm_bindgen(js_name = "refreshIdentityNonce")]
    pub async fn refresh_identity_nonce(&self, identity_id: wasm_dpp2::identifier::IdentifierWasm) {
        self.inner.refresh_identity_nonce(&identity_id.into()).await;
    }

    /// Get a cached contract from the trusted context if available
    pub(crate) fn get_cached_contract(
        &self,
        contract_id: &dash_sdk::platform::Identifier,
    ) -> Option<Arc<dash_sdk::platform::DataContract>> {
        // Use instance state (lock-free read via ArcSwap)
        self.state
            .trusted_context
            .load()
            .as_ref()
            .and_then(|ctx| ctx.get_known_contract(contract_id))
    }

    /// Cache a contract in the trusted context
    pub(crate) fn cache_contract(&self, contract: dash_sdk::platform::DataContract) {
        // Use instance state (lock-free read via ArcSwap)
        if let Some(context) = self.state.trusted_context.load().as_ref() {
            context.add_known_contract(contract);
        }
    }

    /// Fetch a contract, checking cache first
    /// Returns the contract from cache if available, otherwise fetches from network and caches it
    pub(crate) async fn get_or_fetch_contract(
        &self,
        contract_id: dash_sdk::platform::Identifier,
    ) -> Result<dash_sdk::platform::DataContract, crate::error::WasmSdkError> {
        use dash_sdk::platform::Fetch;

        // Check cache first
        if let Some(cached) = self.get_cached_contract(&contract_id) {
            return Ok((*cached).clone());
        }

        // Fetch from network
        let contract = dash_sdk::platform::DataContract::fetch(self.as_ref(), contract_id)
            .await?
            .ok_or_else(|| crate::error::WasmSdkError::not_found("Data contract not found"))?;

        // Cache for future use
        self.cache_contract(contract.clone());

        Ok(contract)
    }

    /// Remove a contract from the cache
    /// This allows forcing a fresh fetch on next access
    pub(crate) fn remove_cached_contract(
        &self,
        contract_id: &dash_sdk::platform::Identifier,
    ) -> bool {
        // Use instance state (lock-free read via ArcSwap)
        self.state
            .trusted_context
            .load()
            .as_ref()
            .map(|ctx| ctx.remove_known_contract(contract_id))
            .unwrap_or(false)
    }

    /// Check if the trusted context is initialized for this SDK instance
    pub(crate) fn has_trusted_context(&self) -> bool {
        self.state.trusted_context.load().is_some()
    }

    /// Get the trusted context for this SDK instance (if available)
    /// Returns a guard that holds an Arc reference to the context
    pub(crate) fn trusted_context(&self) -> arc_swap::Guard<Option<Arc<WasmTrustedContext>>> {
        self.state.trusted_context.load()
    }
}

#[wasm_bindgen]
impl WasmSdk {
    /// Remove a data contract from the cache.
    /// This forces a fresh fetch from the network on the next access.
    /// Returns true if the contract was in the cache and was removed.
    #[wasm_bindgen(js_name = "removeCachedContract")]
    pub fn remove_cached_contract_js(
        &self,
        #[wasm_bindgen(js_name = "contractId")] contract_id: &wasm_dpp2::identifier::IdentifierWasm,
    ) -> bool {
        let id: dash_sdk::platform::Identifier = (*contract_id).into();
        self.remove_cached_contract(&id)
    }
}

#[wasm_bindgen]
impl WasmSdk {
    #[wasm_bindgen(js_name = "prefetchTrustedQuorumsMainnet")]
    pub async fn prefetch_trusted_quorums_mainnet() -> Result<(), WasmSdkError> {
        let trusted_context = WasmTrustedContext::new_mainnet()
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        trusted_context
            .prefetch_quorums()
            .await
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        fetch_and_cache_addresses(&trusted_context, &MAINNET_DISCOVERED_ADDRESSES).await?;

        // Store the context for later use
        *MAINNET_TRUSTED_CONTEXT.lock().unwrap() = Some(trusted_context);

        Ok(())
    }

    #[wasm_bindgen(js_name = "prefetchTrustedQuorumsTestnet")]
    pub async fn prefetch_trusted_quorums_testnet() -> Result<(), WasmSdkError> {
        let trusted_context = WasmTrustedContext::new_testnet()
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        trusted_context
            .prefetch_quorums()
            .await
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        fetch_and_cache_addresses(&trusted_context, &TESTNET_DISCOVERED_ADDRESSES).await?;

        // Store the context for later use
        *TESTNET_TRUSTED_CONTEXT.lock().unwrap() = Some(trusted_context);

        Ok(())
    }

    #[wasm_bindgen(js_name = "prefetchTrustedQuorumsLocal")]
    pub async fn prefetch_trusted_quorums_local() -> Result<(), WasmSdkError> {
        let trusted_context = WasmTrustedContext::new_local_with_url(DEFAULT_LOCAL_QUORUM_URL)
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        trusted_context
            .prefetch_quorums()
            .await
            .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;

        fetch_and_cache_addresses(&trusted_context, &LOCAL_DISCOVERED_ADDRESSES).await?;

        *LOCAL_TRUSTED_CONTEXT.lock().unwrap() = Some(trusted_context);

        Ok(())
    }
}

#[wasm_bindgen]
pub struct WasmSdkBuilder {
    inner: SdkBuilder,
    /// Trusted context to be passed to the SDK instance
    trusted_context: Option<WasmTrustedContext>,
    /// Network for this SDK
    network: Network,
}

impl Deref for WasmSdkBuilder {
    type Target = SdkBuilder;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for WasmSdkBuilder {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

#[wasm_bindgen]
impl WasmSdkBuilder {
    /// Get the latest platform version number
    #[wasm_bindgen(js_name = "getLatestVersionNumber")]
    pub fn get_latest_version_number() -> u32 {
        PlatformVersion::latest().protocol_version
    }

    /// Create a new SdkBuilder with specific addresses and network.
    ///
    /// # Arguments
    /// * `addresses` - Array of HTTPS URLs (e.g., ["https://127.0.0.1:1443"])
    /// * `network` - Network identifier: "mainnet", "testnet" or "local"
    ///
    /// # Example
    /// ```javascript
    /// const builder = WasmSdkBuilder.withAddresses(['https://127.0.0.1:1443'], 'testnet');
    /// const sdk = builder.build();
    /// ```
    #[wasm_bindgen(js_name = "withAddresses")]
    pub fn new_with_addresses(
        addresses: Vec<String>,
        network_str: String,
    ) -> Result<Self, WasmSdkError> {
        // Parse and validate addresses
        if addresses.is_empty() {
            return Err(WasmSdkError::invalid_argument(
                "Addresses must be a non-empty array",
            ));
        }
        let parsed_addresses: Result<Vec<Address>, _> = addresses
            .into_iter()
            .map(|addr| {
                addr.parse::<Uri>()
                    .map_err(|e| format!("Invalid URI '{}': {}", addr, e))
                    .and_then(|uri| {
                        Address::try_from(uri).map_err(|e| format!("Invalid address: {}", e))
                    })
            })
            .collect();

        let parsed_addresses = parsed_addresses.map_err(WasmSdkError::invalid_argument)?;

        // Parse network - mainnet, testnet and local are supported
        let network = match network_str.to_lowercase().as_str() {
            "mainnet" => Network::Dash,
            "testnet" => Network::Testnet,
            "local" => Network::Regtest,
            _ => {
                return Err(WasmSdkError::invalid_argument(format!(
                    "Invalid network '{}'. Expected: mainnet, testnet or local",
                    network_str
                )));
            }
        };

        let address_list = dash_sdk::sdk::AddressList::from_iter(parsed_addresses);

        // Try to use global cached context for backward compatibility,
        // otherwise create a new one. The context is stored in the builder
        // and will be transferred to the SDK instance on build().
        let (sdk_builder, trusted_context) = match network {
            Network::Dash => {
                let context = {
                    let guard = MAINNET_TRUSTED_CONTEXT.lock().unwrap();
                    guard.clone()
                }
                .map(Ok)
                .unwrap_or_else(|| {
                    WasmTrustedContext::new_mainnet()
                        .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))
                })?;

                let builder = SdkBuilder::new(address_list)
                    .with_network(network)
                    .with_context_provider(context.clone());

                (builder, Some(context))
            }
            Network::Testnet => {
                let context = {
                    let guard = TESTNET_TRUSTED_CONTEXT.lock().unwrap();
                    guard.clone()
                }
                .map(Ok)
                .unwrap_or_else(|| {
                    WasmTrustedContext::new_testnet()
                        .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))
                })?;

                let builder = SdkBuilder::new(address_list)
                    .with_network(network)
                    .with_context_provider(context.clone());

                (builder, Some(context))
            }
            Network::Regtest => {
                let context = {
                    let guard = LOCAL_TRUSTED_CONTEXT.lock().unwrap();
                    guard.clone()
                }
                .map(Ok)
                .unwrap_or_else(|| {
                    WasmTrustedContext::new_local()
                        .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))
                })?;

                let builder = SdkBuilder::new(address_list)
                    .with_network(network)
                    .with_context_provider(context.clone());

                (builder, Some(context))
            }
            _ => unreachable!("Network already validated to mainnet, testnet or local"),
        };

        Ok(Self {
            inner: sdk_builder,
            trusted_context,
            network,
        })
    }

    #[wasm_bindgen(js_name = "mainnet")]
    pub fn new_mainnet() -> Self {
        let mainnet_addresses = MAINNET_DISCOVERED_ADDRESSES
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(default_mainnet_addresses);

        let address_list = dash_sdk::sdk::AddressList::from_iter(mainnet_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Dash)
            .with_context_provider(WasmContext {});

        Self {
            inner: sdk_builder,
            trusted_context: None,
            network: Network::Dash,
        }
    }

    /// Create a new SdkBuilder preconfigured for a local network using default dashmate gateway.
    #[wasm_bindgen(js_name = "local")]
    pub fn new_local() -> Self {
        // Dashmate local gateway defaults to 2443
        let local_addresses = vec!["https://127.0.0.1:2443".parse().unwrap()];

        let address_list = dash_sdk::sdk::AddressList::from_iter(local_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Regtest)
            .with_context_provider(WasmContext {});

        Self {
            inner: sdk_builder,
            trusted_context: None,
            network: Network::Regtest,
        }
    }

    #[wasm_bindgen(js_name = "localTrusted")]
    pub fn new_local_trusted() -> Result<Self, WasmSdkError> {
        // Use the cached context if available, otherwise create a new one and store it
        let trusted_context = {
            let mut guard = LOCAL_TRUSTED_CONTEXT.lock().unwrap();
            if let Some(ctx) = guard.as_ref() {
                ctx.clone()
            } else {
                let new_ctx = WasmTrustedContext::new_local()
                    .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;
                *guard = Some(new_ctx.clone());
                new_ctx
            }
        };

        let local_addresses = LOCAL_DISCOVERED_ADDRESSES
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(default_local_addresses);

        let address_list = dash_sdk::sdk::AddressList::from_iter(local_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Regtest)
            .with_context_provider(trusted_context.clone());

        Ok(Self {
            inner: sdk_builder,
            trusted_context: Some(trusted_context),
            network: Network::Regtest,
        })
    }

    #[wasm_bindgen(js_name = "mainnetTrusted")]
    pub fn new_mainnet_trusted() -> Result<Self, WasmSdkError> {
        // Use the cached context if available, otherwise create a new one and store it
        let trusted_context = {
            let mut guard = MAINNET_TRUSTED_CONTEXT.lock().unwrap();
            if let Some(ctx) = guard.as_ref() {
                ctx.clone()
            } else {
                let new_ctx = WasmTrustedContext::new_mainnet()
                    .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;
                *guard = Some(new_ctx.clone());
                new_ctx
            }
        };

        let mainnet_addresses = MAINNET_DISCOVERED_ADDRESSES
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(default_mainnet_addresses);

        let address_list = dash_sdk::sdk::AddressList::from_iter(mainnet_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Dash)
            .with_context_provider(trusted_context.clone());

        Ok(Self {
            inner: sdk_builder,
            trusted_context: Some(trusted_context),
            network: Network::Dash,
        })
    }

    #[wasm_bindgen(js_name = "testnet")]
    pub fn new_testnet() -> Self {
        let testnet_addresses = TESTNET_DISCOVERED_ADDRESSES
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(default_testnet_addresses);

        let address_list = dash_sdk::sdk::AddressList::from_iter(testnet_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Testnet)
            .with_context_provider(WasmContext {});

        Self {
            inner: sdk_builder,
            trusted_context: None,
            network: Network::Testnet,
        }
    }

    #[wasm_bindgen(js_name = "testnetTrusted")]
    pub fn new_testnet_trusted() -> Result<Self, WasmSdkError> {
        // Use the cached context if available, otherwise create a new one and store it
        let trusted_context = {
            let mut guard = TESTNET_TRUSTED_CONTEXT.lock().unwrap();
            if let Some(ctx) = guard.as_ref() {
                ctx.clone()
            } else {
                let new_ctx = WasmTrustedContext::new_testnet()
                    .map_err(|e| WasmSdkError::from(dash_sdk::Error::from(e)))?;
                *guard = Some(new_ctx.clone());
                new_ctx
            }
        };

        let testnet_addresses = TESTNET_DISCOVERED_ADDRESSES
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(default_testnet_addresses);

        let address_list = dash_sdk::sdk::AddressList::from_iter(testnet_addresses);
        let sdk_builder = SdkBuilder::new(address_list)
            .with_network(Network::Testnet)
            .with_context_provider(trusted_context.clone());

        Ok(Self {
            inner: sdk_builder,
            trusted_context: Some(trusted_context),
            network: Network::Testnet,
        })
    }

    pub fn build(self) -> Result<WasmSdk, WasmSdkError> {
        let sdk = self.inner.build().map_err(WasmSdkError::from)?;

        // Create instance state based on whether we have a trusted context
        let state = if let Some(context) = self.trusted_context {
            Arc::new(WasmSdkInstanceState::new_with_context(context, self.network))
        } else {
            Arc::new(WasmSdkInstanceState::new_without_context(self.network))
        };

        Ok(WasmSdk { inner: sdk, state })
    }

    #[wasm_bindgen(js_name = "withContextProvider")]
    pub fn with_context_provider(
        self,
        #[wasm_bindgen(js_name = "contextProvider")] context_provider: WasmContext,
    ) -> Self {
        Self {
            inner: self.inner.with_context_provider(context_provider),
            trusted_context: None, // Non-trusted context replaces any trusted context
            network: self.network,
        }
    }

    /// Configure platform version to use.
    ///
    /// Available versions:
    /// - 1: Platform version 1
    /// - 2: Platform version 2
    /// - ... up to latest version
    ///
    /// Defaults to latest version if not specified.
    #[wasm_bindgen(js_name = "withVersion")]
    pub fn with_version(
        self,
        #[wasm_bindgen(js_name = "versionNumber")] version_number: u32,
    ) -> Result<Self, WasmSdkError> {
        let version = PlatformVersion::get(version_number).map_err(|e| {
            WasmSdkError::invalid_argument(format!(
                "Invalid platform version {}: {}",
                version_number, e
            ))
        })?;

        Ok(Self {
            inner: self.inner.with_version(version),
            trusted_context: self.trusted_context,
            network: self.network,
        })
    }

    /// Configure request settings for the SDK.
    ///
    /// Settings include:
    /// - connect_timeout_ms: Timeout for establishing connection (in milliseconds)
    /// - timeout_ms: Timeout for single request (in milliseconds)
    /// - retries: Number of retries in case of failed requests
    /// - ban_failed_address: Whether to ban DAPI address if node not responded or responded with error
    #[wasm_bindgen(js_name = "withSettings")]
    pub fn with_settings(
        self,
        #[wasm_bindgen(js_name = "connectTimeoutMs")] connect_timeout_ms: Option<u32>,
        #[wasm_bindgen(js_name = "timeoutMs")] timeout_ms: Option<u32>,
        retries: Option<u32>,
        #[wasm_bindgen(js_name = "banFailedAddress")] ban_failed_address: Option<bool>,
    ) -> Self {
        let mut settings = RequestSettings::default();

        if let Some(connect_timeout) = connect_timeout_ms {
            settings.connect_timeout = Some(Duration::from_millis(connect_timeout as u64));
        }

        if let Some(timeout) = timeout_ms {
            settings.timeout = Some(Duration::from_millis(timeout as u64));
        }

        if let Some(retries) = retries {
            settings.retries = Some(retries as usize);
        }

        if let Some(ban) = ban_failed_address {
            settings.ban_failed_address = Some(ban);
        }

        Self {
            inner: self.inner.with_settings(settings),
            trusted_context: self.trusted_context,
            network: self.network,
        }
    }

    #[wasm_bindgen(js_name = "withProofs")]
    pub fn with_proofs(
        self,
        #[wasm_bindgen(js_name = "enableProofs")] enable_proofs: bool,
    ) -> Self {
        Self {
            inner: self.inner.with_proofs(enable_proofs),
            trusted_context: self.trusted_context,
            network: self.network,
        }
    }

}

#[wasm_bindgen]
impl WasmSdk {
    /// Configure tracing/logging level or filter (static, global)
    ///
    /// Accepts simple levels: "off", "error", "warn", "info", "debug", "trace"
    /// or a full EnvFilter string like: "wasm_sdk=debug,rs_dapi_client=warn"
    #[wasm_bindgen(js_name = "setLogLevel")]
    pub fn set_log_level(
        #[wasm_bindgen(js_name = "levelOrFilter")] level_or_filter: &str,
    ) -> Result<(), WasmSdkError> {
        crate::logging::set_log_level(level_or_filter)
    }
}

#[wasm_bindgen]
impl WasmSdkBuilder {
    /// Configure tracing/logging via the builder
    /// Returns a new builder with logging configured
    #[wasm_bindgen(js_name = "withLogs")]
    pub fn with_logs(
        self,
        #[wasm_bindgen(js_name = "levelOrFilter")] level_or_filter: &str,
    ) -> Result<Self, WasmSdkError> {
        crate::logging::set_log_level(level_or_filter)?;
        Ok(self)
    }
}
