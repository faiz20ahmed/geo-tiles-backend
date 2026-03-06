import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

const MapView = () => {
  const center = [12.345678, 45.678901]; // الإحداثيات الافتراضية لمركز الخريطة

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <Marker position={center}>
        <Popup>
          موقع تجريبي
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default MapView;