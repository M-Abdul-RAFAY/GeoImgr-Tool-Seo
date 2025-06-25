// pages/api/write.ts
import { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import { join } from "path";
import {
  writeMetadataUniversal,
  getFormatSupport,
} from "@/lib/comprehensive-metadata-utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, lat, lon, keywords, description } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Image ID is required" });
    }

    if (lat === undefined || lon === undefined) {
      return res
        .status(400)
        .json({ error: "Latitude and longitude are required" });
    }

    // Validate coordinate values
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res
        .status(400)
        .json({ error: "Invalid latitude or longitude values" });
    }

    if (latitude < -90 || latitude > 90) {
      return res
        .status(400)
        .json({ error: "Latitude must be between -90 and 90" });
    }

    if (longitude < -180 || longitude > 180) {
      return res
        .status(400)
        .json({ error: "Longitude must be between -180 and 180" });
    }

    console.log("Writing metadata for image:", id);
    console.log("Coordinates:", {
      lat: latitude,
      lon: longitude,
      type: typeof latitude,
    });
    console.log("Keywords:", keywords?.substring(0, 50) || "none");
    console.log("Description:", description?.substring(0, 50) || "none");

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

    // Read the original image
    const imageBuffer = await fs.readFile(imagePath);

    // Get file extension and MIME type
    const extension = imageFile.split(".").pop()?.toLowerCase() || "";
    const mimeType = getMimeType(extension);

    // Check format support
    const formatSupport = getFormatSupport(mimeType);

    if (!formatSupport.canWriteMetadata || !formatSupport.canWriteGPS) {
      return res.status(400).json({
        error: `GPS metadata writing not supported for ${mimeType}. ${formatSupport.notes}`,
        suggestion: getWritingSuggestion(mimeType),
        canRead: formatSupport.canReadGPS,
        canWrite: formatSupport.canWriteGPS,
      });
    }

    // Prepare metadata
    const metadata = {
      gps: { lat: latitude, lon: longitude },
      keywords: keywords?.trim() || undefined,
      description: description?.trim() || undefined,
    };

    console.log(`Writing ${formatSupport.method} metadata to ${mimeType} file`);
    console.log("Final metadata object:", JSON.stringify(metadata, null, 2));

    // Write metadata using universal writer
    const result = await writeMetadataUniversal(
      imageBuffer,
      metadata,
      mimeType
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error || "Failed to write metadata",
        formatSupport: formatSupport,
      });
    }

    // Verify the metadata was written correctly (especially for PNG)
    let verificationResult = null;
    if (
      result.buffer &&
      (mimeType === "image/png" || mimeType === "image/webp")
    ) {
      try {
        const {
          readMetadataUniversal,
        } = require("@/lib/comprehensive-metadata-utils");
        const verifiedMetadata = await readMetadataUniversal(
          result.buffer,
          mimeType
        );

        verificationResult = {
          gpsWritten: !!(
            verifiedMetadata.gps &&
            verifiedMetadata.gps.lat &&
            verifiedMetadata.gps.lon
          ),
          keywordsWritten: !!verifiedMetadata.keywords,
          descriptionWritten: !!verifiedMetadata.description,
          gpsMatch: verifiedMetadata.gps
            ? Math.abs(verifiedMetadata.gps.lat - metadata.gps.lat) <
                0.000001 &&
              Math.abs(verifiedMetadata.gps.lon - metadata.gps.lon) < 0.000001
            : false,
          keywordsMatch: verifiedMetadata.keywords === metadata.keywords,
          descriptionMatch:
            verifiedMetadata.description === metadata.description,
        };

        console.log("Metadata verification:", verificationResult);
      } catch (verifyError) {
        console.warn("Could not verify written metadata:", verifyError);
      }
    }

    // Set response headers for file download
    const originalFilename = imageFile.replace(/^[^.]+\./, "geotagged_");

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${originalFilename}"`
    );
    res.setHeader("Content-Length", result.buffer!.length);
    res.setHeader("X-Metadata-Method", formatSupport.method);
    res.setHeader(
      "X-Format-Support",
      JSON.stringify({
        canReadGPS: formatSupport.canReadGPS,
        canWriteGPS: formatSupport.canWriteGPS,
        method: formatSupport.method,
      })
    );

    if (verificationResult) {
      res.setHeader(
        "X-Metadata-Verification",
        JSON.stringify(verificationResult)
      );
    }

    // Send the modified image
    res.status(200).send(result.buffer);
  } catch (error) {
    console.error("Write metadata error:", error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }

    res.status(500).json({ error: "Failed to write metadata" });
  }
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

// Helper function to provide writing suggestions
function getWritingSuggestion(mimeType: string): string {
  const suggestions: { [key: string]: string } = {
    "image/heic":
      "Convert to JPEG format for GPS writing support. HEIC GPS writing is not supported in browsers.",
    "image/heif":
      "Convert to JPEG format for GPS writing support. HEIF GPS writing is not supported in browsers.",
  };

  return suggestions[mimeType] || "This format supports GPS metadata writing.";
}
