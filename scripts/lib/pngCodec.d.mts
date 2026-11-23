export interface DecodedPngImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createImage(
  width: number,
  height: number,
  fillRgba?: [number, number, number, number] | null
): DecodedPngImage;

export function decodePng(buffer: Buffer): DecodedPngImage;
export function encodeImageToPng(img: DecodedPngImage): Buffer;
export function isValidPngBuffer(buf: Buffer): boolean;
export function resizeNearest(
  src: DecodedPngImage,
  targetWidth: number,
  targetHeight: number
): DecodedPngImage;
