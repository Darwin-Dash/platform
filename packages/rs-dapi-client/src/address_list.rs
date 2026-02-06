//! Subsystem to manage DAPI nodes.

use crate::Uri;
use chrono::Utc;
use rand::{rngs::SmallRng, seq::IteratorRandom, SeedableRng};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::str::FromStr;
use arc_swap::ArcSwap;
use std::sync::Arc;
use std::time::Duration;

const DEFAULT_BASE_BAN_PERIOD: Duration = Duration::from_secs(60);

/// DAPI address.
#[derive(Debug, Clone, Eq)]
#[cfg_attr(feature = "mocks", derive(serde::Serialize, serde::Deserialize))]
pub struct Address(#[cfg_attr(feature = "mocks", serde(with = "http_serde::uri"))] Uri);

impl FromStr for Address {
    type Err = AddressListError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Uri::from_str(s)
            .map_err(|e| AddressListError::InvalidAddressUri(e.to_string()))
            .map(Address::try_from)?
    }
}

impl PartialEq<Self> for Address {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl PartialEq<Uri> for Address {
    fn eq(&self, other: &Uri) -> bool {
        self.0 == *other
    }
}

impl Hash for Address {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl TryFrom<Uri> for Address {
    type Error = AddressListError;

    fn try_from(value: Uri) -> Result<Self, Self::Error> {
        if value.host().is_none() {
            return Err(AddressListError::InvalidAddressUri(
                "uri must contain host".to_string(),
            ));
        }

        Ok(Address(value))
    }
}

impl Address {
    /// Get [Uri] of a node.
    pub fn uri(&self) -> &Uri {
        &self.0
    }
}

/// Address status
/// Contains information about the number of bans and the time until the next ban is lifted.
#[derive(Debug, Default, Clone)]
pub struct AddressStatus {
    ban_count: usize,
    banned_until: Option<chrono::DateTime<Utc>>,
}

impl AddressStatus {
    /// Ban the [Address] so it won't be available through [AddressList::get_live_address] for some time.
    pub fn ban(&mut self, base_ban_period: &Duration) {
        let coefficient = (self.ban_count as f64).exp();
        let ban_period = Duration::from_secs_f64(base_ban_period.as_secs_f64() * coefficient);

        self.banned_until = Some(chrono::Utc::now() + ban_period);
        self.ban_count += 1;
    }

    /// Check if [Address] is banned.
    pub fn is_banned(&self) -> bool {
        self.ban_count > 0
    }

    /// Clears ban record.
    pub fn unban(&mut self) {
        self.ban_count = 0;
        self.banned_until = None;
    }
}

/// [AddressList] errors
#[derive(Debug, thiserror::Error, Clone)]
#[cfg_attr(feature = "mocks", derive(serde::Serialize, serde::Deserialize))]
pub enum AddressListError {
    /// A valid uri is required to create an Address
    #[error("unable parse address: {0}")]
    #[cfg_attr(feature = "mocks", serde(skip))]
    InvalidAddressUri(String),
}

/// A structure to manage DAPI addresses to select from
/// for [DapiRequest](crate::DapiRequest) execution.
#[derive(Debug)]
pub struct AddressList {
    addresses: ArcSwap<HashMap<Address, AddressStatus>>,
    base_ban_period: Duration,
}

impl Clone for AddressList {
    fn clone(&self) -> Self {
        AddressList {
            addresses: ArcSwap::new(self.addresses.load_full()),
            base_ban_period: self.base_ban_period,
        }
    }
}

impl Default for AddressList {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for Address {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl AddressList {
    /// Creates an empty [AddressList] with default base ban time.
    pub fn new() -> Self {
        AddressList::with_settings(DEFAULT_BASE_BAN_PERIOD)
    }

    /// Creates an empty [AddressList] with adjustable base ban time.
    pub fn with_settings(base_ban_period: Duration) -> Self {
        AddressList {
            addresses: ArcSwap::new(Arc::new(HashMap::new())),
            base_ban_period,
        }
    }

    /// Bans address
    /// Returns false if the address is not in the list.
    pub fn ban(&self, address: &Address) -> bool {
        if !self.addresses.load().contains_key(address) {
            return false;
        }

        let address_clone = address.clone();
        let base_ban_period = self.base_ban_period;
        self.addresses.rcu(|current| {
            let mut new_map = (**current).clone();
            if let Some(status) = new_map.get_mut(&address_clone) {
                status.ban(&base_ban_period);
            }
            Arc::new(new_map)
        });
        true
    }

    /// Clears address' ban record
    /// Returns false if the address is not in the list.
    pub fn unban(&self, address: &Address) -> bool {
        if !self.addresses.load().contains_key(address) {
            return false;
        }

        let address_clone = address.clone();
        self.addresses.rcu(|current| {
            let mut new_map = (**current).clone();
            if let Some(status) = new_map.get_mut(&address_clone) {
                status.unban();
            }
            Arc::new(new_map)
        });
        true
    }

