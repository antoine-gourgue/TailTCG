export type CardHashes = { whole: Uint8Array; art: Uint8Array };
export type Affine = { z: number; dx: number; dy: number; rot: number };
export declare const HASH_BITS: number;
export declare function phashGray(g: Float32Array | Uint8Array): Uint8Array;
export declare function cardGray(input: Buffer | Uint8Array): Promise<Uint8Array>;
export declare function hashesFromGray(g: Uint8Array, t?: Affine): CardHashes;
export declare function hashCard(input: Buffer | Uint8Array): Promise<CardHashes>;
export declare function hashCardVariants(
  input: Buffer | Uint8Array
): Promise<{ coarse: CardHashes[]; dense: CardHashes[] }>;
export declare function hamming(a: Uint8Array, b: Uint8Array): number;
export declare const toB64: (u8: Uint8Array) => string;
export declare const fromB64: (s: string) => Uint8Array;
