// components/MapComponent.tsx
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
const icon = new Icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Coordinates {
  lat: number;
  lon: number;
}

interface MapComponentProps {
  coordinates: Coordinates;
  onCoordinateChange: (coords: Coordinates) => void;
}

// Component to handle map clicks and marker dragging
function MapEventHandler({
  onCoordinateChange,
}: {
  onCoordinateChange: (coords: Coordinates) => void;
}) {
  useMapEvents({
    click: (e) => {
      onCoordinateChange({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

// Draggable marker component
function DraggableMarker({
  coordinates,
  onCoordinateChange,
}: {
  coordinates: Coordinates;
  onCoordinateChange: (coords: Coordinates) => void;
}) {
  const [position, setPosition] = useState<[number, number]>([
    coordinates.lat,
    coordinates.lon,
  ]);

  useEffect(() => {
    setPosition([coordinates.lat, coordinates.lon]);
  }, [coordinates]);

  const eventHandlers = {
    dragend: (e: any) => {
      const marker = e.target;
      const newPos = marker.getLatLng();
      setPosition([newPos.lat, newPos.lng]);
      onCoordinateChange({ lat: newPos.lat, lon: newPos.lng });
    },
  };

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      icon={icon}
    >
      <Popup>
        <div>
          <strong>Location</strong>
          <br />
          Latitude: {position[0].toFixed(6)}
          <br />
          Longitude: {position[1].toFixed(6)}
          <br />
          <em>Drag marker to change location</em>
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapComponent({
  coordinates,
  onCoordinateChange,
}: MapComponentProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    coordinates.lat || 0,
    coordinates.lon || 0,
  ]);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    // Update map center when coordinates change significantly
    const newCenter: [number, number] = [coordinates.lat, coordinates.lon];
    const distance = Math.sqrt(
      Math.pow(newCenter[0] - mapCenter[0], 2) +
        Math.pow(newCenter[1] - mapCenter[1], 2)
    );

    // If coordinates changed by more than 0.1 degrees, recenter map
    if (distance > 0.1) {
      setMapCenter(newCenter);
      setMapKey((prev) => prev + 1); // Force map re-render
    }
  }, [coordinates, mapCenter]);

  // Determine initial zoom level based on coordinates
  const getInitialZoom = () => {
    if (coordinates.lat === 0 && coordinates.lon === 0) {
      return 2; // World view
    }
    return 13; // City level
  };

  return (
    <MapContainer
      key={mapKey}
      center={mapCenter}
      zoom={getInitialZoom()}
      style={{ height: "100%", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapEventHandler onCoordinateChange={onCoordinateChange} />

      <DraggableMarker
        coordinates={coordinates}
        onCoordinateChange={onCoordinateChange}
      />
    </MapContainer>
  );
}