    /// Check if the address is banned.
    pub fn is_banned(&self, address: &Address) -> bool {
        self.addresses
            .load()
            .get(address)
            .map(|status| status.is_banned())
            .unwrap_or(false)
    }

    /// Adds a node [Address] to [AddressList]
    /// Returns false if the address is already in the list.
    pub fn add(&mut self, address: Address) -> bool {
        // Check if address already exists
        if self.addresses.load().contains_key(&address) {
            return false;
        }

        self.addresses.rcu(|current| {
            let mut new_map = (**current).clone();
            new_map
                .entry(address.clone())
                .or_insert_with(AddressStatus::default);
            Arc::new(new_map)
        });
        true
    }

    /// Remove address from the list
    /// Returns [AddressStatus] if the address was in the list.
    pub fn remove(&mut self, address: &Address) -> Option<AddressStatus> {
        // Get the status first if it exists
        let status = self.addresses.load().get(address).cloned();

        if status.is_some() {
            let address_clone = address.clone();
            self.addresses.rcu(|current| {
                let mut new_map = (**current).clone();
                new_map.remove(&address_clone);
                Arc::new(new_map)
            });
        }

        status
    }

    #[deprecated]
    // TODO: Remove in favor of add
    /// Add a node [Address] to [AddressList] by [Uri].
    /// Returns false if the address is already in the list.
    pub fn add_uri(&mut self, uri: Uri) -> bool {
        self.add(Address::try_from(uri).expect("valid uri"))
    }

    /// Randomly select a not banned address.
    pub fn get_live_address(&self) -> Option<Address> {
        let guard = self.addresses.load();

        let mut rng = SmallRng::from_entropy();

        let now = chrono::Utc::now();

        guard
            .iter()
            .filter(|(_, status)| {
                status
                    .banned_until
                    .map(|banned_until| banned_until < now)
                    .unwrap_or(true)
            })
            .choose(&mut rng)
            .map(|(addr, _)| addr.clone())
    }

    /// Get number of all addresses, both banned and not banned.
    pub fn len(&self) -> usize {
        self.addresses.load().len()
    }

    /// Check if the list is empty.
    /// Returns true if there are no addresses in the list.
    /// Returns false if there is at least one address in the list.
    /// Banned addresses are also counted.
    pub fn is_empty(&self) -> bool {
        self.addresses.load().is_empty()
    }
}

impl IntoIterator for AddressList {
    type Item = (Address, AddressStatus);
    type IntoIter = std::collections::hash_map::IntoIter<Address, AddressStatus>;

    fn into_iter(self) -> Self::IntoIter {
        let old_arc = self.addresses.swap(Arc::new(HashMap::new()));
        match Arc::try_unwrap(old_arc) {
            Ok(map) => map.into_iter(),
            Err(arc) => (*arc).clone().into_iter(),
        }
    }
}

impl FromStr for AddressList {
    type Err = AddressListError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let uri_list: Vec<Address> = s
            .split(',')
            .map(Address::from_str)
            .collect::<Result<_, _>>()?;

        Ok(Self::from_iter(uri_list))
    }
}

impl FromIterator<Address> for AddressList {
    fn from_iter<T: IntoIterator<Item = Address>>(iter: T) -> Self {
        let mut address_list = Self::new();
        for uri in iter {
            address_list.add(uri);
        }

        address_list
    }
}

#[cfg(test)]
mod concurrency_tests {
    use super::*;
    use std::thread;

    #[test]
    fn concurrent_reads_do_not_block() {
        let mut list = AddressList::new();
        list.add("http://127.0.0.1:1".parse().unwrap());
        list.add("http://127.0.0.1:2".parse().unwrap());

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let l = list.clone();
                thread::spawn(move || {
                    for _ in 0..1000 {
                        let _ = l.len();
                        let _ = l.get_live_address();
                        let _ = l.is_banned(&"http://127.0.0.1:1".parse().unwrap());
                    }
                })
            })
            .collect();

        for h in handles {
            h.join().expect("no thread should panic with lock errors");
        }
    }

    #[test]
    fn concurrent_reads_and_writes() {
        let mut list = AddressList::new();
        for i in 0..10 {
            list.add(format!("http://127.0.0.1:{}", i).parse().unwrap());
        }

        let list1 = list.clone();
        let list2 = list.clone();

        let reader = thread::spawn(move || {
            for _ in 0..1000 {
                let _ = list1.len();
                let _ = list1.get_live_address();
            }
        });

        let writer = thread::spawn(move || {
            let addr: Address = "http://127.0.0.1:0".parse().unwrap();
            for _ in 0..100 {
                list2.ban(&addr);
                list2.unban(&addr);
            }
        });

        reader.join().unwrap();
        writer.join().unwrap();
    }
}
