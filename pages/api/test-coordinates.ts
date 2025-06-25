// pages/api/test-coordinates.ts
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { lat, lon, keywords, description } = req.body;

    console.log("=== COORDINATE TEST ===");
    console.log("Raw input:", { lat, lon, keywords, description });
    console.log("Types:", {
      lat: typeof lat,
      lon: typeof lon,
      keywords: typeof keywords,
      description: typeof description,
    });

    // Test coordinate conversion
    const latitude = Number(lat);
    const longitude = Number(lon);

    console.log("Converted:", { lat: latitude, lon: longitude });
    console.log("Valid numbers:", {
      latValid: !isNaN(latitude),
      lonValid: !isNaN(longitude),
    });

    // Test coordinate validation
    const validLat = latitude >= -90 && latitude <= 90;
    const validLon = longitude >= -180 && longitude <= 180;

    console.log("Valid ranges:", { validLat, validLon });

    // Test GPS conversion (degrees, minutes, seconds)
    function decimalToGPS(decimal: number): [number, number, number] {
      const absolute = Math.abs(decimal);
      const degrees = Math.floor(absolute);
      const minutesFloat = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesFloat);
      const seconds = (minutesFloat - minutes) * 60;

      return [degrees, minutes, Math.round(seconds * 100) / 100];
    }

    let gpsData = null;
    if (!isNaN(latitude) && !isNaN(longitude)) {
      const latGPS = decimalToGPS(Math.abs(latitude));
      const lonGPS = decimalToGPS(Math.abs(longitude));

      gpsData = {
        lat: {
          decimal: latitude,
          dms: latGPS,
          ref: latitude >= 0 ? "N" : "S",
        },
        lon: {
          decimal: longitude,
          dms: lonGPS,
          ref: longitude >= 0 ? "E" : "W",
        },
      };

      console.log("GPS conversion:", gpsData);
    }

    // Test metadata object
    const metadata = {
      gps: { lat: latitude, lon: longitude },
      keywords: keywords?.trim() || undefined,
      description: description?.trim() || undefined,
    };

    console.log("Final metadata:", metadata);
    console.log("========================");

    res.status(200).json({
      input: { lat, lon, keywords, description },
      types: {
        lat: typeof lat,
        lon: typeof lon,
        keywords: typeof keywords,
        description: typeof description,
      },
      converted: { lat: latitude, lon: longitude },
      valid: {
        numbers: { latValid: !isNaN(latitude), lonValid: !isNaN(longitude) },
        ranges: { validLat, validLon },
      },
      gpsData,
      metadata,
      success: !isNaN(latitude) && !isNaN(longitude) && validLat && validLon,
    });
  } catch (error) {
    console.error("Test coordinates error:", error);

    res.status(500).json({
      error: "Failed to test coordinates",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
