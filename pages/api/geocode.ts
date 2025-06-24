// pages/api/geocode.ts
import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

interface NominatimResult {
  place_id: string;
  licence: string;
  osm_type: string;
  osm_id: string;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.trim();

    // Use OpenStreetMap Nominatim for geocoding (free and open)
    const nominatimUrl = "https://nominatim.openstreetmap.org/search";
    const params = {
      q: query,
      format: "json",
      addressdetails: 1,
      limit: 10,
      dedupe: 1,
    };

    // Add user agent as required by Nominatim usage policy
    const headers = {
      "User-Agent": "GeoImgr-NextJS/1.0 (Internal Tool)",
    };

    console.log("Geocoding query:", query);

    const response = await axios.get(nominatimUrl, {
      params,
      headers,
      timeout: 10000, // 10 second timeout
    });

    const results: NominatimResult[] = response.data;

    // Transform results to a consistent format
    const transformedResults = results.map((result) => ({
      id: result.place_id,
      lat: result.lat,
      lon: result.lon,
      display_name: result.display_name,
      type: result.type,
      class: result.class,
      importance: result.importance,
      boundingbox: result.boundingbox,
    }));

    // Sort by importance (higher is better)
    transformedResults.sort(
      (a, b) => (b.importance || 0) - (a.importance || 0)
    );

    res.status(200).json({
      query,
      results: transformedResults,
      count: transformedResults.length,
    });
  } catch (error) {
    console.error("Geocoding error:", error);

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        return res.status(408).json({ error: "Geocoding request timed out" });
      }
      if (error.response?.status === 429) {
        return res
          .status(429)
          .json({ error: "Too many requests to geocoding service" });
      }
    }

    res.status(500).json({ error: "Geocoding service unavailable" });
  }
}
