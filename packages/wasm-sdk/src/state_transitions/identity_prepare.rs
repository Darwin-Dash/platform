//! Identity prepare state transition implementations for the WASM SDK.
//!
//! These SYNC methods create and sign state transitions locally without any
//! network calls, avoiding RwLock conflicts. The results can be broadcast
//! via JavaScript DAPI client.

use crate::error::WasmSdkError;
use crate::sdk::WasmSdk;
use dash_sdk::dpp::identity::{KeyType, Purpose, SecurityLevel};
use wasm_bindgen::prelude::*;

// ============================================================================
// Identity Create Prepare (SYNC - no network operations)
// ============================================================================

/// Result of preparing an identity create state transition.
#[wasm_bindgen(js_name = "IdentityCreatePrepareResult")]
pub struct IdentityCreatePrepareResultWasm {
    status: String,
    state_transition: String,
    identity_id: String,
}

#[wasm_bindgen(js_class = IdentityCreatePrepareResult)]
impl IdentityCreatePrepareResultWasm {
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> String {
        self.status.clone()
    }

    #[wasm_bindgen(getter = "stateTransition")]
    pub fn state_transition(&self) -> String {
        self.state_transition.clone()
    }

    #[wasm_bindgen(getter = "identityId")]
    pub fn identity_id(&self) -> String {
        self.identity_id.clone()
    }
}

/// Input format for public keys in identity creation
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct PublicKeyInput {
    id: u32,
    #[serde(rename = "keyType")]
    key_type: u8,
    purpose: u8,
    #[serde(rename = "securityLevel")]
    security_level: u8,
    data: String, // hex-encoded public key
    #[serde(rename = "privateKeyWif")]
    private_key_wif: Option<String>,
}

