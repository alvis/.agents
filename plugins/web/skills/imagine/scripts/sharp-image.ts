import sharp from "sharp@0.34";

import { ImagineError } from "./providers/base";

/**
 * re-encodes image bytes into the requested raster format
 * @param bytes raw image bytes to convert
 * @param output_format target format such as png or jpeg
 * @returns re-encoded image bytes
 * @throws ImagineError when the sharp pipeline rejects the input
 */
export async function convert_image_format(
  bytes: Uint8Array,
  output_format: string,
): Promise<Uint8Array> {
  try {
    const pipeline = sharp(bytes);
    if (output_format === "jpeg") pipeline.flatten({ background: "#fff" });
    return new Uint8Array(await pipeline.toFormat(output_format).toBuffer());
  } catch (cause) {
    throw new ImagineError("Converting image format failed.", 1, { cause });
  }
}

/**
 * downscales image bytes to fit inside a square bound without enlarging
 * @param bytes raw image bytes to resize
 * @param max_dim maximum width and height in pixels
 * @param output_format target format; jpg is normalized to jpeg so flattening applies
 * @returns resized image bytes
 * @throws ImagineError when the sharp pipeline rejects the input
 */
export async function downscale_image(
  bytes: Uint8Array,
  max_dim: number,
  output_format: string,
): Promise<Uint8Array> {
  try {
    const format = output_format === "jpg" ? "jpeg" : output_format;
    return new Uint8Array(
      await sharp(bytes)
        .resize({
          width: max_dim,
          height: max_dim,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten(format === "jpeg" ? { background: "#fff" } : false)
        .toFormat(format)
        .toBuffer(),
    );
  } catch (cause) {
    throw new ImagineError("Downscaling image failed.", 1, { cause });
  }
}
