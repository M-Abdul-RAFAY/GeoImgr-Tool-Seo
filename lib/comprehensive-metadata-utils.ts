// lib/comprehensive-metadata-utils.ts
import piexif from "piexifjs";

export interface GPSCoordinates {
  lat: number;
  lon: number;
}

export interface MetadataInfo {
  gps?: GPSCoordinates;
  keywords?: string;
  description?: string;
  dateTime?: string;
  cameraMake?: string;
  cameraModel?: string;
}

export interface FormatSupport {
  canReadGPS: boolean;
  canWriteGPS: boolean;
  canReadMetadata: boolean;
  canWriteMetadata: boolean;
  method: "exif" | "xmp" | "riff" | "custom";
  notes: string;
}

// Comprehensive format support detection
export function getFormatSupport(mimeType: string): FormatSupport {
  const formats: { [key: string]: FormatSupport } = {
    "image/jpeg": {
      canReadGPS: true,
      canWriteGPS: true,
      canReadMetadata: true,
      canWriteMetadata: true,
      method: "exif",
      notes: "Full EXIF support - recommended format",
    },
    "image/jpg": {
      canReadGPS: true,
      canWriteGPS: true,
      canReadMetadata: true,
      canWriteMetadata: true,
      method: "exif",
      notes: "Full EXIF support - recommended format",
    },
    "image/tiff": {
      canReadGPS: true,
      canWriteGPS: true,
      canReadMetadata: true,
      canWriteMetadata: true,
      method: "exif",
      notes: "Full EXIF support, larger file sizes",
    },
    "image/webp": {
      canReadGPS: true,
      canWriteGPS: true, // We'll implement this!
      canReadMetadata: true,
      canWriteMetadata: true,
      method: "riff",
      notes: "RIFF-based metadata support",
    },
    "image/png": {
      canReadGPS: true,
      canWriteGPS: true, // We'll implement this via text chunks!
      canReadMetadata: true,
      canWriteMetadata: true,
      method: "custom",
      notes: "Custom PNG text chunks for GPS",
    },
    "image/heic": {
      canReadGPS: true,
      canWriteGPS: false, // Too complex for browser implementation
      canReadMetadata: true,
      canWriteMetadata: false,
      method: "exif",
      notes: "Read-only support, convert to JPEG for writing",
    },
    "image/heif": {
      canReadGPS: true,
      canWriteGPS: false,
      canReadMetadata: true,
      canWriteMetadata: false,
      method: "exif",
      notes: "Read-only support, convert to JPEG for writing",
    },
  };

  return (
    formats[mimeType] || {
      canReadGPS: false,
      canWriteGPS: false,
      canReadMetadata: false,
      canWriteMetadata: false,
      method: "custom",
      notes: "Unsupported format",
    }
  );
}

// Enhanced metadata reader using multiple approaches
export async function readMetadataUniversal(
  imageBuffer: Buffer,
  mimeType: string
): Promise<MetadataInfo> {
  const support = getFormatSupport(mimeType);

  if (!support.canReadMetadata) {
    return {};
  }

  try {
    switch (support.method) {
      case "exif":
        return await readExifMetadata(imageBuffer);
      case "riff":
        return await readWebPMetadata(imageBuffer);
      case "custom":
        return await readPNGMetadata(imageBuffer);
      default:
        return {};
    }
  } catch (error) {
    console.error(`Error reading metadata from ${mimeType}:`, error);
    return {};
  }
}

