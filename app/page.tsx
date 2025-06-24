// pages/index.tsx
"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useDropzone } from "react-dropzone";
import axios from "axios";

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-96 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
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
  size: number;
  type: string;
}

interface Coordinates {
  lat: number;
  lon: number;
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

  // const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("images", file);
      });

      const response = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const uploadedImages: ImageData[] = response.data.images;
      setImages((prev) => [...prev, ...uploadedImages]);

      // Select first uploaded image
      if (uploadedImages.length > 0) {
        selectImage(uploadedImages[0]);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
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

  // Handle manual coordinate input
  // const handleLatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const lat = parseFloat(e.target.value) || 0;
  //   setCoordinates((prev) => ({ ...prev, lat }));
  // };

  // const handleLonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const lon = parseFloat(e.target.value);
  //   console.log("User entered longitude:", lon);
  //   setCoordinates((prev) => ({ ...prev, lon: isNaN(lon) ? 0 : lon }));
  // };

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
    }
  };

  // Select search result
  interface SearchResult {
    lat: string;
    lon: string;
    display_name: string;
    [key: string]: unknown;
  }

  const selectSearchResult = (result: SearchResult) => {
    setCoordinates({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    });
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  // Write EXIF tags
  const writeExifTags = async () => {
    if (!selectedImage) return;
    console.log("Sending to backend:", coordinates.lat, coordinates.lon);

    setIsWriting(true);
    try {
      const response = await axios.post(
        "/api/write",
        {
          id: selectedImage.id,
          lat: coordinates.lat,
          lon: coordinates.lon,
          keywords: keywords.trim(),
          description: description.trim(),
        },
        {
          responseType: "blob",
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `geotagged_${selectedImage.filename}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert("EXIF tags written successfully! File downloaded.");
    } catch (error) {
      console.error("Write failed:", error);
      alert("Failed to write EXIF tags. Please try again.");
    } finally {
      setIsWriting(false);
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
    } catch (error) {
      console.error("Clear failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            GeoImgr Tool
          </h1>
          <p className="text-gray-600">
            Add GPS coordinates and metadata to your images
          </p>
        </header>

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
                      Supports JPEG, PNG, WebP, TIFF, HEIC
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Image List */}
            {images.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-zinc-900 text-xl font-semibold mb-4">
                  Uploaded Images
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
                      <div className="font-medium truncate">
                        {image.filename}
                      </div>
                      <div className="text-sm text-gray-500">
                        {(image.size / 1024 / 1024).toFixed(2)} MB
                        {image.lat && image.lon && (
                          <span className="ml-2 text-green-600">
                            ● Geotagged
                          </span>
                        )}
                      </div>
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
                Clear All
              </button>
            )}
          </div>

          {/* Center Panel - Map */}
          <div className="bg-white p-6 rounded-lg  shadow-md">
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
                    console.log(
                      "Latitude changed:",
                      lat,
                      "Longitude:",
                      coordinates.lon
                    );
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
                    console.log(
                      "Longitude changed:",
                      lon,
                      "Latitude:",
                      coordinates.lat
                    );
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
                  onClick={writeExifTags}
                  disabled={isWriting}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isWriting ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Writing EXIF Tags...
                    </span>
                  ) : (
                    "Write EXIF Tags & Download"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-zinc-900 text-xl font-semibold mb-4">
            How to Geotag Images
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>
              Upload one or more images using drag & drop or the file selector
            </li>
            <li>
              Select an image from the list - existing geotags will be shown if
              present
            </li>
            <li>
              Set the location by dragging the map marker, searching for a
              place, or entering coordinates manually
            </li>
            <li>
              Optionally add keywords/tags and a description for SEO and
              organization
            </li>
            <li>
              Click &quot;Write EXIF Tags & Download&quot; to embed the metadata
              and download the updated image
            </li>
            <li>
              The downloaded image will contain all the geolocation and metadata
              information
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
