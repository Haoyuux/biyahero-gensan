import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface OsmMapHandle {
  setUserLocation: (lat: number, lng: number) => void;
  setDestination: (lat: number, lng: number, label?: string) => void;
  clearDestination: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  drawRoute: (coords: [number, number][]) => void;
  clearRoute: () => void;
  setRiderLocation: (lat: number, lng: number) => void;
  clearRider: () => void;
  setPickupDraggable: (enabled: boolean) => void;
  setDestDraggable: (enabled: boolean) => void;
}

interface Props {
  style?: object;
  onMapReady?: () => void;
  onLocationTap?: (lat: number, lng: number) => void;
  onPickupDragged?: (lat: number, lng: number) => void;
  onDestDragged?: (lat: number, lng: number) => void;
}

const buildHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const DEFAULT_LAT = 6.1164, DEFAULT_LNG = 125.1716;
    const map = L.map('map', { zoomControl: true, attributionControl: false })
      .setView([DEFAULT_LAT, DEFAULT_LNG], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const userIcon = L.divIcon({
      html: '<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#111">● Pickup point</div><div style="width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div></div>',
      iconSize: [130, 44], iconAnchor: [65, 44], className: '',
    });
    const destIcon = L.divIcon({
      html: '<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#111">● Where to?</div><div style="width:16px;height:16px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div></div>',
      iconSize: [100, 44], iconAnchor: [50, 44], className: '',
    });
    const riderIcon = L.divIcon({
      html: '<div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="background:#f59e0b;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#fff">🏍️ Rider</div><div style="width:14px;height:14px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div></div>',
      iconSize: [70, 40], iconAnchor: [35, 40], className: '',
    });

    let userMarker = null, destMarker = null, riderMarker = null, routeLine = null;

    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(data);
      } else {
        window.parent.postMessage(data, '*');
      }
    };

    // Receive commands from parent (web iframe bridge)
    window.addEventListener('message', (e) => {
      try { eval(e.data); } catch(err) {}
    });

    map.on('click', (e) => post({ type: 'mapTap', lat: e.latlng.lat, lng: e.latlng.lng }));

    window.setUserLocation = (lat, lng) => {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.marker([lat, lng], { icon: userIcon, draggable: true }).addTo(map);
        userMarker.on('dragend', (e) => {
          const ll = e.target.getLatLng();
          post({ type: 'pickupDragged', lat: ll.lat, lng: ll.lng });
        });
      }
    };

    window.setDestination = (lat, lng, label) => {
      const txt = label || 'Where to?';
      const icon = L.divIcon({
        html: '<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#111">● ' + txt + '</div><div style="width:16px;height:16px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div></div>',
        iconSize: [Math.max(100, txt.length * 8), 44],
        iconAnchor: [Math.max(50, txt.length * 4), 44],
        className: '',
      });
      if (destMarker) {
        destMarker.setIcon(icon);
        destMarker.setLatLng([lat, lng]);
      } else {
        destMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        destMarker.on('dragend', (e) => {
          const ll = e.target.getLatLng();
          post({ type: 'destDragged', lat: ll.lat, lng: ll.lng });
        });
      }
    };

    window.clearDestination = () => {
      if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    };
    window.flyTo = (lat, lng, zoom) => {
      map.flyTo([lat, lng], zoom || 15, { duration: 0.8 });
    };
    window.drawRoute = (coords) => {
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(coords, { color: '#030712', weight: 4, opacity: 0.8, lineJoin: 'round' }).addTo(map);
      if (coords.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    };
    window.clearRoute = () => {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    };
    window.setRiderLocation = (lat, lng) => {
      if (riderMarker) riderMarker.setLatLng([lat, lng]);
      else riderMarker = L.marker([lat, lng], { icon: riderIcon }).addTo(map);
    };
    window.clearRider = () => {
      if (riderMarker) { map.removeLayer(riderMarker); riderMarker = null; }
    };
    window.setPickupDraggable = (enabled) => {
      if (userMarker) { enabled ? userMarker.dragging.enable() : userMarker.dragging.disable(); }
    };
    window.setDestDraggable = (enabled) => {
      if (destMarker) { enabled ? destMarker.dragging.enable() : destMarker.dragging.disable(); }
    };

    function sendReady() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      } else {
        window.parent.postMessage(JSON.stringify({ type: 'ready' }), '*');
      }
    }
    map.whenReady(() => setTimeout(sendReady, 50));
  </script>
</body>
</html>
`;

const OsmMap = forwardRef<OsmMapHandle, Props>(({ style, onMapReady, onLocationTap, onPickupDragged, onDestDragged }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);

  const send = (js: string) => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(js, '*');
    } else {
      webViewRef.current?.injectJavaScript(js + '; true;');
    }
  };

  // Web: listen for postMessage from iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') onMapReady?.();
        if (msg.type === 'mapTap') onLocationTap?.(msg.lat, msg.lng);
        if (msg.type === 'pickupDragged') onPickupDragged?.(msg.lat, msg.lng);
        if (msg.type === 'destDragged') onDestDragged?.(msg.lat, msg.lng);
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMapReady, onLocationTap, onPickupDragged, onDestDragged]);

  useImperativeHandle(ref, () => ({
    setUserLocation: (lat, lng) => send(`window.setUserLocation(${lat}, ${lng})`),
    setDestination: (lat, lng, label = '') =>
      send(`window.setDestination(${lat}, ${lng}, '${label.replace(/'/g, "\\'")}')`),
    clearDestination: () => send('window.clearDestination()'),
    flyTo: (lat, lng, zoom = 15) => send(`window.flyTo(${lat}, ${lng}, ${zoom})`),
    drawRoute: (coords) => send(`window.drawRoute(${JSON.stringify(coords)})`),
    clearRoute: () => send('window.clearRoute()'),
    setRiderLocation: (lat, lng) => send(`window.setRiderLocation(${lat}, ${lng})`),
    clearRider: () => send('window.clearRider()'),
    setPickupDraggable: (enabled) => send(`window.setPickupDraggable(${enabled})`),
    setDestDraggable: (enabled) => send(`window.setDestDraggable(${enabled})`),
  }));

  const handleMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') onMapReady?.();
      if (msg.type === 'mapTap') onLocationTap?.(msg.lat, msg.lng);
      if (msg.type === 'pickupDragged') onPickupDragged?.(msg.lat, msg.lng);
      if (msg.type === 'destDragged') onDestDragged?.(msg.lat, msg.lng);
    } catch { /* ignore */ }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={buildHtml()}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="map"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: buildHtml(), baseUrl: 'https://unpkg.com' }}
        style={styles.webView}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        scrollEnabled={false}
      />
    </View>
  );
});

export default OsmMap;

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: '#e5e7eb' },
});