// EXIF metadata reading (JPEG, TIFF, HEIC)
async function readExifMetadata(imageBuffer: Buffer): Promise<MetadataInfo> {
  try {
    const imageDataUrl = `data:image/jpeg;base64,${imageBuffer.toString(
      "base64"
    )}`;
    const exifObj = piexif.load(imageDataUrl);

    const metadata: MetadataInfo = {};

    // Extract GPS coordinates
    if (exifObj.GPS) {
      const gpsData = exifObj.GPS;

      if (
        gpsData[piexif.GPSIFD.GPSLatitude] &&
        gpsData[piexif.GPSIFD.GPSLongitude]
      ) {
        const latArray = gpsData[piexif.GPSIFD.GPSLatitude];
        const lonArray = gpsData[piexif.GPSIFD.GPSLongitude];
        const latRef = gpsData[piexif.GPSIFD.GPSLatitudeRef];
        const lonRef = gpsData[piexif.GPSIFD.GPSLongitudeRef];

        if (latArray && lonArray && latRef && lonRef) {
          const lat = gpsToDecimal(latArray, latRef);
          const lon = gpsToDecimal(lonArray, lonRef);
          metadata.gps = { lat, lon };
        }
      }
    }

    // Extract other metadata
    if (exifObj["0th"]) {
      const ifd0 = exifObj["0th"];

      if (ifd0[piexif.ImageIFD.ImageDescription]) {
        metadata.description = ifd0[piexif.ImageIFD.ImageDescription];
      }

      if (ifd0[piexif.ImageIFD.Make]) {
        metadata.cameraMake = ifd0[piexif.ImageIFD.Make];
      }

      if (ifd0[piexif.ImageIFD.Model]) {
        metadata.cameraModel = ifd0[piexif.ImageIFD.Model];
      }

      if (ifd0[piexif.ImageIFD.DateTime]) {
        metadata.dateTime = ifd0[piexif.ImageIFD.DateTime];
      }

      if (ifd0[piexif.ImageIFD.XPKeywords]) {
        const keywordsBuffer = Buffer.from(ifd0[piexif.ImageIFD.XPKeywords]);
        metadata.keywords = keywordsBuffer
          .toString("utf16le")
          .replace(/\0/g, "");
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error reading EXIF data:", error);
    return {};
  }
}

// WebP metadata reading
async function readWebPMetadata(imageBuffer: Buffer): Promise<MetadataInfo> {
  try {
    // WebP file structure: RIFF header + WebP chunks
    const metadata: MetadataInfo = {};

    // Check for WebP signature
    if (imageBuffer.subarray(0, 4).toString() !== "RIFF") {
      throw new Error("Not a valid RIFF file");
    }

    if (imageBuffer.subarray(8, 12).toString() !== "WEBP") {
      throw new Error("Not a valid WebP file");
    }

    let offset = 12;

    // Parse chunks
    while (offset < imageBuffer.length - 8) {
      const chunkType = imageBuffer.subarray(offset, offset + 4).toString();
      const chunkSize = imageBuffer.readUInt32LE(offset + 4);

      if (chunkType === "EXIF") {
        // Found EXIF chunk in WebP
        const exifData = imageBuffer.subarray(
          offset + 8,
          offset + 8 + chunkSize
        );
        const exifDataUrl = `data:image/jpeg;base64,${exifData.toString(
          "base64"
        )}`;

        try {
          const exifObj = piexif.load(exifDataUrl);

          // Extract GPS from EXIF chunk
          if (exifObj.GPS && exifObj.GPS[piexif.GPSIFD.GPSLatitude]) {
            const latArray = exifObj.GPS[piexif.GPSIFD.GPSLatitude];
            const lonArray = exifObj.GPS[piexif.GPSIFD.GPSLongitude];
            const latRef = exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef];
            const lonRef = exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef];

            if (latArray && lonArray && latRef && lonRef) {
              const lat = gpsToDecimal(latArray, latRef);
              const lon = gpsToDecimal(lonArray, lonRef);
              metadata.gps = { lat, lon };
            }
          }

          // Extract other metadata
          if (exifObj["0th"]) {
            const ifd0 = exifObj["0th"];
            if (ifd0[piexif.ImageIFD.ImageDescription]) {
              metadata.description = ifd0[piexif.ImageIFD.ImageDescription];
            }
          }
        } catch (exifError) {
          console.warn("Error parsing EXIF in WebP:", exifError);
        }

        break;
      }

      // Move to next chunk (pad to even byte boundary)
      offset += 8 + chunkSize;
      if (chunkSize % 2 === 1) offset += 1;
    }

    return metadata;
  } catch (error) {
    console.error("Error reading WebP metadata:", error);
    return {};
  }
}

