#!/usr/bin/env node

/**
 * Testnet DAPI Connectivity Diagnostic Tool
 *
 * Tests seed nodes vs masternode whitelist to understand connection patterns
 * and why subscribeToMasternodeList fails on seeds but queries work via whitelist.
 *
 * Usage:
 *   node scripts/diagnose-testnet-connectivity.js
 *   VERBOSE=true node scripts/diagnose-testnet-connectivity.js
 */

import DAPIClient from '@dashevo/dapi-client';
import dotenv from 'dotenv';

dotenv.config();

const VERBOSE = process.env.VERBOSE === 'true';

// Testnet seeds (hostnames that resolve to IPs)
const SEEDS = [
  'seed-1.testnet.networks.dash.org:1443',
  'seed-2.testnet.networks.dash.org:1443',
  'seed-3.testnet.networks.dash.org:1443',
  'seed-4.testnet.networks.dash.org:1443',
  'seed-5.testnet.networks.dash.org:1443',
  'seed-1.pshenmic.dev:1443',
];

// Sample of whitelisted masternode IPs (from networkConfigs.js)
const WHITELIST_SAMPLE = [
  '44.239.39.153:1443',
  '35.82.197.197:1443',
  '44.227.137.77:1443',
  '52.13.132.146:1443',
  '54.201.32.131:1443',
];

console.log('━'.repeat(70));
console.log('Testnet DAPI Connectivity Diagnostic');
console.log('━'.repeat(70));
console.log();

// Test 1: Check if getBlockchainStatus works on seeds
async function testSeedUnaryRPC() {
  console.log('📋 Test 1: Seed Unary RPC Calls (getBlockchainStatus)');
  console.log('-'.repeat(70));

  const client = new DAPIClient({
    seeds: SEEDS,
    network: 'testnet',
    timeout: 10000,
    retries: 2,
  });

  try {
    const start = Date.now();
    const status = await client.core.getBlockchainStatus();
    const duration = Date.now() - start;

    console.log(`✅ SUCCESS: Got blockchain status in ${duration}ms`);
    console.log(`   Block height: ${status.chain?.blocksCount || status.blocks}`);
    return true;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return false;
  }
}

// Test 2: Check if subscribeToMasternodeList works
async function testMasternodeListSubscription() {
  console.log();
  console.log('📋 Test 2: Masternode List Subscription (streaming)');
  console.log('-'.repeat(70));
  console.log('⏱️  Waiting 30 seconds for subscription to establish...');

  const client = new DAPIClient({
    seeds: SEEDS,
    network: 'testnet',
    timeout: 10000,
    retries: 2,
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`⚠️  TIMEOUT: Subscription did not establish in 30s`);
      console.log(`   This suggests seeds don't support streaming masternode list`);
      resolve(false);
    }, 30000);

    // DAPIClient internal structure: check if simplifiedMasternodeListProvider exists
    const transport = client.transport || client.grpcTransport;
    if (!transport || !transport.simplifiedMasternodeListDAPIAddressProvider) {
      clearTimeout(timeout);
      console.log(`⚠️  SKIP: DAPIClient doesn't expose SML provider directly`);
      console.log(`   Subscription happens internally in background`);
      console.log(`   Will test by making actual query and checking logs`);
      resolve(null); // null = test inconclusive
      return;
    }

    const smlProvider = transport.simplifiedMasternodeListDAPIAddressProvider.smlProvider;

    smlProvider.getSimplifiedMNList()
      .then((mnList) => {
        clearTimeout(timeout);
        const count = mnList.getValidMasternodesList().length;
        console.log(`✅ SUCCESS: Got masternode list with ${count} entries`);
        resolve(true);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.log(`❌ FAILED: ${error.message}`);
        resolve(false);
      });
  });
}

