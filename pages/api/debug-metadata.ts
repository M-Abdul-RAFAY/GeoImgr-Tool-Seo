// pages/api/debug-metadata.ts
import { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import { join } from "path";
import { readMetadataUniversal } from "@/lib/comprehensive-metadata-utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Image ID is required" });
    }

    console.log("Debugging metadata for image:", id);

    // Use /tmp directory for Vercel serverless functions
    const tempDir = "/tmp";

    // Find the image file by ID
    let imageFile: string | null = null;
    try {
      const files = await fs.readdir(tempDir);
      imageFile = files.find((file) => file.startsWith(id)) || null;
    } catch (error) {
      console.error("Error reading temp directory:", error);
      return res
        .status(500)
        .json({ error: "Could not access temporary files" });
    }

    if (!imageFile) {
      return res.status(404).json({ error: "Image not found" });
    }

    const imagePath = join(tempDir, imageFile);

    // Check file exists
    try {
      await fs.access(imagePath);
    } catch {
      return res.status(404).json({ error: "Image file not found" });
    }

    // Read the image file
    const imageBuffer = await fs.readFile(imagePath);

    // Get file extension and MIME type
    const extension = imageFile.split(".").pop()?.toLowerCase() || "";
    const mimeType = getMimeType(extension);

    console.log(`Debugging ${mimeType} file: ${imageFile}`);

    // Read metadata using universal reader
    const metadata = await readMetadataUniversal(imageBuffer, mimeType);

    // For PNG files, also provide raw chunk information
    let rawChunks: any[] = [];
    if (mimeType === "image/png") {
      rawChunks = await debugPNGChunks(imageBuffer);
    }

    // Return detailed metadata information
    res.status(200).json({
      filename: imageFile,
      mimeType,
      fileSize: imageBuffer.length,
      metadata,
      rawChunks: mimeType === "image/png" ? rawChunks : undefined,
      debug: {
        hasGPS: !!metadata.gps,
        hasKeywords: !!metadata.keywords,
        hasDescription: !!metadata.description,
        hasDateTime: !!metadata.dateTime,
        hasCameraInfo: !!(metadata.cameraMake || metadata.cameraModel),
      },
    });
  } catch (error) {
    console.error("Debug metadata error:", error);

    res.status(500).json({
      error: "Failed to debug metadata",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Helper function for PNG chunk debugging
async function debugPNGChunks(imageBuffer: Buffer): Promise<any[]> {
  const chunks: any[] = [];

  if (imageBuffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return [{ error: "Not a valid PNG file" }];
  }

  let offset = 8;

  while (offset < imageBuffer.length - 8) {
    try {
      const chunkLength = imageBuffer.readUInt32BE(offset);
      const chunkType = imageBuffer.subarray(offset + 4, offset + 8).toString();
      const chunkData = imageBuffer.subarray(
        offset + 8,
        offset + 8 + chunkLength
      );

      const chunkInfo: any = {
        type: chunkType,
        length: chunkLength,
        offset: offset,
      };

      // Parse text chunks
      if (
        chunkType === "tEXt" ||
        chunkType === "iTXt" ||
        chunkType === "zTXt"
      ) {
        try {
          if (chunkType === "tEXt") {
            const nullIndex = chunkData.indexOf(0);
            chunkInfo.keyword = chunkData
              .subarray(0, nullIndex)
              .toString("latin1");
            chunkInfo.text = chunkData
              .subarray(nullIndex + 1)
              .toString("latin1");
          } else if (chunkType === "iTXt") {
            const nullIndex = chunkData.indexOf(0);
            chunkInfo.keyword = chunkData
              .subarray(0, nullIndex)
              .toString("utf8");

            // Parse iTXt structure
            let pos = nullIndex + 1;
            chunkInfo.compressionFlag = chunkData.readUInt8(pos++);
            chunkInfo.compressionMethod = chunkData.readUInt8(pos++);

            const langNull = chunkData.indexOf(0, pos);
            chunkInfo.languageTag = chunkData
              .subarray(pos, langNull)
              .toString("utf8");
            pos = langNull + 1;

            const translatedNull = chunkData.indexOf(0, pos);
            chunkInfo.translatedKeyword = chunkData
              .subarray(pos, translatedNull)
              .toString("utf8");
            pos = translatedNull + 1;

            chunkInfo.text = chunkData.subarray(pos).toString("utf8");
          }
        } catch (parseError) {
          chunkInfo.parseError =
            parseError instanceof Error ? parseError.message : "Parse error";
        }
      }

      chunks.push(chunkInfo);

      // Move to next chunk
      offset += 12 + chunkLength;
    } catch (chunkError) {
      chunks.push({
        error: "Failed to parse chunk",
        offset: offset,
        details:
          chunkError instanceof Error ? chunkError.message : "Unknown error",
      });
      break;
    }
  }

  return chunks;
}

// Helper function to get MIME type from extension
function getMimeType(extension: string): string {
  const mimeTypes: { [key: string]: string } = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
  };

  return mimeTypes[extension] || "image/jpeg";
}
