export interface RawPngImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function isValidPngBuffer(buf: Buffer): boolean;
export function createImage(width: number, height: number, fillRgba?: number[] | null): RawPngImage;
export function decodePng(buffer: Buffer): RawPngImage;
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer;
export function encodeImageToPng(img: RawPngImage): Buffer;
