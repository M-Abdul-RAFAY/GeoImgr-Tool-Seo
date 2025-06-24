// pages/api/write.ts
import { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import { join } from "path";
import { exiftool } from "exiftool-vendored";

interface WriteRequest {
  id: string;
  lat: number;
  lon: number;
  keywords?: string;
  description?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, lat, lon, keywords, description }: WriteRequest = req.body;

    if (!id) {
      return res.status(400).json({ error: "Image ID is required" });
    }

    const tempDir = join(process.cwd(), "temp");

    // Find the file with this ID
    const files = await fs.readdir(tempDir);
    const imageFile = files.find((file) => file.startsWith(id));

    if (!imageFile) {
      return res.status(404).json({ error: "Image not found" });
    }

    const filePath = join(tempDir, imageFile);
    const outputPath = join(tempDir, `modified_${imageFile}`);

    // Prepare EXIF tags to write
    const tags: any = {};

    // Set GPS coordinates
    if (lat !== undefined && lon !== undefined) {
      tags.GPSLatitude = Math.abs(lat);
      tags.GPSLatitudeRef = lat >= 0 ? "N" : "S";
      tags.GPSLongitude = Math.abs(lon);
      tags.GPSLongitudeRef = lon >= 0 ? "E" : "W";
    }

    // Set keywords
    if (keywords && keywords.trim()) {
      const keywordArray = keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k);
      tags.Keywords = keywordArray;
      tags.XPKeywords = keywords;
      tags["IPTC:Keywords"] = keywordArray;
      tags["XMP:Subject"] = keywordArray;
    }

    // Set description
    if (description && description.trim()) {
      tags.ImageDescription = description;
      tags.XPComment = description;
      tags["IPTC:Caption-Abstract"] = description;
      tags["XMP:Description"] = description;
    }

    console.log("Writing EXIF tags:", tags);

    // Write EXIF tags to a new file
    try {
      await exiftool.write(filePath, tags, ["-o", outputPath]);
    } catch (exifError) {
      console.error("ExifTool write error:", exifError);

      // Fallback: try writing to the original file
      try {
        await exiftool.write(filePath, tags);
        // Copy the modified file to output path
        await fs.copyFile(filePath, outputPath);
      } catch (fallbackError) {
        console.error("Fallback write error:", fallbackError);
        return res.status(500).json({ error: "Failed to write EXIF tags" });
      }
    }

    // Read the modified file
    const modifiedBuffer = await fs.readFile(outputPath);

    // Get original filename info
    const extension = imageFile.split(".").pop();
    const mimeType = getMimeType(extension || "jpg");

    // Set response headers for file download
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="geotagged_${imageFile}"`
    );
    res.setHeader("Content-Length", modifiedBuffer.length);

    // Clean up files
    try {
      await fs.unlink(outputPath);
      // Optionally clean up the original file too
      // await fs.unlink(filePath);
    } catch (cleanupError) {
      console.warn("Cleanup error:", cleanupError);
    }

    // Send the modified image
    res.status(200).send(modifiedBuffer);
  } catch (error) {
    console.error("Write error:", error);
    res.status(500).json({ error: "Failed to write EXIF tags" });
  }
}

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

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}