// PNG metadata reading
async function readPNGMetadata(imageBuffer: Buffer): Promise<MetadataInfo> {
  try {
    const metadata: MetadataInfo = {};

    // Check PNG signature
    if (imageBuffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Not a valid PNG file");
    }

    let offset = 8;

    // Parse PNG chunks
    while (offset < imageBuffer.length - 8) {
      const chunkLength = imageBuffer.readUInt32BE(offset);
      const chunkType = imageBuffer.subarray(offset + 4, offset + 8).toString();
      const chunkData = imageBuffer.subarray(
        offset + 8,
        offset + 8 + chunkLength
      );

      if (
        chunkType === "tEXt" ||
        chunkType === "iTXt" ||
        chunkType === "zTXt"
      ) {
        // Parse text chunks for metadata
        let text = "";
        let keyword = "";

        if (chunkType === "tEXt") {
          const nullIndex = chunkData.indexOf(0);
          keyword = chunkData.subarray(0, nullIndex).toString("latin1");
          text = chunkData.subarray(nullIndex + 1).toString("latin1");
        } else if (chunkType === "iTXt") {
          const nullIndex = chunkData.indexOf(0);
          keyword = chunkData.subarray(0, nullIndex).toString("utf8");
          // Skip compression flag and method
          const secondNull = chunkData.indexOf(0, nullIndex + 1);
          const thirdNull = chunkData.indexOf(0, secondNull + 1);
          const fourthNull = chunkData.indexOf(0, thirdNull + 1);
          text = chunkData.subarray(fourthNull + 1).toString("utf8");
        }

        const keywordLower = keyword.toLowerCase();

        // Check for GPS-related keywords
        if (keywordLower.includes("gps") || keywordLower === "gps_location") {
          try {
            const gpsData = JSON.parse(text);
            if (gpsData.lat && gpsData.lon) {
              metadata.gps = {
                lat: parseFloat(gpsData.lat),
                lon: parseFloat(gpsData.lon),
              };
            }
          } catch {
            // Try parsing comma-separated lat,lon
            const coords = text.split(",");
            if (coords.length === 2) {
              const lat = parseFloat(coords[0].trim());
              const lon = parseFloat(coords[1].trim());
              if (!isNaN(lat) && !isNaN(lon)) {
                metadata.gps = { lat, lon };
              }
            }
          }
        }

        // Check for description-related keywords
        if (
          keywordLower.includes("description") ||
          keywordLower === "comment" ||
          keywordLower === "title" ||
          keywordLower.includes("caption")
        ) {
          metadata.description = text;
        }

        // Check for keywords
        if (
          keywordLower.includes("keywords") ||
          keywordLower === "subject" ||
          keywordLower.includes("tags")
        ) {
          metadata.keywords = text;
        }

        // Check for date/time
        if (
          keywordLower.includes("creation") ||
          keywordLower.includes("date") ||
          keywordLower.includes("time")
        ) {
          metadata.dateTime = text;
        }

        // Check for camera info (though rare in PNG)
        if (keywordLower.includes("camera") || keywordLower.includes("make")) {
          metadata.cameraMake = text;
        }

        if (keywordLower.includes("model") && !keywordLower.includes("make")) {
          metadata.cameraModel = text;
        }
      }

      // Move to next chunk
      offset += 12 + chunkLength;
    }

    return metadata;
  } catch (error) {
    console.error("Error reading PNG metadata:", error);
    return {};
  }
}

