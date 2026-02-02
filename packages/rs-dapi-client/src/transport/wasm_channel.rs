//! Listing of gRPC requests used in DAPI.
//!
//! This module provides WASM-compatible gRPC transport for browser environments.
//! It includes request serialization to prevent "already locked to a reader" errors
//! that can occur when concurrent gRPC calls are made through wasm-streams.

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use super::TransportError;
use crate::{request_settings::AppliedRequestSettings, Uri};
use dapi_grpc::core::v0::core_client::CoreClient;

use dapi_grpc::platform::v0::platform_client::PlatformClient;
use dapi_grpc::tonic::{self as tonic, Status};
use futures::channel::oneshot;
use futures::future::BoxFuture;
use futures::lock::Mutex;
use futures::{FutureExt, TryFutureExt};
use http::Response;
use once_cell::sync::Lazy;
use tonic_web_wasm_client::Client;
use wasm_bindgen_futures::spawn_local;

/// Global mutex to serialize WASM gRPC requests.
///
/// This prevents wasm-streams "already locked to a reader" errors that occur
/// when multiple concurrent gRPC calls try to access the same ReadableStream.
/// By serializing requests at the transport layer, we ensure only one request
/// is processed at a time, avoiding stream conflicts.
///
/// Note: This is a tradeoff between concurrency and correctness. While this
/// limits parallel requests, it prevents the deadlock/hang issues that occur
/// without serialization. For most use cases, the sequential overhead is
/// acceptable compared to request failures.
static WASM_REQUEST_SERIALIZER: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

/// Platform Client using gRPC transport.
pub type PlatformGrpcClient = PlatformClient<WasmClient>;
/// Core Client using gRPC transport.
pub type CoreGrpcClient = CoreClient<WasmClient>;

/// Create a channel that will be used to communicate with the DAPI.
pub fn create_channel(
    uri: Uri,
    _settings: Option<&AppliedRequestSettings>,
) -> Result<WasmClient, TransportError> {
    WasmClient::new(&uri.to_string())
}

/// Transport client used in wasm32 target (eg. Javascript family)
#[derive(Clone, Debug)]
pub struct WasmClient {
    client: Client,
}

impl WasmClient {
    /// Create a new instance of the client, connecting to provided uri.
    pub fn new(uri: &str) -> Result<Self, TransportError> {
        let client = tonic_web_wasm_client::Client::new(uri.to_string());
        Ok(Self { client })
    }
}

impl tonic::client::GrpcService<tonic::body::Body> for WasmClient {
    type Future = BoxFuture<'static, Result<http::Response<Self::ResponseBody>, Self::Error>>;
    type ResponseBody = tonic::body::Body;
    type Error = Status;

    fn call(&mut self, request: http::Request<tonic::body::Body>) -> Self::Future {
        let mut client = self.client.clone();
        let serializer = WASM_REQUEST_SERIALIZER.clone();

        let fut = async move {
            // Acquire serializer lock to prevent concurrent stream access.
            // This ensures only one gRPC request is in-flight at a time,
            // preventing wasm-streams "already locked to a reader" errors.
            let _guard = serializer.lock().await;

            match client.call(request).await {
                Ok(resp) => {
                    let (parts, body) = resp.into_parts();
                    let tonic_body = tonic::body::Body::new(body);
                    Ok(Response::from_parts(parts, tonic_body))
                }
                Err(e) => Err(wasm_client_error_to_status(e)),
            }
            // _guard is dropped here, releasing the lock after the request completes
        };

        // For WASM, we need to use into_send to make the future Send
        into_send(fut)
    }

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.client
            .poll_ready(cx)
            .map_err(wasm_client_error_to_status)
    }
}

/// Map [`tonic_web_wasm_client::Error`] to [`tonic::Status`].
///
/// TODO: Add more error handling.
fn wasm_client_error_to_status(e: tonic_web_wasm_client::Error) -> Status {
    match e {
        tonic_web_wasm_client::Error::TonicStatusError(status) => status,
        _ => Status::internal(format!("Failed to call gRPC service: {}", e)),
    }
}

/// backon::Sleeper implementation for Wasm.
///
/// ## Note
///
/// It is already implemented in [::backon] crate, but it is not Send, so it cannot be used in our context.
/// We reimplement it here to make it Send.
// TODO: Consider moving it to different module.
#[derive(Default, Clone, Debug)]
pub struct WasmBackonSleeper {}
impl backon::Sleeper for WasmBackonSleeper {
    type Sleep = BoxFuture<'static, ()>;
    fn sleep(&self, dur: Duration) -> Self::Sleep {
        into_send(gloo_timers::future::sleep(dur)).boxed()
    }
}

/// Sleep for the given duration, wrapped to be Send-compatible.
///
/// This uses [into_send] to convert the non-Send gloo_timers future into a Send future.
pub fn into_send_sleep(dur: Duration) -> BoxFuture<'static, ()> {
    into_send(gloo_timers::future::sleep(dur)).boxed()
}

/// Convert a future into a boxed future that can be sent between threads.
///
/// This is a workaround using oneshot channel to synchronize.
/// It spawns a local task that sends the result of the future to the channel.
///
/// ## Panics
///
/// It panics if the receiver is dropped (e.g. `f` panics or is cancelled) before the sender sends the result.
fn into_send<'a, F: Future + 'static>(f: F) -> BoxFuture<'a, F::Output>
where
    F::Output: Send,
{
    let (tx, rx) = oneshot::channel::<F::Output>();
    spawn_local(async move {
        tx.send(f.await).ok();
    });

    rx.unwrap_or_else(|e| panic!("Failed to receive result: {:?}", e))
        .boxed()
}
