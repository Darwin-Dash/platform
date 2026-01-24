use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

pub mod context_provider;
pub mod dpns;
pub mod error;
pub mod logging;
pub mod queries;
pub mod sdk;
pub mod serialization;
pub mod settings;
pub mod state_transitions;
pub mod utils;
pub mod wallet;

// Re-export commonly used items
pub use dpns::*;
pub use error::{WasmSdkError, WasmSdkErrorKind};
pub use queries::{
    PlatformAddressInfoWasm, ProofInfoWasm, ProofMetadataResponseWasm, ResponseMetadataWasm,
};
pub use state_transitions::identity as state_transition_identity;
pub use state_transitions::identity_prepare::IdentityCreatePrepareResultWasm;
pub use wallet::*;
pub use wasm_dpp2::*;

#[wasm_bindgen(start)]
pub async fn start() -> Result<(), WasmSdkError> {
    console_error_panic_hook::set_once();

    Ok(())
}

/// Standalone function to prepare an identity top-up state transition.
/// This is a STATIC function that does NOT require a WasmSdk instance.
/// It performs pure computation (parsing, signing, serializing) without any SDK networking.
///
/// This completely avoids the RwLock conflicts that occur when using SDK methods.
///
/// # Arguments
///
/// * `identity_id` - The identity ID to top up (Base58 format)
/// * `asset_lock_proof_json` - The asset lock proof as JSON string
/// * `asset_lock_private_key_wif` - The asset lock private key in WIF format
/// * `network` - The network ("testnet" or "mainnet")
///
/// # Returns
///
/// Returns a JsValue containing:
/// - status: "prepared"
/// - stateTransition: hex-encoded serialized state transition
/// - identityId: the identity ID
#[wasm_bindgen(js_name = prepareIdentityTopUp)]
pub fn prepare_identity_top_up(
    identity_id: String,
    asset_lock_proof_json: String,
    asset_lock_private_key_wif: String,
    network: String,
) -> Result<JsValue, WasmSdkError> {
    use dash_sdk::dpp::dashcore::Network;
    use dash_sdk::dpp::dashcore::PrivateKey;
    use dash_sdk::dpp::dashcore::signer;
    use dash_sdk::dpp::platform_value::string_encoding::Encoding;
    use dash_sdk::dpp::platform_value::Identifier;
    use dash_sdk::dpp::prelude::{AssetLockProof, UserFeeIncrease};
    use dash_sdk::dpp::serialization::{PlatformSerializable, Signable};
    use dash_sdk::dpp::state_transition::identity_topup_transition::v0::IdentityTopUpTransitionV0;
    use dash_sdk::dpp::state_transition::StateTransition;
    use tracing::debug;

    debug!(target: "wasm_sdk", "prepareIdentityTopUp: creating state transition for {} on {}", identity_id, network);

    // Parse network
    let _network = match network.as_str() {
        "mainnet" => Network::Dash,
        "testnet" | _ => Network::Testnet,
    };

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

    // Create the state transition directly WITHOUT using SDK or network
    debug!(target: "wasm_sdk", "prepareIdentityTopUp: creating IdentityTopUpTransitionV0");

    let identity_topup_transition_v0 = IdentityTopUpTransitionV0 {
        asset_lock_proof,
        identity_id: identifier,
        user_fee_increase: UserFeeIncrease::default(),
        signature: Default::default(),
    };

    let mut state_transition: StateTransition = identity_topup_transition_v0.into();

    // Sign the state transition
    debug!(target: "wasm_sdk", "prepareIdentityTopUp: signing state transition");
    let data = state_transition
        .signable_bytes()
        .map_err(|e| WasmSdkError::generic(format!("Failed to get signable bytes: {}", e)))?;
    let signature = signer::sign(&data, private_key.inner.as_ref())
        .map_err(|e| WasmSdkError::generic(format!("Failed to sign state transition: {}", e)))?;
    state_transition.set_signature(signature.to_vec().into());

    // Serialize the state transition for external broadcast
    debug!(target: "wasm_sdk", "prepareIdentityTopUp: serializing state transition");
    let st_bytes = state_transition.serialize_to_bytes().map_err(|e| {
        WasmSdkError::generic(format!("Failed to serialize state transition: {}", e))
    })?;

    // Create JavaScript result object
    let result_obj = js_sys::Object::new();

    js_sys::Reflect::set(
        &result_obj,
        &JsValue::from_str("status"),
        &JsValue::from_str("prepared"),
    )
    .map_err(|e| WasmSdkError::generic(format!("Failed to set status: {:?}", e)))?;
    js_sys::Reflect::set(
        &result_obj,
        &JsValue::from_str("stateTransition"),
        &JsValue::from_str(&hex::encode(&st_bytes)),
    )
    .map_err(|e| WasmSdkError::generic(format!("Failed to set stateTransition: {:?}", e)))?;
    js_sys::Reflect::set(
        &result_obj,
        &JsValue::from_str("identityId"),
        &JsValue::from_str(&identity_id),
    )
    .map_err(|e| WasmSdkError::generic(format!("Failed to set identityId: {:?}", e)))?;

    debug!(target: "wasm_sdk", "prepareIdentityTopUp: state transition prepared successfully");
    Ok(result_obj.into())
}
