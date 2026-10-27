import "server-only";
import { imageSize } from "image-size";

/** Width and height of an image, corrected for EXIF rotation. Undefined when not an image we can read. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  try {
    const dims = imageSize(bytes);
    if (!dims.width || !dims.height) return undefined;
    // EXIF orientations 5-8 rotate the image a quarter turn.
    const rotated = (dims.orientation ?? 1) >= 5;
    return rotated ? { width: dims.height, height: dims.width } : { width: dims.width, height: dims.height };
  } catch {
    return undefined;
  }
}
