// pages/api/debug-png-chunks.ts
import { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import { join } from "path";

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

    const tempDir = "/tmp";

    // Find the image file by ID
    let imageFile: string | null = null;
    try {
      const files = await fs.readdir(tempDir);
      imageFile = files.find((file) => file.startsWith(id)) || null;
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Could not access temporary files" });
    }

    if (!imageFile) {
      return res.status(404).json({ error: "Image not found" });
    }

    const imagePath = join(tempDir, imageFile);
    const imageBuffer = await fs.readFile(imagePath);

    // Check if it's a PNG file
    if (imageBuffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      return res.status(400).json({ error: "Not a PNG file" });
    }

    const chunks: any[] = [];
    let offset = 8; // Skip PNG signature

    console.log("=== PNG CHUNK ANALYSIS ===");
    console.log(`File: ${imageFile}, Size: ${imageBuffer.length} bytes`);

    while (offset < imageBuffer.length - 8) {
      try {
        const chunkLength = imageBuffer.readUInt32BE(offset);
        const chunkType = imageBuffer
          .subarray(offset + 4, offset + 8)
          .toString();
        const chunkData = imageBuffer.subarray(
          offset + 8,
          offset + 8 + chunkLength
        );
        const crc = imageBuffer.readUInt32BE(offset + 8 + chunkLength);

        const chunkInfo: any = {
          type: chunkType,
          length: chunkLength,
          offset: offset,
          crc: crc.toString(16).toUpperCase().padStart(8, "0"),
        };

        console.log(
          `Chunk: ${chunkType}, Length: ${chunkLength}, Offset: ${offset}`
        );

        // Parse text chunks in detail
        if (
          chunkType === "tEXt" ||
          chunkType === "iTXt" ||
          chunkType === "zTXt"
        ) {
          try {
            if (chunkType === "tEXt") {
              const nullIndex = chunkData.indexOf(0);
              if (nullIndex >= 0) {
                chunkInfo.keyword = chunkData
                  .subarray(0, nullIndex)
                  .toString("latin1");
                chunkInfo.text = chunkData
                  .subarray(nullIndex + 1)
                  .toString("latin1");
                chunkInfo.encoding = "latin1";

                console.log(
                  `  tEXt - Keyword: "${
                    chunkInfo.keyword
                  }", Text: "${chunkInfo.text.substring(0, 100)}..."`
                );
              }
            } else if (chunkType === "iTXt") {
              const nullIndex = chunkData.indexOf(0);
              if (nullIndex >= 0) {
                chunkInfo.keyword = chunkData
                  .subarray(0, nullIndex)
                  .toString("utf8");

                let pos = nullIndex + 1;
                chunkInfo.compressionFlag = chunkData.readUInt8(pos++);
                chunkInfo.compressionMethod = chunkData.readUInt8(pos++);

                const langNull = chunkData.indexOf(0, pos);
                if (langNull >= pos) {
                  chunkInfo.languageTag = chunkData
                    .subarray(pos, langNull)
                    .toString("utf8");
                  pos = langNull + 1;

                  const translatedNull = chunkData.indexOf(0, pos);
                  if (translatedNull >= pos) {
                    chunkInfo.translatedKeyword = chunkData
                      .subarray(pos, translatedNull)
                      .toString("utf8");
                    pos = translatedNull + 1;

                    chunkInfo.text = chunkData.subarray(pos).toString("utf8");
                    chunkInfo.encoding = "utf8";

                    console.log(
                      `  iTXt - Keyword: "${
                        chunkInfo.keyword
                      }", Text: "${chunkInfo.text.substring(0, 100)}..."`
                    );
                  }
                }
              }
            }

            // Check if this is a GPS-related chunk
            if (chunkInfo.keyword) {
              const keywordLower = chunkInfo.keyword.toLowerCase();
              chunkInfo.isGPSRelated =
                keywordLower.includes("gps") ||
                keywordLower.includes("location") ||
                keywordLower.includes("coordinates") ||
                keywordLower.includes("geolocation");

              if (chunkInfo.isGPSRelated) {
                console.log(`  *** GPS CHUNK FOUND: ${chunkInfo.keyword} ***`);

                // Try to parse GPS data
                if (chunkInfo.text) {
                  try {
                    // Try JSON
                    const gpsData = JSON.parse(chunkInfo.text);
                    chunkInfo.parsedGPS = gpsData;
                    chunkInfo.gpsFormat = "json";
                    console.log(
                      `  GPS Data (JSON): ${JSON.stringify(gpsData)}`
                    );
                  } catch {
                    // Try CSV
                    if (chunkInfo.text.includes(",")) {
                      const coords = chunkInfo.text.split(",");
                      if (coords.length >= 2) {
                        const lat = parseFloat(coords[0].trim());
                        const lon = parseFloat(coords[1].trim());
                        if (!isNaN(lat) && !isNaN(lon)) {
                          chunkInfo.parsedGPS = { lat, lon };
                          chunkInfo.gpsFormat = "csv";
                          console.log(`  GPS Data (CSV): ${lat}, ${lon}`);
                        }
                      }
                    }

                    // Try key=value
                    if (!chunkInfo.parsedGPS && chunkInfo.text.includes("=")) {
                      const pairs = chunkInfo.text.split(/[;&|]/);
                      const coords: any = {};
                      pairs.forEach((pair) => {
                        const [key, value] = pair.split("=");
                        if (key && value) {
                          coords[key.trim().toLowerCase()] = parseFloat(
                            value.trim()
                          );
                        }
                      });
                      if (!isNaN(coords.lat) && !isNaN(coords.lon)) {
                        chunkInfo.parsedGPS = coords;
                        chunkInfo.gpsFormat = "key-value";
                        console.log(
                          `  GPS Data (key=value): ${coords.lat}, ${coords.lon}`
                        );
                      }
                    }
                  }
                }
              }
            }
          } catch (parseError) {
            chunkInfo.parseError =
              parseError instanceof Error ? parseError.message : "Parse error";
            console.log(`  Parse error: ${chunkInfo.parseError}`);
          }
        }

        chunks.push(chunkInfo);

        // Move to next chunk
        offset += 12 + chunkLength;
      } catch (chunkError) {
        console.log(`Error parsing chunk at offset ${offset}:`, chunkError);
        chunks.push({
          error: "Failed to parse chunk",
          offset: offset,
          details:
            chunkError instanceof Error ? chunkError.message : "Unknown error",
        });
        break;
      }
    }

    console.log("=========================");

    // Summary
    const gpsChunks = chunks.filter((chunk) => chunk.isGPSRelated);
    const textChunks = chunks.filter(
      (chunk) => chunk.type === "tEXt" || chunk.type === "iTXt"
    );

    res.status(200).json({
      filename: imageFile,
      totalSize: imageBuffer.length,
      totalChunks: chunks.length,
      textChunks: textChunks.length,
      gpsChunks: gpsChunks.length,
      chunks: chunks,
      summary: {
        hasGPSChunks: gpsChunks.length > 0,
        gpsChunkKeywords: gpsChunks.map((chunk) => chunk.keyword),
        parsedGPSData: gpsChunks
          .filter((chunk) => chunk.parsedGPS)
          .map((chunk) => ({
            keyword: chunk.keyword,
            format: chunk.gpsFormat,
            gps: chunk.parsedGPS,
          })),
      },
    });
  } catch (error) {
    console.error("PNG chunk debug error:", error);
    res.status(500).json({
      error: "Failed to debug PNG chunks",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
