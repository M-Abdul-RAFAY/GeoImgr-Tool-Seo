// pages/api/upload.ts
import { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm } from "formidable";
import { promises as fs } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import {
  readMetadataUniversal,
  getFormatSupport,
} from "@/lib/comprehensive-metadata-utils";

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ImageData {
  id: string;
  filename: string;
  lat?: number;
  lon?: number;
  keywords?: string;
  description?: string;
  dateTime?: string;
  cameraMake?: string;
  cameraModel?: string;
  size: number;
  type: string;
  canReadGPS: boolean;
  canWriteGPS: boolean;
  canReadMetadata: boolean;
  canWriteMetadata: boolean;
  supportMethod: string;
  supportNotes: string;
}

// Ensure temp directory exists - use /tmp for Vercel
async function ensureTempDir() {
  const tempDir = "/tmp";
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

// Clean up old files to prevent /tmp from filling up
async function cleanupOldFiles(tempDir: string) {
  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const file of files) {
      try {
        const filePath = join(tempDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old file: ${file}`);
        }
      } catch (error) {
        console.warn(`Could not clean up file ${file}:`, error);
      }
    }
  } catch (error) {
    console.warn("Error during cleanup:", error);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const tempDir = await ensureTempDir();

    // Clean up old files first
    await cleanupOldFiles(tempDir);

    const form = new IncomingForm({
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      multiples: true,
    });

    const { files } = await new Promise<{ files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error("Form parse error:", err);
          reject(err);
        } else {
          resolve({ files });
        }
      });
    });

    const imageFiles = Array.isArray(files.images)
      ? files.images
      : [files.images].filter(Boolean);

    if (!imageFiles || imageFiles.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const processedImages: ImageData[] = [];
    const errors: string[] = [];

    for (const file of imageFiles) {
      try {
        if (!file || !file.filepath || !file.originalFilename) {
          errors.push(`Invalid file data for one of the uploaded files`);
          continue;
        }

        const id = uuidv4();
        const originalPath = file.filepath;
        const extension =
          file.originalFilename.split(".").pop()?.toLowerCase() || "jpg";
        const newFilename = `${id}.${extension}`;
        const newPath = join(tempDir, newFilename);

        // Move file to new location with UUID name
        try {
          await fs.rename(originalPath, newPath);
        } catch (renameError) {
          console.error("File rename error:", renameError);
          // Try copying instead
          const fileData = await fs.readFile(originalPath);
          await fs.writeFile(newPath, fileData);
          try {
            await fs.unlink(originalPath);
          } catch {
            // Ignore cleanup error
          }
        }

        // Get format information
        const mimeType = file.mimetype || getMimeTypeFromExtension(extension);
        const formatSupport = getFormatSupport(mimeType);

        let lat: number | undefined;
        let lon: number | undefined;
        let keywords: string | undefined;
        let description: string | undefined;
        let dateTime: string | undefined;
        let cameraMake: string | undefined;
        let cameraModel: string | undefined;

        // Read metadata using universal reader
        if (formatSupport.canReadMetadata) {
          try {
            const imageBuffer = await fs.readFile(newPath);
            const metadata = await readMetadataUniversal(imageBuffer, mimeType);

            if (metadata.gps) {
              lat = metadata.gps.lat;
              lon = metadata.gps.lon;
            }

            keywords = metadata.keywords;
            description = metadata.description;
            dateTime = metadata.dateTime;
            cameraMake = metadata.cameraMake;
            cameraModel = metadata.cameraModel;
          } catch (metadataError) {
            console.warn(
              `Could not read metadata for ${file.originalFilename}:`,
              metadataError
            );
            errors.push(
              `Warning: Could not read metadata from ${file.originalFilename}`
            );
          }
        }

        const imageData: ImageData = {
          id,
          filename: file.originalFilename,
          lat,
          lon,
          keywords,
          description,
          dateTime,
          cameraMake,
          cameraModel,
          size: file.size,
          type: mimeType,
          canReadGPS: formatSupport.canReadGPS,
          canWriteGPS: formatSupport.canWriteGPS,
          canReadMetadata: formatSupport.canReadMetadata,
          canWriteMetadata: formatSupport.canWriteMetadata,
          supportMethod: formatSupport.method,
          supportNotes: formatSupport.notes,
        };

        processedImages.push(imageData);

        console.log(`Processed ${file.originalFilename}:`, {
          id,
          lat,
          lon,
          keywords: keywords?.substring(0, 50),
          description: description?.substring(0, 50),
          canReadGPS: formatSupport.canReadGPS,
          canWriteGPS: formatSupport.canWriteGPS,
          method: formatSupport.method,
          notes: formatSupport.notes,
        });
      } catch (fileError) {
        console.error(
          `Error processing file ${file.originalFilename}:`,
          fileError
        );
        errors.push(
          `Failed to process ${file.originalFilename}: ${
            fileError instanceof Error ? fileError.message : "Unknown error"
          }`
        );
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({
        error: "No images could be processed",
        details: errors,
      });
    }

    const response: any = { images: processedImages };
    if (errors.length > 0) {
      response.warnings = errors;
    }

    // Add summary of format support
    const supportSummary = {
      totalFiles: processedImages.length,
      canReadGPS: processedImages.filter((img) => img.canReadGPS).length,
      canWriteGPS: processedImages.filter((img) => img.canWriteGPS).length,
      fullySupported: processedImages.filter(
        (img) => img.canReadGPS && img.canWriteGPS
      ).length,
      readOnly: processedImages.filter(
        (img) => img.canReadGPS && !img.canWriteGPS
      ).length,
      unsupported: processedImages.filter(
        (img) => !img.canReadGPS && !img.canWriteGPS
      ).length,
    };

    response.supportSummary = supportSummary;

    res.status(200).json(response);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Failed to process images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Helper function to get MIME type from file extension
function getMimeTypeFromExtension(extension: string): string {
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
