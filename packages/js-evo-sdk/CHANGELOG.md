# Changelog

All notable changes to the js-evo-sdk package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Core SDK
- `EvoSDK` class as the main entry point for all Dash Platform operations
- 12 specialized facades providing clean, domain-specific APIs:
  - `identities` - Identity lifecycle management (create, fetch, top-up, update)
  - `dpns` - Dash Platform Naming Service (name registration and resolution)
  - `documents` - Document CRUD operations (create, query, replace, delete, transfer, purchase)
  - `tokens` - Token operations (mint, burn, transfer, freeze, balance queries)
  - `dashpay` - Social payments (profiles, contact requests, contacts)
  - `contracts` - Data contract management (fetch, publish, update, history)
  - `addresses` - Platform address operations (fund, transfer, withdraw)
  - `epoch` - Epoch information queries
  - `protocol` - Protocol version and upgrade state queries
  - `system` - System status and platform information
  - `group` - Group management and actions
  - `voting` - Contested resource voting and polls

#### Identity Operations
- Identity creation with wallet coordination (`createWithWallet`)
- UTXO-first workflow for identity creation (`findSpendableUTXO`, `createWithUTXO`)
- Identity top-up operations (`topUp`, `topUpWithWallet`, `topupWithUTXO`)
- Credit transfer between identities (`creditTransfer`)
- Credit withdrawal to blockchain addresses (`creditWithdrawal`)
- Identity key management (`getKeys`, `getKeysWithProof`, `update`)
- Identity discovery by public key hash (`discoverByHash`, `discoverByHashBatch`)
- Wallet-based identity discovery (`getIdentityIds`, `getNextAvailableIndex`)
- Balance queries (`balance`, `balances`, `balanceWithProof`, `balanceAndRevision`)
- Identity lookup by public key hash (`byPublicKeyHash`, `byNonUniquePublicKeyHash`)
- Token balance queries for identities (`tokenBalances`, `tokenBalancesWithProof`)
- Contract-specific key queries (`contractKeys`, `contractKeysWithProof`)
- Nonce queries (`nonce`, `nonceWithProof`, `contractNonce`, `contractNonceWithProof`)

#### DPNS Operations
- Name registration (`registerName`)
- Name resolution (`resolveName`)
- Name availability check (`isNameAvailable`)
- Username validation (`isValidUsername`, `isContestedUsername`)
- Homograph-safe name conversion (`convertToHomographSafe`)
- Username queries (`usernames`, `username`, `getUsernameByName`)
- Proof-verified queries (`usernamesWithProof`, `usernameWithProof`, `getUsernameByNameWithProof`)

#### Document Operations
- Document queries with flexible where clauses (`query`, `queryWithProof`)
- Single document retrieval (`get`, `getWithProof`)
- Document creation (`create`)
- Document replacement (`replace`)
- Document deletion (`delete`)
- Document ownership transfer (`transfer`)
- Document purchase functionality (`purchase`)
- Document price management (`setPrice`)
- Comprehensive error handling with context

#### Token Operations
- Token ID calculation from contract (`calculateId`)
- Total supply queries (`totalSupply`, `totalSupplyWithProof`)
- Token status queries (`statuses`, `statusesWithProof`)
- Balance queries for identities (`balances`, `balancesWithProof`, `identityBalances`)
- Token info queries (`identityTokenInfos`, `identitiesTokenInfos`)
- Direct purchase price queries (`directPurchasePrices`, `directPurchasePricesWithProof`)
- Contract info queries (`contractInfo`, `contractInfoWithProof`)
- Perpetual distribution claim queries (`perpetualDistributionLastClaim`)
- Token minting (`mint`)
- Token burning (`burn`)
- Token transfers (`transfer`)
- Token freezing/unfreezing (`freeze`, `unfreeze`)
- Frozen token destruction (`destroyFrozen`)
- Emergency actions (`emergencyAction`)
- Price management (`setPrice`)
- Direct purchase (`directPurchase`)
- Reward claims (`claim`)

#### DashPay Operations
- Profile management (`getProfile`, `getProfileWithProof`, `createProfile`, `updateProfile`)
- Contact request handling (`sendContactRequest`, `acceptContactRequest`)
- Inbound contact request queries (`getInboundContactRequests`)
- Outbound contact request queries (`getOutboundContactRequests`)
- Contact list queries (`getContacts`, `getContactsWithProof`)
- DashPay contract retrieval (`getContract`)
- DIP15 contact key derivation (`deriveContactKey`)