#[wasm_bindgen]
impl WasmSdk {
    /// Prepare an identity create state transition (SYNC - no network operations).
    ///
    /// This method creates and signs the state transition locally without any
    /// network calls, avoiding RwLock conflicts. The result can be broadcast
    /// via JavaScript DAPI client.
    ///
    /// @param assetLockProofJson - Asset lock proof as JSON string
    /// @param assetLockPrivateKeyWif - Asset lock private key in WIF format
    /// @param publicKeysJson - Public keys array as JSON string
    /// @returns IdentityCreatePrepareResult with stateTransition hex and identityId
    #[wasm_bindgen(js_name = "identityCreatePrepare")]
    pub fn identity_create_prepare(
        &self,
        asset_lock_proof_json: String,
        asset_lock_private_key_wif: String,
        public_keys_json: String,
    ) -> Result<IdentityCreatePrepareResultWasm, WasmSdkError> {
        use dash_sdk::dpp::dashcore::signer;
        use dash_sdk::dpp::dashcore::PrivateKey;
        use dash_sdk::dpp::prelude::{AssetLockProof, UserFeeIncrease};
        use dash_sdk::dpp::serialization::{PlatformSerializable, Signable};
        use dash_sdk::dpp::state_transition::identity_create_transition::v0::IdentityCreateTransitionV0;
        use dash_sdk::dpp::state_transition::identity_create_transition::IdentityCreateTransition;
        use dash_sdk::dpp::state_transition::public_key_in_creation::v0::IdentityPublicKeyInCreationV0;
        use dash_sdk::dpp::state_transition::StateTransition;
        use tracing::debug;

        debug!(target: "wasm_sdk", "identityCreatePrepare: parsing inputs");

        // Parse asset lock proof from JSON
        let asset_lock_proof: AssetLockProof =
            serde_json::from_str(&asset_lock_proof_json).map_err(|e| {
                WasmSdkError::invalid_argument(format!("Invalid asset lock proof JSON: {}", e))
            })?;

        // Parse private key - WIF format
        let private_key = PrivateKey::from_wif(&asset_lock_private_key_wif)
            .map_err(|e| WasmSdkError::invalid_argument(format!("Invalid private key: {}", e)))?;

        // Parse public keys from JSON
        let public_keys_input: Vec<PublicKeyInput> =
            serde_json::from_str(&public_keys_json).map_err(|e| {
                WasmSdkError::invalid_argument(format!("Invalid public keys JSON: {}", e))
            })?;

        debug!(target: "wasm_sdk", "identityCreatePrepare: {} public keys", public_keys_input.len());

        // Parse public keys and collect their private keys for later signing
        let mut key_info_vec: Vec<(IdentityPublicKeyInCreationV0, Option<PrivateKey>)> = Vec::new();
        for key_input in &public_keys_input {
            let public_key_data = hex::decode(&key_input.data).map_err(|e| {
                WasmSdkError::invalid_argument(format!(
                    "Invalid hex in public key data: {}",
                    e
                ))
            })?;

            let key_type = KeyType::try_from(key_input.key_type).map_err(|_| {
                WasmSdkError::invalid_argument(format!("Invalid key type: {}", key_input.key_type))
            })?;

            let purpose = Purpose::try_from(key_input.purpose).map_err(|_| {
                WasmSdkError::invalid_argument(format!("Invalid purpose: {}", key_input.purpose))
            })?;

            let security_level = SecurityLevel::try_from(key_input.security_level).map_err(|_| {
                WasmSdkError::invalid_argument(format!(
                    "Invalid security level: {}",
                    key_input.security_level
                ))
            })?;

            // Parse the optional private key for this public key
            let key_private = if let Some(ref wif) = key_input.private_key_wif {
                Some(PrivateKey::from_wif(wif).map_err(|e| {
                    WasmSdkError::invalid_argument(format!(
                        "Invalid private key WIF for key {}: {}",
                        key_input.id, e
                    ))
                })?)
            } else {
                None
            };

            // Create IdentityPublicKeyInCreationV0 without signature initially
            // The signature will be added after we have the state transition signable bytes
            let key_in_creation = IdentityPublicKeyInCreationV0 {
                id: key_input.id.into(),
                key_type,
                purpose,
                security_level,
                read_only: false,
                data: public_key_data.into(),
                contract_bounds: None,
                signature: Default::default(),
            };

            key_info_vec.push((key_in_creation, key_private));
        }

        debug!(target: "wasm_sdk", "identityCreatePrepare: creating state transition");

        // Create the identity create transition with unsigned keys first
        let public_keys_unsigned: Vec<_> = key_info_vec.iter()
            .map(|(key, _)| key.clone().into())
            .collect();

        let mut identity_create_transition_v0 = IdentityCreateTransitionV0 {
            asset_lock_proof: asset_lock_proof.clone(),
            public_keys: public_keys_unsigned,
            user_fee_increase: UserFeeIncrease::default(),
            signature: Default::default(),
            identity_id: Default::default(), // Will be computed from asset lock
        };

        // Get the signable bytes from the state transition to sign each key
        // Keys are signed with the state transition's signable bytes, not their own bytes
        let temp_transition: StateTransition = IdentityCreateTransition::V0(identity_create_transition_v0.clone()).into();
        let key_signable_bytes = temp_transition.signable_bytes().map_err(|e| {
            WasmSdkError::generic(format!("Failed to get signable bytes for key signing: {}", e))
        })?;

        // Sign each key that has a private key with the state transition signable bytes
        for (i, (_, key_private_opt)) in key_info_vec.iter().enumerate() {
            if let Some(key_private) = key_private_opt {
                let signature = signer::sign(&key_signable_bytes, key_private.inner.as_ref())
                    .map_err(|e| {
                        WasmSdkError::generic(format!(
                            "Failed to sign key {}: {}",
                            i, e
                        ))
                    })?;

                // Update the signature in the transition's public keys
                if let dash_sdk::dpp::state_transition::public_key_in_creation::IdentityPublicKeyInCreation::V0(ref mut key_v0) = identity_create_transition_v0.public_keys[i] {
                    key_v0.signature = signature.to_vec().into();
                }
            }
        }

        let identity_create_transition = IdentityCreateTransition::V0(identity_create_transition_v0);
        let mut state_transition: StateTransition = identity_create_transition.into();

        // Sign the state transition with the asset lock private key
        debug!(target: "wasm_sdk", "identityCreatePrepare: signing state transition");
        let signable_data = state_transition.signable_bytes().map_err(|e| {
            WasmSdkError::generic(format!("Failed to get signable bytes: {}", e))
        })?;
        let signature = signer::sign(&signable_data, private_key.inner.as_ref())
            .map_err(|e| WasmSdkError::generic(format!("Failed to sign state transition: {}", e)))?;
        state_transition.set_signature(signature.to_vec().into());

        // Get the identity ID from the state transition
        let identity_id = match &state_transition {
            StateTransition::IdentityCreate(ic) => {
                use dash_sdk::dpp::state_transition::identity_create_transition::accessors::IdentityCreateTransitionAccessorsV0;
                ic.identity_id().to_string(
                    dash_sdk::dpp::platform_value::string_encoding::Encoding::Base58,
                )
            }
            _ => {
                return Err(WasmSdkError::generic(
                    "Unexpected state transition type".to_string(),
                ))
            }
        };

        // Serialize the state transition
        debug!(target: "wasm_sdk", "identityCreatePrepare: serializing state transition");
        let st_bytes = state_transition.serialize_to_bytes().map_err(|e| {
            WasmSdkError::generic(format!("Failed to serialize state transition: {}", e))
        })?;

        debug!(target: "wasm_sdk", "identityCreatePrepare: complete, identity_id={}", identity_id);

        Ok(IdentityCreatePrepareResultWasm {
            status: "prepared".to_string(),
            state_transition: hex::encode(&st_bytes),
            identity_id,
        })
    }

