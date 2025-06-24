// pages/api/upload.ts
import { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm, File } from "formidable";
import { promises as fs } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { exiftool } from "exiftool-vendored";

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
  size: number;
  type: string;
}

// Ensure temp directory exists
async function ensureTempDir() {
  const tempDir = join(process.cwd(), "temp");
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

// Parse GPS coordinates from EXIF
function parseGPSCoordinates(tags: any): { lat?: number; lon?: number } {
  try {
    let lat: number | undefined;
    let lon: number | undefined;

    // Try different GPS tag formats
    if (tags.GPSLatitude && tags.GPSLongitude) {
      lat = tags.GPSLatitude;
      lon = tags.GPSLongitude;
    } else if (tags.GPS && tags.GPS.GPSLatitude && tags.GPS.GPSLongitude) {
      lat = tags.GPS.GPSLatitude;
      lon = tags.GPS.GPSLongitude;
    }

    // Apply GPS reference (N/S, E/W)
    if (lat !== undefined && tags.GPSLatitudeRef === "S") {
      lat = -lat;
    }
    if (lon !== undefined && tags.GPSLongitudeRef === "W") {
      lon = -lon;
    }

    return { lat, lon };
  } catch (error) {
    console.error("Error parsing GPS coordinates:", error);
    return {};
  }
}

// Extract keywords from various EXIF fields
function extractKeywords(tags: any): string {
  const keywordSources = [
    tags.Keywords,
    tags.XPKeywords,
    tags.Subject,
    tags["IPTC:Keywords"],
    tags["XMP:Subject"],
  ];

  for (const source of keywordSources) {
    if (source) {
      if (Array.isArray(source)) {
        return source.join(", ");
      }
      return String(source);
    }
  }

  return "";
}

// Extract description from various EXIF fields
function extractDescription(tags: any): string {
  const descriptionSources = [
    tags.ImageDescription,
    tags.XPComment,
    tags.UserComment,
    tags["IPTC:Caption-Abstract"],
    tags["XMP:Description"],
  ];

  for (const source of descriptionSources) {
    if (source && String(source).trim()) {
      return String(source).trim();
    }
  }

  return "";
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

    const form = new IncomingForm({
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
    });

    const { files } = await new Promise<{ files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ files });
      });
    });

    const imageFiles = Array.isArray(files.images)
      ? files.images
      : [files.images].filter(Boolean);

    if (!imageFiles || imageFiles.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const processedImages: ImageData[] = [];

    for (const file of imageFiles) {
      try {
        const id = uuidv4();
        const originalPath = file.filepath;
        const extension =
          file.originalFilename?.split(".").pop()?.toLowerCase() || "jpg";
        const newFilename = `${id}.${extension}`;
        const newPath = join(tempDir, newFilename);

        // Move file to new location with UUID name
        await fs.rename(originalPath, newPath);

        // Read EXIF data
        let tags: any = {};
        try {
          tags = await exiftool.read(newPath);
        } catch (exifError) {
          console.warn(
            "Could not read EXIF for",
            file.originalFilename,
            exifError
          );
        }

        // Parse GPS coordinates
        const { lat, lon } = parseGPSCoordinates(tags);

        // Extract keywords and description
        const keywords = extractKeywords(tags);
        const description = extractDescription(tags);

        const imageData: ImageData = {
          id,
          filename: file.originalFilename || newFilename,
          lat,
          lon,
          keywords,
          description,
          size: file.size,
          type: file.mimetype || "image/jpeg",
        };

        processedImages.push(imageData);

        console.log(`Processed ${file.originalFilename}:`, {
          lat,
          lon,
          keywords: keywords.substring(0, 50),
          description: description.substring(0, 50),
        });
      } catch (fileError) {
        console.error(
          "Error processing file:",
          file.originalFilename,
          fileError
        );
        // Continue processing other files
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({ error: "No images could be processed" });
    }

    res.status(200).json({ images: processedImages });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process images" });
  }
}
