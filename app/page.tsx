// app/page.tsx
"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useDropzone } from "react-dropzone";
import axios from "axios";

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-96 text-zinc-800 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
      Loading Map...
    </div>
  ),
});

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
  canReadGPS?: boolean;
  canWriteGPS?: boolean;
  canReadMetadata?: boolean;
  canWriteMetadata?: boolean;
  supportMethod?: string;
  supportNotes?: string;
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
  [key: string]: unknown;
}

interface SupportSummary {
  totalFiles: number;
  canReadGPS: number;
  canWriteGPS: number;
  fullySupported: number;
  readOnly: number;
  unsupported: number;
}

export default function Home() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates>({
    lat: 0,
    lon: 0,
  });
  const [keywords, setKeywords] = useState("");
  const [description, setDescription] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showExistingTags, setShowExistingTags] = useState(true);
  const [isWriting, setIsWriting] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [supportSummary, setSupportSummary] = useState<SupportSummary | null>(
    null
  );

  // Handle file upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    setUploadWarnings([]);
    setSupportSummary(null);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("images", file);
      });

      const response = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const uploadedImages: ImageData[] = response.data.images;
      const warnings: string[] = response.data.warnings || [];
      const summary: SupportSummary = response.data.supportSummary;

      setImages((prev) => [...prev, ...uploadedImages]);
      setSupportSummary(summary);

      if (warnings.length > 0) {
        setUploadWarnings(warnings);
      }

      // Select first uploaded image
      if (uploadedImages.length > 0) {
        selectImage(uploadedImages[0]);
      }

      if (uploadedImages.length > 0) {
        const successMessage =
          `Successfully uploaded ${uploadedImages.length} image(s).\n\n` +
          `Format Support Summary:\n` +
          `• Full GPS Support: ${summary.fullySupported} files\n` +
          `• Read-Only GPS: ${summary.readOnly} files\n` +
          `• No GPS Support: ${summary.unsupported} files` +
          (warnings.length > 0 ? `\n\nWarnings: ${warnings.length}` : "");
        alert(successMessage);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      if (axios.isAxiosError(error) && error.response?.data) {
        const errorMessage = error.response.data.error || "Upload failed";
        const details = error.response.data.details;
        alert(
          `Upload failed: ${errorMessage}${
            details ? `\n\nDetails: ${details}` : ""
          }`
        );
      } else {
        alert("Upload failed. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/tiff": [".tiff", ".tif"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
    },
    multiple: true,
  });

  // Select an image for editing
  const selectImage = (image: ImageData) => {
    setSelectedImage(image);
    if (image.lat && image.lon) {
      setCoordinates({ lat: image.lat, lon: image.lon });
    }
    setKeywords(image.keywords || "");
    setDescription(image.description || "");
  };

  // Handle coordinate changes from map
  const handleCoordinateChange = (newCoords: Coordinates) => {
    setCoordinates(newCoords);
  };

  // Search for places
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response = await axios.get(
        `/api/geocode?q=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults(response.data.results || []);
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Please try again.");
    }
  };

  // Select search result
  const selectSearchResult = (result: SearchResult) => {
    setCoordinates({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    });
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  // Write metadata
  const writeMetadata = async () => {
    if (!selectedImage) return;

    // Check if image supports writing
    if (!selectedImage.canWriteGPS || !selectedImage.canWriteMetadata) {
      const supportInfo =
        `Format Support for ${selectedImage.type}:\n\n` +
        `• Can Read GPS: ${selectedImage.canReadGPS ? "Yes" : "No"}\n` +
        `• Can Write GPS: ${selectedImage.canWriteGPS ? "Yes" : "No"}\n` +
        `• Method: ${selectedImage.supportMethod || "N/A"}\n\n` +
        `${selectedImage.supportNotes || "No additional notes"}`;

      alert(supportInfo);
      return;
    }

    // Validate coordinates
    if (
      (!coordinates.lat && coordinates.lat !== 0) ||
      (!coordinates.lon && coordinates.lon !== 0)
    ) {
      alert(
        "Please set a location on the map or enter coordinates before writing metadata."
      );
      return;
    }

    if (coordinates.lat < -90 || coordinates.lat > 90) {
      alert("Latitude must be between -90 and 90 degrees.");
      return;
    }

    if (coordinates.lon < -180 || coordinates.lon > 180) {
      alert("Longitude must be between -180 and 180 degrees.");
      return;
    }

    console.log("Writing metadata:");
    console.log("- Image ID:", selectedImage.id);
    console.log("- Coordinates:", coordinates.lat, coordinates.lon);
    console.log("- Keywords:", keywords || "none");
    console.log("- Description:", description || "none");
    console.log("- Support method:", selectedImage.supportMethod);

    setIsWriting(true);
    try {
      const requestData = {
        id: selectedImage.id,
        lat: Number(coordinates.lat),
        lon: Number(coordinates.lon),
        keywords: keywords.trim() || undefined,
        description: description.trim() || undefined,
      };

      console.log("Sending request data:", requestData);

      const response = await axios.post("/api/write", requestData, {
        responseType: "blob",
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `geotagged_${selectedImage.filename}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Get metadata method from response headers
      const metadataMethod =
        response.headers["x-metadata-method"] || selectedImage.supportMethod;
      const verification = response.headers["x-metadata-verification"];

      let verificationMessage = "";
      if (verification) {
        try {
          const verifyData = JSON.parse(verification);
          verificationMessage =
            `\n\nVerification Results:` +
            `\n• GPS: ${verifyData.gpsWritten ? "✅ Written" : "❌ Failed"}${
              verifyData.gpsMatch ? " & Verified" : ""
            }` +
            `\n• Keywords: ${
              verifyData.keywordsWritten ? "✅ Written" : "❌ Failed"
            }${verifyData.keywordsMatch ? " & Verified" : ""}` +
            `\n• Description: ${
              verifyData.descriptionWritten ? "✅ Written" : "❌ Failed"
            }${verifyData.descriptionMatch ? " & Verified" : ""}`;
        } catch (e) {
          console.warn("Could not parse verification data:", e);
        }
      }

      alert(
        `GPS metadata written successfully using ${metadataMethod?.toUpperCase()} method!\n\nFile downloaded with embedded location data.${verificationMessage}`
      );
    } catch (error) {
      console.error("Write failed:", error);
      if (axios.isAxiosError(error) && error.response?.data) {
        // Try to read error message from blob
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorData = JSON.parse(reader.result as string);
            const errorMessage = errorData.error || "Failed to write metadata";
            const suggestion = errorData.suggestion || "";
            alert(
              `${errorMessage}${
                suggestion ? `\n\nSuggestion: ${suggestion}` : ""
              }`
            );
          } catch {
            alert("Failed to write metadata. Please try again.");
          }
        };
        reader.readAsText(error.response.data);
      } else {
        alert("Failed to write metadata. Please try again.");
      }
    } finally {
      setIsWriting(false);
    }
  };

  // Debug PNG chunks function
  const debugPNGChunks = async () => {
    if (!selectedImage) return;

    try {
      const response = await axios.post("/api/debug-png-chunks", {
        id: selectedImage.id,
      });

      const debugInfo = response.data;

      // Create a detailed debug report
      const report =
        `🔍 PNG CHUNKS DEBUG REPORT\n\n` +
        `📁 File: ${debugInfo.filename}\n` +
        `📏 Size: ${(debugInfo.totalSize / 1024).toFixed(1)} KB\n` +
        `📊 Total Chunks: ${debugInfo.totalChunks}\n` +
        `📝 Text Chunks: ${debugInfo.textChunks}\n` +
        `🌍 GPS Chunks: ${debugInfo.gpsChunks}\n\n` +
        `🗃️ GPS ANALYSIS:\n` +
        `• Has GPS chunks: ${
          debugInfo.summary.hasGPSChunks ? "✅ YES" : "❌ NO"
        }\n` +
        (debugInfo.summary.gpsChunkKeywords.length > 0
          ? `• GPS keywords: ${debugInfo.summary.gpsChunkKeywords.join(", ")}\n`
          : "") +
        (debugInfo.summary.parsedGPSData.length > 0
          ? `• Parsed GPS data:\n${debugInfo.summary.parsedGPSData
              .map(
                (gps: any) =>
                  `  - ${gps.keyword} (${gps.format}): ${gps.gps.lat}, ${gps.gps.lon}`
              )
              .join("\n")}\n`
          : "• No valid GPS data found\n") +
        `\n📋 ALL TEXT CHUNKS:\n` +
        debugInfo.chunks
          .filter(
            (chunk: any) => chunk.type === "tEXt" || chunk.type === "iTXt"
          )
          .map(
            (chunk: any, i: number) =>
              `${i + 1}. ${chunk.keyword || "Unknown"}: ${(
                chunk.text || ""
              ).substring(0, 50)}${(chunk.text || "").length > 50 ? "..." : ""}`
          )
          .join("\n");

      // Show in alert for now
      alert(report);

      // Also log to console for detailed inspection
      console.log("PNG chunks debug response:", debugInfo);
    } catch (error) {
      console.error("PNG chunks debug failed:", error);
      alert("PNG chunks debug failed. Check console for details.");
    }
  };

  // Test coordinates function
  const testCoordinates = async () => {
    try {
      const requestData = {
        lat: coordinates.lat,
        lon: coordinates.lon,
        keywords: keywords.trim() || undefined,
        description: description.trim() || undefined,
      };

      console.log("Testing coordinates with data:", requestData);

      const response = await axios.post("/api/test-coordinates", requestData);

      const testResult = response.data;

      const report =
        `🧪 COORDINATE TEST REPORT\n\n` +
        `📊 INPUT VALUES:\n` +
        `• Lat: ${testResult.input.lat} (${testResult.types.lat})\n` +
        `• Lon: ${testResult.input.lon} (${testResult.types.lon})\n\n` +
        `🔢 CONVERTED VALUES:\n` +
        `• Lat: ${testResult.converted.lat}\n` +
        `• Lon: ${testResult.converted.lon}\n\n` +
        `✅ VALIDATION:\n` +
        `• Valid Numbers: ${
          testResult.valid.numbers.latValid && testResult.valid.numbers.lonValid
            ? "YES"
            : "NO"
        }\n` +
        `• Valid Ranges: ${
          testResult.valid.ranges.validLat && testResult.valid.ranges.validLon
            ? "YES"
            : "NO"
        }\n\n` +
        `🌍 GPS CONVERSION:\n` +
        (testResult.gpsData
          ? `• Lat: ${testResult.gpsData.lat.dms[0]}°${testResult.gpsData.lat.dms[1]}'${testResult.gpsData.lat.dms[2]}"${testResult.gpsData.lat.ref}\n` +
            `• Lon: ${testResult.gpsData.lon.dms[0]}°${testResult.gpsData.lon.dms[1]}'${testResult.gpsData.lon.dms[2]}"${testResult.gpsData.lon.ref}\n`
          : "• GPS conversion failed\n") +
        `\n🎯 FINAL RESULT: ${
          testResult.success ? "✅ READY TO WRITE" : "❌ INVALID DATA"
        }`;

      alert(report);
      console.log("Coordinate test result:", testResult);
    } catch (error) {
      console.error("Test failed:", error);
      alert("Coordinate test failed. Check console for details.");
    }
  };

  // Debug metadata function
  const debugMetadata = async () => {
    if (!selectedImage) return;

    try {
      const response = await axios.post("/api/debug-metadata", {
        id: selectedImage.id,
      });

      const debugInfo = response.data;

      // Create a detailed debug report
      const report =
        `🔍 METADATA DEBUG REPORT\n\n` +
        `📁 File: ${debugInfo.filename}\n` +
        `📊 Type: ${debugInfo.mimeType}\n` +
        `📏 Size: ${(debugInfo.fileSize / 1024).toFixed(1)} KB\n\n` +
        `🗃️ METADATA FOUND:\n` +
        `• GPS: ${debugInfo.debug.hasGPS ? "✅ YES" : "❌ NO"}\n` +
        `• Keywords: ${debugInfo.debug.hasKeywords ? "✅ YES" : "❌ NO"}\n` +
        `• Description: ${
          debugInfo.debug.hasDescription ? "✅ YES" : "❌ NO"
        }\n` +
        `• Date/Time: ${debugInfo.debug.hasDateTime ? "✅ YES" : "❌ NO"}\n` +
        `• Camera Info: ${
          debugInfo.debug.hasCameraInfo ? "✅ YES" : "❌ NO"
        }\n\n` +
        `📋 DETAILED METADATA:\n` +
        (debugInfo.metadata.gps
          ? `GPS: ${debugInfo.metadata.gps.lat}, ${debugInfo.metadata.gps.lon}\n`
          : "") +
        (debugInfo.metadata.keywords
          ? `Keywords: ${debugInfo.metadata.keywords}\n`
          : "") +
        (debugInfo.metadata.description
          ? `Description: ${debugInfo.metadata.description}\n`
          : "") +
        (debugInfo.metadata.dateTime
          ? `Date: ${debugInfo.metadata.dateTime}\n`
          : "") +
        (debugInfo.metadata.cameraMake
          ? `Camera: ${debugInfo.metadata.cameraMake} ${
              debugInfo.metadata.cameraModel || ""
            }\n`
          : "") +
        (debugInfo.rawChunks
          ? `\n🧩 PNG CHUNKS (${debugInfo.rawChunks.length}):\n` +
            debugInfo.rawChunks
              .map(
                (chunk: any, i: number) =>
                  `${i + 1}. ${chunk.type}${
                    chunk.keyword ? ` (${chunk.keyword})` : ""
                  }${
                    chunk.text
                      ? `: ${chunk.text.substring(0, 50)}${
                          chunk.text.length > 50 ? "..." : ""
                        }`
                      : ""
                  }`
              )
              .join("\n")
          : "");

      // Show in alert for now (in production, you might want a modal)
      alert(report);

      // Also log to console for detailed inspection
      console.log("Debug metadata response:", debugInfo);
    } catch (error) {
      console.error("Debug failed:", error);
      alert("Debug failed. Check console for details.");
    }
  };

  // Clear all data
  const clearAll = async () => {
    try {
      await axios.post("/api/clear");
      setImages([]);
      setSelectedImage(null);
      setCoordinates({ lat: 0, lon: 0 });
      setKeywords("");
      setDescription("");
      setSearchQuery("");
      setSearchResults([]);
      setUploadWarnings([]);
      setSupportSummary(null);
    } catch (error) {
      console.error("Clear failed:", error);
    }
  };

  // Get status icon for image support
  const getStatusIcon = (image: ImageData) => {
    if (image.canReadGPS && image.canWriteGPS) {
      return <span className="text-green-600">●</span>;
    } else if (image.canReadGPS) {
      return <span className="text-yellow-600">◐</span>;
    } else {
      return <span className="text-red-600">○</span>;
    }
  };

  const getStatusText = (image: ImageData) => {
    if (image.canReadGPS && image.canWriteGPS) {
      return "Full Support";
    } else if (image.canReadGPS) {
      return "Read Only";
    } else {
      return "No Support";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Universal GeoImgr Tool
          </h1>
          <p className="text-gray-600">
            Add GPS coordinates and metadata to images in any format
          </p>
          <p className="text-sm text-gray-500 mt-2">
            ✨ Now supports JPEG, PNG, WebP, TIFF, HEIC with universal metadata
            handling
          </p>
        </header>

        {/* Support Summary */}
        {supportSummary && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-blue-800 font-semibold mb-2">
              Format Support Summary:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {supportSummary.totalFiles}
                </div>
                <div className="text-blue-700">Total Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {supportSummary.fullySupported}
                </div>
                <div className="text-green-700">Full Support</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {supportSummary.readOnly}
                </div>
                <div className="text-yellow-700">Read Only</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {supportSummary.unsupported}
                </div>
                <div className="text-red-700">Unsupported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {supportSummary.canReadGPS}
                </div>
                <div className="text-green-700">Can Read GPS</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {supportSummary.canWriteGPS}
                </div>
                <div className="text-green-700">Can Write GPS</div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Warnings */}
        {uploadWarnings.length > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-yellow-800 font-semibold mb-2">
              Upload Warnings:
            </h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              {uploadWarnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Upload and Image List */}
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="bg-white p-6 text-zinc-900 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Upload Images</h2>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input {...getInputProps()} />
                {isProcessing ? (
                  <div className="text-blue-600">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    Processing...
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-2">
                      {isDragActive
                        ? "Drop images here..."
                        : "Drag & drop images here, or click to select"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports JPEG, PNG, WebP, TIFF, HEIC/HEIF
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      Universal metadata support for all formats!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Image List */}
            {images.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-zinc-900 text-xl font-semibold mb-4">
                  Uploaded Images ({images.length})
                </h2>
                <div className="text-gray-600 space-y-2 max-h-64 overflow-y-auto">
                  {images.map((image) => (
                    <div
                      key={image.id}
                      onClick={() => selectImage(image)}
                      className={`p-3 rounded cursor-pointer transition-colors ${
                        selectedImage?.id === image.id
                          ? "bg-blue-100 border-2 border-blue-500"
                          : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                      }`}
                    >
                      <div className="font-medium truncate flex items-center gap-2">
                        {getStatusIcon(image)}
                        {image.filename}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                        <span>{(image.size / 1024 / 1024).toFixed(2)} MB</span>
                        {image.lat && image.lon && (
                          <span className="text-green-600">📍 Geotagged</span>
                        )}
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            image.canReadGPS && image.canWriteGPS
                              ? "bg-green-100 text-green-700"
                              : image.canReadGPS
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {getStatusText(image)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Method: {image.supportMethod || "Unknown"} |{" "}
                        {image.type}
                      </div>
                      {image.cameraMake && image.cameraModel && (
                        <div className="text-xs text-gray-400">
                          📷 {image.cameraMake} {image.cameraModel}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clear Button */}
            {images.length > 0 && (
              <button
                onClick={clearAll}
                className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
              >
                Clear All ({images.length} images)
              </button>
            )}
          </div>

          {/* Center Panel - Map */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-zinc-900 text-xl font-semibold mb-4">
              Location
            </h2>

            {/* Search Box */}
            <div className="mb-4">
              <div className="flex text-zinc-600 gap-2">
                <input
                  type="text"
                  placeholder="Search for a place or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Search
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 text-zinc-600 border border-gray-300 rounded-lg max-h-32 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => selectSearchResult(result)}
                      className="p-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                    >
                      <div className="text-sm truncate">
                        {result.display_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coordinate Inputs */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={coordinates.lat}
                  onChange={(e) => {
                    const lat = parseFloat(e.target.value) || 0;
                    setCoordinates((prev) => ({ ...prev, lat }));
                  }}
                  className="w-full p-2 text-zinc-600 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={coordinates.lon}
                  onChange={(e) => {
                    const lon = parseFloat(e.target.value);
                    setCoordinates((prev) => ({
                      ...prev,
                      lon: isNaN(lon) ? 0 : lon,
                    }));
                  }}
                  className="w-full p-2 text-zinc-600 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Map */}
            <div className="h-96 rounded-lg overflow-hidden">
              <MapComponent
                coordinates={coordinates}
                onCoordinateChange={handleCoordinateChange}
              />
            </div>

            {/* Existing Tags Toggle */}
            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showExistingTags}
                  onChange={(e) => setShowExistingTags(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  Show existing geotags
                </span>
              </label>
            </div>
          </div>

          {/* Right Panel - Metadata */}
          <div className="space-y-6">
            {/* Current Image Info */}
            {selectedImage && (
              <div className="bg-white text-zinc-900 p-6 rounded-lg shadow-md">
                <h2 className="text-zinc-900 text-xl font-semibold mb-4">
                  Selected Image
                </h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>File:</strong> {selectedImage.filename}
                  </div>
                  <div>
                    <strong>Size:</strong>{" "}
                    {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <div>
                    <strong>Format:</strong> {selectedImage.type}
                  </div>

                  {/* Support Status */}
                  <div className="bg-gray-50 p-3 rounded mt-3">
                    <div className="font-medium text-gray-700 mb-2">
                      Format Support:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            selectedImage.canReadGPS
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {selectedImage.canReadGPS ? "✓" : "✗"}
                        </span>
                        Read GPS
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            selectedImage.canWriteGPS
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {selectedImage.canWriteGPS ? "✓" : "✗"}
                        </span>
                        Write GPS
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            selectedImage.canReadMetadata
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {selectedImage.canReadMetadata ? "✓" : "✗"}
                        </span>
                        Read Metadata
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            selectedImage.canWriteMetadata
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {selectedImage.canWriteMetadata ? "✓" : "✗"}
                        </span>
                        Write Metadata
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      <strong>Method:</strong>{" "}
                      {selectedImage.supportMethod || "Unknown"}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {selectedImage.supportNotes}
                    </div>
                  </div>

                  {/* Existing Metadata */}
                  {selectedImage.lat && selectedImage.lon && (
                    <div>
                      <strong>Current GPS:</strong>{" "}
                      {selectedImage.lat.toFixed(6)},{" "}
                      {selectedImage.lon.toFixed(6)}
                    </div>
                  )}
                  {selectedImage.dateTime && (
                    <div>
                      <strong>Date Taken:</strong> {selectedImage.dateTime}
                    </div>
                  )}
                  {selectedImage.cameraMake && selectedImage.cameraModel && (
                    <div>
                      <strong>Camera:</strong> {selectedImage.cameraMake}{" "}
                      {selectedImage.cameraModel}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Keywords */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-zinc-900 text-xl font-semibold mb-4">
                Keywords/Tags
              </h2>
              <textarea
                placeholder="Enter comma-separated keywords..."
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full text-zinc-600 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                rows={3}
                maxLength={6600}
              />
              <div className="text-sm text-gray-500 mt-1">
                {keywords.length}/6600 characters
              </div>
            </div>

            {/* Description */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-zinc-900 text-xl font-semibold mb-4">
                Description
              </h2>
              <textarea
                placeholder="Enter image description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-zinc-600 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                rows={4}
                maxLength={1300}
              />
              <div className="text-sm text-gray-500 mt-1">
                {description.length}/1300 characters
              </div>
            </div>

            {/* Action Buttons */}
            {selectedImage && (
              <div className="space-y-3">
                <button
                  onClick={writeMetadata}
                  disabled={
                    isWriting ||
                    (!selectedImage.canWriteGPS &&
                      !selectedImage.canWriteMetadata)
                  }
                  className={`w-full py-3 px-4 rounded-lg transition-colors ${
                    selectedImage.canWriteGPS && selectedImage.canWriteMetadata
                      ? "bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
                      : selectedImage.canReadGPS
                      ? "bg-yellow-600 text-white hover:bg-yellow-700"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  } disabled:cursor-not-allowed`}
                >
                  {isWriting ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Writing Metadata...
                    </span>
                  ) : selectedImage.canWriteGPS &&
                    selectedImage.canWriteMetadata ? (
                    `Write GPS Data & Download (${selectedImage.supportMethod?.toUpperCase()})`
                  ) : selectedImage.canReadGPS ? (
                    "Show Format Support Info"
                  ) : (
                    "Format Not Supported"
                  )}
                </button>

                {/* Debug buttons for testing metadata */}
                {process.env.NODE_ENV === "development" && (
                  <div className="space-y-2">
                    <button
                      onClick={debugMetadata}
                      className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                    >
                      🔍 Debug Metadata (Dev Only)
                    </button>
                    <button
                      onClick={testCoordinates}
                      className="w-full py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
                    >
                      🧪 Test Coordinates (Dev Only)
                    </button>
                    {selectedImage?.type === "image/png" && (
                      <button
                        onClick={debugPNGChunks}
                        className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                      >
                        🧩 Debug PNG Chunks (Dev Only)
                      </button>
                    )}
                  </div>
                )}

                {(!selectedImage.canWriteGPS ||
                  !selectedImage.canWriteMetadata) && (
                  <div
                    className={`text-sm text-center p-3 rounded ${
                      selectedImage.canReadGPS
                        ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    <p className="font-semibold mb-1">
                      {selectedImage.canReadGPS
                        ? "Read-Only Support"
                        : "Limited Support"}
                    </p>
                    <p className="text-xs">{selectedImage.supportNotes}</p>
                    {!selectedImage.canWriteGPS && selectedImage.canReadGPS && (
                      <p className="text-xs mt-2 font-medium">
                        💡 This format can read GPS data but writing is limited.
                        The format may support GPS but our current libraries
                        have limitations.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-zinc-900 text-xl font-semibold mb-4">
            Universal GPS Metadata Support
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">
                How It Works:
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Upload images in any supported format</li>
                <li>The app automatically detects format capabilities</li>
                <li>Select an image to view its GPS support level</li>
                <li>Set location using the map, search, or coordinates</li>
                <li>Add optional keywords and description</li>
                <li>
                  Write GPS data using the appropriate method for each format
                </li>
              </ol>
            </div>

            <div className="text-gray-700">
              <h3 className="font-semibold text-gray-800 mb-3">
                Format Support Matrix:
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">● Full</span>
                  <span>
                    <strong>JPEG/TIFF:</strong> Complete EXIF GPS support
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">● Full</span>
                  <span>
                    <strong>WebP:</strong> RIFF-based GPS metadata
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">● Full</span>
                  <span>
                    <strong>PNG:</strong> Custom text chunk GPS storage
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600">◐ Read</span>
                  <span>
                    <strong>HEIC/HEIF:</strong> Can read existing GPS, writing
                    limited
                  </span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded">
                <h4 className="font-semibold text-blue-800 mb-1">
                  Technical Methods:
                </h4>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>
                    • <strong>EXIF:</strong> Standard camera metadata (JPEG,
                    TIFF)
                  </li>
                  <li>
                    • <strong>RIFF:</strong> Container-based metadata (WebP)
                  </li>
                  <li>
                    • <strong>Custom:</strong> Format-specific implementations
                    (PNG)
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">
              ✨ Universal Support Features
            </h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• Automatic format detection and capability assessment</li>
              <li>• Multiple metadata reading/writing methods</li>
              <li>• Comprehensive GPS coordinate support</li>
              <li>• Format-specific optimization for best compatibility</li>
              <li>• Real-time support status for each uploaded image</li>
              <li>
                • Intelligent fallback methods when primary support unavailable
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