#### Wallet Functions
- BIP39 mnemonic generation (`generateMnemonic`)
- Mnemonic validation (`validateMnemonic`)
- Mnemonic to seed conversion (`mnemonicToSeed`)
- HD key derivation (`deriveKeyFromSeedPhrase`, `deriveKeyFromSeedWithPath`, `deriveKeyFromSeedWithExtendedPath`)
- DashPay contact key derivation (`deriveDashpayContactKey`)
- BIP44 derivation paths (mainnet/testnet)
- DIP9 derivation paths (mainnet/testnet)
- DIP13 identity key derivation paths (mainnet/testnet)
- Child public key derivation (`deriveChildPublicKey`)
- Extended key conversion (`xprvToXpub`)
- Key pair generation (`generateKeyPair`, `generateKeyPairs`)
- Key import from WIF/hex (`keyPairFromWif`, `keyPairFromHex`)
- Address utilities (`pubkeyToAddress`, `validateAddress`)
- Message signing (`signMessage`)

#### Platform Address Operations
- Address info queries (`get`, `getWithProof`, `getMany`, `getManyWithProof`)
- Credit transfers between addresses (`transfer`)
- Identity top-up from addresses (`topUpIdentity`)
- Credit withdrawal to Core (`withdraw`)
- Identity-to-address transfers (`transferFromIdentity`)
- Address funding from asset locks (`fundFromAssetLock`)
- Identity creation from addresses (`createIdentity`)

#### System Operations
- Platform status queries (`status`)
- Current quorum information (`currentQuorumsInfo`)
- Total platform credits query (`totalCreditsInPlatform`, `totalCreditsInPlatformWithProof`)
- Prefunded specialized balance queries (`prefundedSpecializedBalance`)
- State transition result waiting (`waitForStateTransitionResult`)
- Path element queries (`pathElements`, `pathElementsWithProof`)

#### Epoch Operations
- Epoch info queries (`epochsInfo`, `epochsInfoWithProof`)
- Finalized epoch queries (`finalizedInfos`, `finalizedInfosWithProof`)
- Current epoch query (`current`, `currentWithProof`)
- Evonode proposed blocks queries (`evonodesProposedBlocksByIds`, `evonodesProposedBlocksByRange`)

#### Group Operations
- Group info queries (`info`, `infos`, `infoWithProof`, `infosWithProof`)
- Group member queries (`members`, `membersWithProof`)
- Identity groups queries (`identityGroups`, `identityGroupsWithProof`)
- Group actions queries (`actions`, `actionsWithProof`)
- Action signer queries (`actionSigners`, `actionSignersWithProof`)
- Groups by data contracts (`groupsDataContracts`, `groupsDataContractsWithProof`)
- Contested resources queries (`contestedResources`, `contestedResourcesWithProof`)
- Contested resource voters queries (`contestedResourceVotersForIdentity`)

#### Voting Operations
- Contested resource vote state queries (`contestedResourceVoteState`, `contestedResourceVoteStateWithProof`)
- Identity vote queries (`contestedResourceIdentityVotes`, `contestedResourceIdentityVotesWithProof`)
- Vote polls by end date (`votePollsByEndDate`, `votePollsByEndDateWithProof`)
- Masternode voting (`masternodeVote`)

#### Protocol Operations
- Version upgrade state queries (`versionUpgradeState`, `versionUpgradeStateWithProof`)
- Version upgrade vote status (`versionUpgradeVoteStatus`, `versionUpgradeVoteStatusWithProof`)

#### Contract Operations
- Contract fetch (`fetch`, `fetchWithProof`)
- Contract history (`getHistory`, `getHistoryWithProof`)
- Batch contract fetch (`getMany`, `getManyWithProof`)
- Contract publishing (`publish`)
- Contract updates (`update`)

#### Demo Applications
- **CLI Demo** (`demo/cli/`) - Full-featured command-line interface
  - Identity management commands (discover, create, topup, get, balance)
  - DPNS commands (resolve, search, register)
  - Document commands (query, get)
  - Token commands (balance, supply)
  - Credit commands (transfer, withdraw)
  - System commands (status, epoch, version)
  - DashPay commands (profile, contacts)
  - Contract commands (get)
  - Onboarding workflow command
  - Network selection and verbose mode support

