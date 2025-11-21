import * as wasm from '../wasm.js';
export class DpnsFacade {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    async convertToHomographSafe(input) {
        await wasm.ensureInitialized();
        return wasm.WasmSdk.dpnsConvertToHomographSafe(input);
    }
    async isValidUsername(label) {
        await wasm.ensureInitialized();
        return wasm.WasmSdk.dpnsIsValidUsername(label);
    }
    async isContestedUsername(label) {
        await wasm.ensureInitialized();
        return wasm.WasmSdk.dpnsIsContestedUsername(label);
    }
    async isNameAvailable(label) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.dpnsIsNameAvailable(label);
    }
    async resolveName(name) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.dpnsResolveName(name);
    }
    async registerName(args) {
        const { label, identityId, publicKeyId, privateKeyWif, onPreorder } = args;
        const w = await this.sdk.getWasmSdkConnected();
        return w.dpnsRegisterName(label, identityId, publicKeyId, privateKeyWif, onPreorder ?? null);
    }
    async usernames(identityId, opts = {}) {
        const { limit } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsernames(identityId, limit ?? null);
    }
    async username(identityId) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsername(identityId);
    }
    async usernamesWithProof(identityId, opts = {}) {
        const { limit } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsernamesWithProofInfo(identityId, limit ?? null);
    }
    async usernameWithProof(identityId) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsernameWithProofInfo(identityId);
    }
    async getUsernameByName(username) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsernameByName(username);
    }
    async getUsernameByNameWithProof(username) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getDpnsUsernameByNameWithProofInfo(username);
    }
}