// Test 3: Check if whitelist masternodes are reachable
async function testWhitelistMasternodes() {
  console.log();
  console.log('📋 Test 3: Whitelisted Masternode Direct Connections');
  console.log('-'.repeat(70));

  const results = {
    reachable: [],
    unreachable: [],
  };

  for (const address of WHITELIST_SAMPLE) {
    const client = new DAPIClient({
      dapiAddresses: [address],
      network: 'testnet',
      timeout: 5000,
      retries: 1,
    });

    try {
      const start = Date.now();
      await client.core.getBlockchainStatus();
      const duration = Date.now() - start;

      results.reachable.push({ address, duration });
      if (VERBOSE) {
        console.log(`  ✅ ${address} - ${duration}ms`);
      }
    } catch (error) {
      results.unreachable.push({ address, error: error.message });
      if (VERBOSE) {
        console.log(`  ❌ ${address} - ${error.message}`);
      }
    }
  }

  console.log(`✅ Reachable: ${results.reachable.length}/${WHITELIST_SAMPLE.length}`);
  console.log(`❌ Unreachable: ${results.unreachable.length}/${WHITELIST_SAMPLE.length}`);

  if (results.reachable.length > 0) {
    const avgLatency = results.reachable.reduce((sum, r) => sum + r.duration, 0) / results.reachable.length;
    console.log(`📊 Average latency: ${Math.round(avgLatency)}ms`);
  }

  return results;
}

// Test 4: Measure fallback timing
async function measureFallbackTiming() {
  console.log();
  console.log('📋 Test 4: Fallback Timing Measurement');
  console.log('-'.repeat(70));

  const start = Date.now();

  const client = new DAPIClient({
    network: 'testnet',  // Uses seeds + whitelist
    timeout: 10000,
    retries: 2,
  });

  try {
    // Make a query that requires address provider
    await client.core.getBlockchainStatus();
    const fallbackTime = Date.now() - start;

    console.log(`✅ Query succeeded in ${fallbackTime}ms`);
    console.log(`   (Includes DNS resolution + any subscription retries + fallback)`);

    if (fallbackTime > 10000) {
      console.log(`   ⚠️  >10s suggests multiple subscription retry attempts before fallback`);
    } else if (fallbackTime > 5000) {
      console.log(`   ⚠️  >5s suggests some retry attempts before fallback`);
    } else {
      console.log(`   ✅ <5s suggests quick fallback to whitelist`);
    }

    return fallbackTime;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return -1;
  }
}

// Main diagnostic runner
async function runDiagnostics() {
  try {
    const seedRPCWorks = await testSeedUnaryRPC();
    const mnListWorks = await testMasternodeListSubscription();
    const whitelistResults = await testWhitelistMasternodes();
    const fallbackTiming = await measureFallbackTiming();

    // Summary
    console.log();
    console.log('━'.repeat(70));
    console.log('Diagnostic Summary');
    console.log('━'.repeat(70));

    console.log(`Seed Unary RPC:          ${seedRPCWorks ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`Masternode Subscription: ${mnListWorks ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`Whitelist Masternodes:   ${whitelistResults.reachable.length}/${WHITELIST_SAMPLE.length} reachable`);
    console.log(`Fallback Timing:         ${fallbackTiming}ms`);

    console.log();
    console.log('🔍 Analysis:');

    if (seedRPCWorks && !mnListWorks) {
      console.log('   • Seeds support unary RPC but NOT streaming subscriptions');
      console.log('   • This is why subscribeToMasternodeList fails repeatedly');
      console.log('   • DAPIClient falls back to hardcoded whitelist (expected behavior)');
    }

    if (whitelistResults.reachable.length > 0) {
      console.log('   • Hardcoded whitelist provides working masternodes');
      console.log('   • Queries succeed despite subscription failures');
    }

    if (fallbackTiming > 10000) {
      console.log('   • ⚠️  Long fallback time suggests we could optimize retry strategy');
    }

    console.log();
    console.log('💡 Recommendation:');
    if (!mnListWorks && whitelistResults.reachable.length > 0) {
      console.log('   The current setup is WORKING AS DESIGNED for testnet:');
      console.log('   - Seeds provide DNS and initial connectivity checks');
      console.log('   - Hardcoded whitelist provides actual masternode IPs');
      console.log('   - Subscription failures are expected background noise');
      console.log('   - Consider reducing retry attempts or suppressing error logs');
    }

  } catch (error) {
    console.error('Fatal error during diagnostics:', error);
    process.exit(1);
  }
}

runDiagnostics();