- **TUI Demo** (`demo/tui/`) - Interactive terminal UI built with Ink/React
  - Main menu navigation
  - Identity view with discovery and management
  - DPNS view for name operations
  - Documents view for queries
  - Tokens view for balance checks
  - DashPay view for profiles and contacts
  - System view for status monitoring
  - Settings view for configuration

- **Web Demo** (`demo/web/`) - Browser-based demonstration
  - Identity selector component
  - Name resolver component
  - Network switcher
  - Document viewer
  - DashPay manager
  - Contact requests viewer
  - Contacts viewer
  - Contested names viewer
  - Notification system
  - Wallet funding flow
  - State management system
  - Form validation utilities
  - Retry utilities
  - Task manager

#### Testing Infrastructure
- 26 test spec files across unit and integration tests
- Unit tests for all 12 facades with mocked WASM
- Unit tests for SDK initialization and wallet functions
- Unit tests for identity-specific facades:
  - `identity-fetcher.spec.mjs`
  - `identity-creator.spec.mjs`
  - `identity-updater.spec.mjs`
  - `identity-discovery.spec.mjs`
  - `credit-operations.spec.mjs`
  - `utxo-operations.spec.mjs`
- Unit tests for error handling (`identity-errors.spec.mjs`)
- Integration tests with real WASM SDK:
  - `documents.spec.ts`
  - `identity.spec.ts`
  - `dpns.spec.ts`
  - `tokens.spec.ts`
  - `wasm-concurrency.spec.ts`
- Vitest configuration for integration tests
- Playwright E2E test infrastructure for web demo:
  - `minimal.spec.js`
  - `identity-selector.spec.js`
  - `identity-creation.spec.js`
  - `network-switcher.spec.js`
  - `validation.spec.js`
  - `responsive.spec.js`
- Karma configuration for browser unit tests
- Mocha support for Node.js unit tests

### Technical

#### Architecture
- Facade pattern for clean API separation and maintainability
- WASM SDK integration via `@dashevo/wasm-sdk` workspace package
- Modular identity operations with specialized sub-facades:
  - `IdentityFetcher` - Read operations
  - `IdentityCreator` - Identity creation
  - `IdentityUpdater` - Top-up operations
  - `IdentityDiscovery` - Discovery by public key hash
  - `CreditOperations` - Credit transfers and withdrawals
- Coordination layer components:
  - `UTXOFinder` - UTXO discovery with TransactionFinder
  - `WalletCoordinator` - HD key derivation and address management
  - `TransactionBuilder` - Asset lock transaction construction
  - `AssetLockProofManager` - Proof waiting and verification
  - `IdentityKeyGenerator` - DIP13 key generation

#### Build System
- TypeScript with strict mode enabled
- ES modules output
- Webpack bundling for browser compatibility
- Browser polyfills via webpack fallbacks:
  - `stream-browserify` for stream support (required by cbor/nofilter)
  - `buffer` for Buffer support
  - `process` for Node.js process compatibility
- Terser for production minification
- Source maps for debugging

#### Browser Support
- Karma test runner with Chrome and Firefox launchers
- Full browser compatibility via webpack bundle
- WASM worker isolation for concurrent operations

#### Dependencies
- `@dashevo/wasm-sdk` - Core WASM SDK
- `@dashevo/dapi-client` - DAPI client for network communication
- `@dashevo/wallet-lib` - Wallet library integration
- `@dashevo/dashcore-lib` - Core library utilities
- `@dashevo/transaction-finder` - UTXO discovery
- Ink/React for TUI demo
- Commander for CLI demo
- Chalk for colored terminal output

#### Configuration
- Network configuration support (testnet, mainnet, local)
- Custom masternode addresses via `EvoSDK.withAddresses()`
- Trusted mode for faster connections
- Configurable connection settings (timeout, retries, ban behavior)
- Log level configuration via WASM SDK
- Environment variable support (`MNEMONIC`, `NETWORK`, `DAPI_ADDRESSES`)

[Unreleased]: https://github.com/dashpay/platform/compare/v2.1-dev...HEAD