// Universal metadata writer
export async function writeMetadataUniversal(
  imageBuffer: Buffer,
  metadata: MetadataInfo,
  mimeType: string
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
  const support = getFormatSupport(mimeType);

  if (!support.canWriteMetadata) {
    return {
      success: false,
      error: `Writing metadata not supported for ${mimeType}. ${support.notes}`,
    };
  }

  try {
    switch (support.method) {
      case "exif":
        const exifBuffer = await writeExifMetadata(imageBuffer, metadata);
        return { success: true, buffer: exifBuffer };

      case "riff":
        const webpBuffer = await writeWebPMetadata(imageBuffer, metadata);
        return { success: true, buffer: webpBuffer };

      case "custom":
        const pngBuffer = await writePNGMetadata(imageBuffer, metadata);
        return { success: true, buffer: pngBuffer };

      default:
        return { success: false, error: "Unsupported metadata method" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// EXIF metadata writing (existing implementation)
async function writeExifMetadata(
  imageBuffer: Buffer,
  metadata: MetadataInfo
): Promise<Buffer> {
  const imageDataUrl = `data:image/jpeg;base64,${imageBuffer.toString(
    "base64"
  )}`;

  let exifObj;
  try {
    exifObj = piexif.load(imageDataUrl);
  } catch {
    exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };
  }

  if (!exifObj.GPS) exifObj.GPS = {};
  if (!exifObj["0th"]) exifObj["0th"] = {};

  // Write GPS coordinates
  if (metadata.gps) {
    const { lat, lon } = metadata.gps;
    const latGPS = decimalToGPS(lat);
    const lonGPS = decimalToGPS(lon);

    (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitude] = [
      [Math.round(latGPS[0] * 1), 1],
      [Math.round(latGPS[1] * 1), 1],
      [Math.round(latGPS[2] * 100), 100],
    ];
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitude] = [
      [Math.round(lonGPS[0] * 1), 1],
      [Math.round(lonGPS[1] * 1), 1],
      [Math.round(lonGPS[2] * 100), 100],
    ];
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? "E" : "W";
    (exifObj.GPS as any)[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
  }

  // Write other metadata
  if (metadata.description) {
    (exifObj["0th"] as any)[piexif.ImageIFD.ImageDescription] =
      metadata.description;
  }

  if (metadata.keywords) {
    const keywordsBuffer = Buffer.from(metadata.keywords + "\0", "utf16le");
    (exifObj["0th"] as any)[piexif.ImageIFD.XPKeywords] =
      Array.from(keywordsBuffer);
  }

  const exifBytes = piexif.dump(exifObj);
  const newImageDataUrl = piexif.insert(exifBytes, imageDataUrl);
  const base64Data = newImageDataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

// WebP metadata writing
async function writeWebPMetadata(
  imageBuffer: Buffer,
  metadata: MetadataInfo
): Promise<Buffer> {
  console.log("Writing WebP metadata:", metadata);

  // Create EXIF chunk for WebP
  const exifData = await createExifChunk(metadata);

  // Parse existing WebP structure
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 12; // Skip RIFF header and WebP signature

  console.log("Parsing existing WebP chunks...");

  while (offset < imageBuffer.length - 8) {
    const chunkType = imageBuffer.subarray(offset, offset + 4).toString();
    const chunkSize = imageBuffer.readUInt32LE(offset + 4);
    const chunkData = imageBuffer.subarray(offset + 8, offset + 8 + chunkSize);

    console.log(`Found WebP chunk: ${chunkType}, size: ${chunkSize}`);

    // Skip existing EXIF chunk to avoid duplicates
    if (chunkType !== "EXIF") {
      chunks.push({ type: chunkType, data: chunkData });
    } else {
      console.log("Skipping existing EXIF chunk");
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 === 1) offset += 1; // Pad to even byte boundary
  }

  // Add new EXIF chunk after VP8/VP8L chunk
  let insertIndex = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (
      chunks[i].type === "VP8 " ||
      chunks[i].type === "VP8L" ||
      chunks[i].type === "VP8X"
    ) {
      insertIndex = i + 1;
      break;
    }
  }

  console.log(`Inserting EXIF chunk at position ${insertIndex}`);
  chunks.splice(insertIndex, 0, { type: "EXIF", data: exifData });

  // Rebuild WebP file
  const newChunks: Buffer[] = [];
  let totalSize = 4; // "WEBP"

  for (const chunk of chunks) {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(chunk.type, 0);
    chunkHeader.writeUInt32LE(chunk.data.length, 4);

    newChunks.push(chunkHeader);
    newChunks.push(chunk.data);

    totalSize += 8 + chunk.data.length;
    if (chunk.data.length % 2 === 1) {
      newChunks.push(Buffer.from([0])); // Padding
      totalSize += 1;
    }
  }

  // Create new RIFF header
  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0);
  riffHeader.writeUInt32LE(totalSize, 4);
  riffHeader.write("WEBP", 8);

  const result = Buffer.concat([riffHeader, ...newChunks]);
  console.log(`WebP file size: ${imageBuffer.length} -> ${result.length}`);
  return result;
}

// PNG metadata writing
async function writePNGMetadata(
  imageBuffer: Buffer,
  metadata: MetadataInfo
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  // Add PNG signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  let offset = 8;
  let addedMetadata = false;

  console.log("PNG Metadata to write:", {
    hasGPS: !!metadata.gps,
    gps: metadata.gps,
    keywords: metadata.keywords,
    description: metadata.description,
  });

  // Parse existing chunks
  while (offset < imageBuffer.length - 8) {
    const chunkLength = imageBuffer.readUInt32BE(offset);
    const chunkType = imageBuffer.subarray(offset + 4, offset + 8).toString();
    const chunkData = imageBuffer.subarray(
      offset + 8,
      offset + 8 + chunkLength
    );
    const crc = imageBuffer.readUInt32BE(offset + 8 + chunkLength);

    // Skip our custom metadata text chunks to avoid duplicates
    if (chunkType === "tEXt" || chunkType === "iTXt") {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const keyword = chunkData
          .subarray(0, nullIndex)
          .toString()
          .toLowerCase();
        if (
          keyword.includes("gps") ||
          keyword.includes("location") ||
          keyword.includes("keywords") ||
          keyword.includes("description") ||
          keyword === "title" ||
          keyword === "comment" ||
          keyword === "subject" ||
          keyword === "software" ||
          keyword.includes("creation")
        ) {
          console.log(
            `Skipping existing ${chunkType} chunk with keyword: ${keyword}`
          );
          offset += 12 + chunkLength;
          continue;
        }
      }
    }

    // Add existing chunk
    const chunk = Buffer.alloc(12 + chunkLength);
    chunk.writeUInt32BE(chunkLength, 0);
    chunk.write(chunkType, 4);
    chunkData.copy(chunk, 8);
    chunk.writeUInt32BE(crc, 8 + chunkLength);
    chunks.push(chunk);

    // Add metadata chunks after IHDR
    if (chunkType === "IHDR" && !addedMetadata) {
      console.log("Adding metadata chunks after IHDR...");

      // Add GPS chunk if GPS data exists
      if (
        metadata.gps &&
        metadata.gps.lat !== undefined &&
        metadata.gps.lon !== undefined
      ) {
        console.log(
          `Writing GPS coordinates: ${metadata.gps.lat}, ${metadata.gps.lon}`
        );

        // Method 1: JSON format (primary)
        const gpsData = {
          lat: metadata.gps.lat,
          lon: metadata.gps.lon,
          timestamp: new Date().toISOString(),
        };
        const gpsJsonChunk = createPNGTextChunk(
          "GPS_Location",
          JSON.stringify(gpsData)
        );
        chunks.push(gpsJsonChunk);
        console.log(`Added GPS_Location chunk: ${JSON.stringify(gpsData)}`);

        // Method 2: Simple comma-separated format
        const gpsSimple = `${metadata.gps.lat},${metadata.gps.lon}`;
        const gpsSimpleChunk = createPNGTextChunk("GPS_Coordinates", gpsSimple);
        chunks.push(gpsSimpleChunk);
        console.log(`Added GPS_Coordinates chunk: ${gpsSimple}`);

        // Method 3: EXIF-style format for maximum compatibility
        const gpsExifStyle = `lat=${metadata.gps.lat};lon=${metadata.gps.lon}`;
        const gpsExifChunk = createPNGTextChunk("Location", gpsExifStyle);
        chunks.push(gpsExifChunk);
        console.log(`Added Location chunk: ${gpsExifStyle}`);

        // Method 4: Standard geolocation format
        const geoString = `${metadata.gps.lat}|${metadata.gps.lon}`;
        const geoChunk = createPNGTextChunk("Geolocation", geoString);
        chunks.push(geoChunk);
        console.log(`Added Geolocation chunk: ${geoString}`);

        console.log("Added all GPS chunks");
      } else {
        console.log("No GPS data to write or invalid GPS data:", metadata.gps);
      }

      // Add description chunk if description exists
      if (metadata.description && metadata.description.trim()) {
        console.log(
          `Writing description: ${metadata.description.substring(0, 50)}...`
        );
        const descChunk = createPNGTextChunk(
          "Description",
          metadata.description.trim()
        );
        chunks.push(descChunk);

        // Also add as standard PNG keywords for better compatibility
        const commentChunk = createPNGTextChunk(
          "Comment",
          metadata.description.trim()
        );
        chunks.push(commentChunk);

        const titleChunk = createPNGTextChunk(
          "Title",
          metadata.description.trim()
        );
        chunks.push(titleChunk);

        console.log("Added description chunks");
      }

      // Add keywords chunk if keywords exist
      if (metadata.keywords && metadata.keywords.trim()) {
        console.log(
          `Writing keywords: ${metadata.keywords.substring(0, 50)}...`
        );
        const keywordsChunk = createPNGTextChunk(
          "Keywords",
          metadata.keywords.trim()
        );
        chunks.push(keywordsChunk);

        // Also add as Subject for better compatibility
        const subjectChunk = createPNGTextChunk(
          "Subject",
          metadata.keywords.trim()
        );
        chunks.push(subjectChunk);

        console.log("Added keywords chunks");
      }

      // Add creation time
      const timeChunk = createPNGTextChunk(
        "Creation Time",
        new Date().toISOString()
      );
      chunks.push(timeChunk);

      // Add software info
      const softwareChunk = createPNGTextChunk(
        "Software",
        "Universal GeoImgr Tool v2.0"
      );
      chunks.push(softwareChunk);

      console.log("Added timestamp and software chunks");
      addedMetadata = true;
    }

    offset += 12 + chunkLength;
  }

  const result = Buffer.concat(chunks);
  console.log(`PNG file size: ${imageBuffer.length} -> ${result.length}`);
  return result;
}

// Helper functions
function createPNGTextChunk(keyword: string, text: string): Buffer {
  console.log(
    `Creating PNG text chunk: ${keyword} = ${text.substring(0, 100)}...`
  );

  // Use tEXt for simple ASCII content, iTXt for Unicode content
  const needsUnicode =
    /[^\x00-\x7F]/.test(text) || /[^\x00-\x7F]/.test(keyword);

  if (needsUnicode) {
    // Use iTXt for Unicode support
    const keywordBuffer = Buffer.from(keyword, "utf8");
    const textBuffer = Buffer.from(text, "utf8");

    // iTXt format: keyword + null + compression flag + compression method + language tag + null + translated keyword + null + text
    const compressionFlag = 0; // No compression
    const compressionMethod = 0;
    const languageTag = Buffer.from("", "utf8"); // Empty language tag
    const translatedKeyword = Buffer.from("", "utf8"); // Empty translated keyword

    const dataLength =
      keywordBuffer.length +
      1 +
      1 +
      1 +
      languageTag.length +
      1 +
      translatedKeyword.length +
      1 +
      textBuffer.length;

    const chunk = Buffer.alloc(12 + dataLength);

    // Write chunk length and type
    chunk.writeUInt32BE(dataLength, 0);
    chunk.write("iTXt", 4);

    let pos = 8;

    // Write keyword
    keywordBuffer.copy(chunk, pos);
    pos += keywordBuffer.length;
    chunk.writeUInt8(0, pos++); // Null separator

    // Write compression info
    chunk.writeUInt8(compressionFlag, pos++);
    chunk.writeUInt8(compressionMethod, pos++);

    // Write language tag
    languageTag.copy(chunk, pos);
    pos += languageTag.length;
    chunk.writeUInt8(0, pos++); // Null separator

    // Write translated keyword
    translatedKeyword.copy(chunk, pos);
    pos += translatedKeyword.length;
    chunk.writeUInt8(0, pos++); // Null separator

    // Write text
    textBuffer.copy(chunk, pos);

    // Calculate and write CRC
    const crc = calculateCRC32(chunk.subarray(4, 8 + dataLength));
    chunk.writeUInt32BE(crc, 8 + dataLength);

    console.log(`Created iTXt chunk: ${keyword}, size: ${chunk.length}`);
    return chunk;
  } else {
    // Use tEXt for ASCII content
    const keywordBuffer = Buffer.from(keyword, "latin1");
    const textBuffer = Buffer.from(text, "latin1");
    const dataLength = keywordBuffer.length + 1 + textBuffer.length;

    const chunk = Buffer.alloc(12 + dataLength);
    chunk.writeUInt32BE(dataLength, 0);
    chunk.write("tEXt", 4);
    keywordBuffer.copy(chunk, 8);
    chunk.writeUInt8(0, 8 + keywordBuffer.length);
    textBuffer.copy(chunk, 8 + keywordBuffer.length + 1);

    // Calculate CRC
    const crc = calculateCRC32(chunk.subarray(4, 8 + dataLength));
    chunk.writeUInt32BE(crc, 8 + dataLength);

    console.log(`Created tEXt chunk: ${keyword}, size: ${chunk.length}`);
    return chunk;
  }
}

// Alternative simpler text chunk for basic compatibility
function createPNGSimpleTextChunk(keyword: string, text: string): Buffer {
  const keywordBuffer = Buffer.from(keyword, "latin1");
  const textBuffer = Buffer.from(text, "latin1");
  const dataLength = keywordBuffer.length + 1 + textBuffer.length;

  const chunk = Buffer.alloc(12 + dataLength);
  chunk.writeUInt32BE(dataLength, 0);
  chunk.write("tEXt", 4);
  keywordBuffer.copy(chunk, 8);
  chunk.writeUInt8(0, 8 + keywordBuffer.length);
  textBuffer.copy(chunk, 8 + keywordBuffer.length + 1);

  // Calculate CRC
  const crc = calculateCRC32(chunk.subarray(4, 8 + dataLength));
  chunk.writeUInt32BE(crc, 8 + dataLength);

  return chunk;
}

async function createExifChunk(metadata: MetadataInfo): Promise<Buffer> {
  // Create minimal EXIF structure for GPS
  const exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };

  console.log("Creating EXIF chunk with metadata:", metadata);

  if (
    metadata.gps &&
    metadata.gps.lat !== undefined &&
    metadata.gps.lon !== undefined
  ) {
    const { lat, lon } = metadata.gps;
    console.log(`Creating GPS EXIF data for: ${lat}, ${lon}`);

    const latGPS = decimalToGPS(Math.abs(lat));
    const lonGPS = decimalToGPS(Math.abs(lon));

    console.log("GPS converted to DMS:", { latGPS, lonGPS });

    // Set GPS data with proper rational format for piexifjs
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitude] = [
      [Math.round(latGPS[0] * 1), 1], // degrees
      [Math.round(latGPS[1] * 1), 1], // minutes
      [Math.round(latGPS[2] * 1000), 1000], // seconds (more precision)
    ];
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitude] = [
      [Math.round(lonGPS[0] * 1), 1], // degrees
      [Math.round(lonGPS[1] * 1), 1], // minutes
      [Math.round(lonGPS[2] * 1000), 1000], // seconds (more precision)
    ];
    (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? "E" : "W";
    // Set GPS version
    (exifObj.GPS as any)[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];

    console.log("GPS EXIF object created:", {
      lat: (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitude],
      latRef: (exifObj.GPS as any)[piexif.GPSIFD.GPSLatitudeRef],
      lon: (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitude],
      lonRef: (exifObj.GPS as any)[piexif.GPSIFD.GPSLongitudeRef],
    });
  }

  // Add description and keywords to 0th IFD if present
  if (metadata.description) {
    (exifObj["0th"] as any)[piexif.ImageIFD.ImageDescription] =
      metadata.description;
    console.log("Added description to EXIF");
  }
  if (metadata.keywords) {
    // Convert to UTF-16 for XPKeywords
    const keywordsBuffer = Buffer.from(metadata.keywords + "\0", "utf16le");
    (exifObj["0th"] as any)[piexif.ImageIFD.XPKeywords] =
      Array.from(keywordsBuffer);
    console.log("Added keywords to EXIF");
  }

  try {
    const exifBytes = piexif.dump(exifObj);
    console.log(`Created EXIF chunk: ${exifBytes.length} bytes`);
    return Buffer.from(exifBytes, "binary");
  } catch (error) {
    console.error("Error creating EXIF chunk:", error);
    throw error;
  }
}

// Utility functions
function gpsToDecimal(gpsArray: number[], ref: string): number {
  if (!gpsArray || gpsArray.length < 3) return 0;

  const [degrees, minutes, seconds] = gpsArray;
  let decimal = degrees + minutes / 60 + seconds / 3600;

  if (ref === "S" || ref === "W") {
    decimal = -decimal;
  }

  return decimal;
}

function decimalToGPS(decimal: number): [number, number, number] {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  return [degrees, minutes, Math.round(seconds * 100) / 100];
}

// CRC32 calculation for PNG
function calculateCRC32(data: Buffer): number {
  const crcTable = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
