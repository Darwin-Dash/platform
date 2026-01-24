/**
 * Type declarations for @dashevo/dashcore-lib
 *
 * This is a minimal declaration file for the parts of dashcore-lib
 * used by transaction-finder.
 */

declare module '@dashevo/dashcore-lib' {
  export class Transaction {
    constructor(hex?: string | Buffer);
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
    hash: string;
    id: string;

    static fromBuffer(buffer: Buffer): Transaction;
    toBuffer(): Buffer;
    toString(): string;
    isCoinbase(): boolean;
  }

  export class MerkleBlock {
    constructor(arg?: Buffer | object);

    static fromBuffer(buffer: Buffer): MerkleBlock;

    header: {
      hash: string;
      version: number;
      prevHash: Buffer;
      merkleRoot: Buffer;
      time: number;
      bits: number;
      nonce: number;
    };
    numTransactions: number;
    hashes: Buffer[];
    flags: Buffer;

    toBuffer(): Buffer;
    hasTransaction(transaction: Transaction | string): boolean;
    validMerkleTree(): boolean;
    filteredTxsHash(): string[];
  }

  export class InstantLock {
    constructor(arg?: Buffer | object);

    static fromBuffer(buffer: Buffer): InstantLock;
    static fromObject(obj: object): InstantLock;

    inputs: Array<{ outpointHash: Buffer; outpointIndex: number }>;
    txid: string;
    signature: Buffer;

    toBuffer(): Buffer;
    toObject(): object;
    verify(): boolean;
  }

  export class ChainLock {
    constructor(arg?: Buffer | object);

    static fromBuffer(buffer: Buffer): ChainLock;
    static fromObject(obj: object): ChainLock;

    height: number;
    blockHash: Buffer;
    signature: Buffer;

    toBuffer(): Buffer;
    toObject(): object;
    verify(): boolean;
  }

  export interface TransactionInput {
    prevTxId: Buffer;
    outputIndex: number;
    script: Script;
    sequenceNumber: number;
  }

  export interface TransactionOutput {
    satoshis: number;
    script: Script;
  }

  export class Script {
    constructor(data?: string | Buffer);

    static fromBuffer(buffer: Buffer): Script;
    static fromHex(hex: string): Script;

    toBuffer(): Buffer;
    toHex(): string;
    toAddress(network?: string | Network): Address;
    isPublicKeyHashOut(): boolean;
    isScriptHashOut(): boolean;
  }

  export class Address {
    constructor(data: string | Buffer | object, network?: string | Network);

    static fromString(str: string, network?: string | Network): Address;
    static fromScript(script: Script, network?: string | Network): Address;
    static fromBuffer(buffer: Buffer, network?: string | Network): Address;

    toString(): string;
    toBuffer(): Buffer;
    hashBuffer: Buffer;
    network: Network;
  }

  export class PrivateKey {
    constructor(key?: string | Buffer, network?: string | Network);

    static fromWIF(wif: string): PrivateKey;

    toWIF(): string;
    toBuffer(): Buffer;
    toPublicKey(): PublicKey;
    toAddress(network?: string | Network): Address;
  }

  export class PublicKey {
    constructor(key: string | Buffer);

    static fromBuffer(buffer: Buffer): PublicKey;

    toBuffer(): Buffer;
    toAddress(network?: string | Network): Address;
    toString(): string;
  }

  export interface Network {
    name: string;
    alias: string;
    pubkeyhash: number;
    privatekey: number;
    scripthash: number;
    xpubkey: number;
    xprivkey: number;
  }

  export const Networks: {
    mainnet: Network;
    testnet: Network;
    livenet: Network;
    add(network: Network): Network;
    get(name: string): Network | undefined;
  };

  export namespace crypto {
    export class Hash {
      static sha256(buffer: Buffer): Buffer;
      static sha256sha256(buffer: Buffer): Buffer;
      static ripemd160(buffer: Buffer): Buffer;
      static sha256ripemd160(buffer: Buffer): Buffer;
    }
  }

  export namespace encoding {
    export class BufferReader {
      constructor(buffer: Buffer);
      readUInt8(): number;
      readUInt16LE(): number;
      readUInt32LE(): number;
      readInt32LE(): number;
      readUInt64LEBN(): any;
      readVarintNum(): number;
      readVarLengthBuffer(): Buffer;
      read(length: number): Buffer;
      finished(): boolean;
    }

    export class BufferWriter {
      constructor();
      write(buffer: Buffer): BufferWriter;
      writeUInt8(value: number): BufferWriter;
      writeUInt16LE(value: number): BufferWriter;
      writeUInt32LE(value: number): BufferWriter;
      writeInt32LE(value: number): BufferWriter;
      writeUInt64LEBN(value: any): BufferWriter;
      writeVarintNum(value: number): BufferWriter;
      writeVarLengthBuffer(buffer: Buffer): BufferWriter;
      toBuffer(): Buffer;
    }
  }

  export class BloomFilter {
    constructor(nElements: number, fpRate: number, nTweak?: number, nFlags?: number);

    static BLOOM_UPDATE_NONE: number;
    static BLOOM_UPDATE_ALL: number;
    static BLOOM_UPDATE_P2PUBKEY_ONLY: number;
    static MAX_BLOOM_FILTER_SIZE: number;
    static MAX_HASH_FUNCS: number;

    insert(element: Buffer): void;
    toBuffer(): Buffer;
    toObject(): { filter: Buffer; nHashFuncs: number; nTweak: number; nFlags: number };
  }

  export default {
    Transaction,
    MerkleBlock,
    InstantLock,
    ChainLock,
    Script,
    Address,
    PrivateKey,
    PublicKey,
    Networks,
    crypto,
    encoding,
    BloomFilter,
  };
}