    /// Prepare an identity top-up state transition (SYNC - no network operations).
    ///
    /// This method creates and signs the state transition locally without any
    /// network calls, avoiding RwLock conflicts. The result can be broadcast
    /// via JavaScript DAPI client.
    ///
    /// @param identityId - Identity ID to top up (Base58 format)
    /// @param assetLockProofJson - Asset lock proof as JSON string
    /// @param assetLockPrivateKeyWif - Asset lock private key in WIF format
    /// @returns IdentityCreatePrepareResult with stateTransition hex
    #[wasm_bindgen(js_name = "identityTopUpPrepare")]
    pub fn identity_top_up_prepare(
        &self,
        identity_id: String,
        asset_lock_proof_json: String,
        asset_lock_private_key_wif: String,
    ) -> Result<IdentityCreatePrepareResultWasm, WasmSdkError> {
        use dash_sdk::dpp::dashcore::signer;
        use dash_sdk::dpp::dashcore::PrivateKey;
        use dash_sdk::dpp::platform_value::string_encoding::Encoding;
        use dash_sdk::dpp::platform_value::Identifier;
        use dash_sdk::dpp::prelude::{AssetLockProof, UserFeeIncrease};
        use dash_sdk::dpp::serialization::{PlatformSerializable, Signable};
        use dash_sdk::dpp::state_transition::identity_topup_transition::v0::IdentityTopUpTransitionV0;
        use dash_sdk::dpp::state_transition::StateTransition;
        use tracing::debug;

        debug!(target: "wasm_sdk", "identityTopUpPrepare: parsing inputs for {}", identity_id);

        // Parse identity identifier
        let identifier = Identifier::from_string(&identity_id, Encoding::Base58)
            .map_err(|e| WasmSdkError::invalid_argument(format!("Invalid identity ID: {}", e)))?;

        // Parse asset lock proof from JSON
        let asset_lock_proof: AssetLockProof =
            serde_json::from_str(&asset_lock_proof_json).map_err(|e| {
                WasmSdkError::invalid_argument(format!("Invalid asset lock proof JSON: {}", e))
            })?;

        // Parse private key - WIF format
        let private_key = PrivateKey::from_wif(&asset_lock_private_key_wif)
            .map_err(|e| WasmSdkError::invalid_argument(format!("Invalid private key: {}", e)))?;

        debug!(target: "wasm_sdk", "identityTopUpPrepare: creating state transition");

        // Create the identity top-up transition
        let identity_topup_transition_v0 = IdentityTopUpTransitionV0 {
            asset_lock_proof,
            identity_id: identifier,
            user_fee_increase: UserFeeIncrease::default(),
            signature: Default::default(),
        };

        let mut state_transition: StateTransition = identity_topup_transition_v0.into();

        // Sign the state transition
        debug!(target: "wasm_sdk", "identityTopUpPrepare: signing state transition");
        let signable_data = state_transition.signable_bytes().map_err(|e| {
            WasmSdkError::generic(format!("Failed to get signable bytes: {}", e))
        })?;
        let signature = signer::sign(&signable_data, private_key.inner.as_ref())
            .map_err(|e| WasmSdkError::generic(format!("Failed to sign state transition: {}", e)))?;
        state_transition.set_signature(signature.to_vec().into());

        // Serialize the state transition
        debug!(target: "wasm_sdk", "identityTopUpPrepare: serializing state transition");
        let st_bytes = state_transition.serialize_to_bytes().map_err(|e| {
            WasmSdkError::generic(format!("Failed to serialize state transition: {}", e))
        })?;

        debug!(target: "wasm_sdk", "identityTopUpPrepare: complete");

        Ok(IdentityCreatePrepareResultWasm {
            status: "prepared".to_string(),
            state_transition: hex::encode(&st_bytes),
            identity_id,
        })
    }
}
