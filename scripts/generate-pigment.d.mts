export const PIGMENT_SIZE: number;
export const PIGMENT_SEED: number;
export function pigmentPixels(size?: number, seed?: number): Buffer;
export function generatePigment(): Promise<{ bytes: number; sha256: string }>;
