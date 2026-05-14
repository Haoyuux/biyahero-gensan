import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface OsmMapHandle {
  setUserLocation: (lat: number, lng: number) => void;
  clearPickup: () => void;
  setDestination: (lat: number, lng: number, label?: string) => void;
  clearDestination: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  drawRoute: (coords: [number, number][]) => void;
  clearRoute: () => void;
  setRiderLocation: (lat: number, lng: number, avatarUrl?: string) => void;
  clearRider: () => void;
  setMyLocation: (lat: number, lng: number, avatarUrl?: string) => void;
  clearMyLocation: () => void;
  rotateTo: (bearing: number) => void;
  resetNorth: () => void;
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
  <script src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    #compass-btn {
      position: absolute;
      top: 116px; right: 14px;
      z-index: 1000;
      width: 38px; height: 38px;
      background: #fff;
      border: none; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.22);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      transition: transform 0.3s;
    }
    #compass-needle {
      display: inline-block;
      transition: transform 0.3s;
      font-size: 20px;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <button id="compass-btn" onclick="window.resetNorth()" title="Reset north">
    <span id="compass-needle">⬆</span>
  </button>
  <script>
    const DEFAULT_LAT = 6.1164, DEFAULT_LNG = 125.1716;
    const map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      rotate: true,
      touchRotate: true,
      rotateControl: false,
    }).setView([DEFAULT_LAT, DEFAULT_LNG], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Keep compass needle pointing north as map rotates
    map.on('rotate', function(e) {
      const bearing = map.getBearing();
      const needle = document.getElementById('compass-needle');
      if (needle) needle.style.transform = 'rotate(' + (-bearing) + 'deg)';
      const btn = document.getElementById('compass-btn');
      if (btn) btn.style.opacity = Math.abs(bearing) > 2 ? '1' : '0.5';
    });

    const userIcon = L.divIcon({
      html: '<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#111">● Pickup point</div><div style="width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div></div>',
      iconSize: [130, 44], iconAnchor: [65, 44], className: '',
    });
    function buildAvatarIcon(avatarUrl, borderColor) {
      const circleStyle = 'width:48px;height:48px;border-radius:50%;border:3px solid ' + borderColor + ';overflow:hidden;background:#f3f4f6;'
        + (avatarUrl
          ? 'background-image:url("' + avatarUrl + '");background-size:cover;background-position:center'
          : 'display:flex;align-items:center;justify-content:center');
      const inner = avatarUrl ? '' : '<span style="font-size:22px;line-height:48px;display:block;text-align:center">🏍️</span>';
      return L.divIcon({
        html: '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.4))">'
          + '<div style="width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;border-bottom:22px solid ' + borderColor + '"></div>'
          + '<div style="' + circleStyle + '">' + inner + '</div>'
          + '</div>',
        iconSize: [54, 79],
        iconAnchor: [27, 79],
        className: '',
      });
    }

    let userMarker = null, destMarker = null, riderMarker = null, myMarker = null, routeLine = null;
    let myMarkerAvatar = null, riderMarkerAvatar = null;

    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(data);
      } else {
        window.parent.postMessage(data, '*');
      }
    };

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

    window.clearPickup = () => {
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
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
    window.setRiderLocation = (lat, lng, avatarUrl) => {
      const icon = buildAvatarIcon(avatarUrl || '', '#f59e0b');
      if (riderMarker) {
        riderMarker.setLatLng([lat, lng]);
        if (avatarUrl !== riderMarkerAvatar) { riderMarker.setIcon(icon); riderMarkerAvatar = avatarUrl; }
      } else {
        riderMarkerAvatar = avatarUrl;
        riderMarker = L.marker([lat, lng], { icon }).addTo(map);
      }
    };
    window.clearRider = () => {
      if (riderMarker) { map.removeLayer(riderMarker); riderMarker = null; riderMarkerAvatar = null; }
    };
    window.setMyLocation = (lat, lng, avatarUrl) => {
      const icon = buildAvatarIcon(avatarUrl || '', '#030712');
      if (myMarker) {
        myMarker.setLatLng([lat, lng]);
        if (avatarUrl !== myMarkerAvatar) { myMarker.setIcon(icon); myMarkerAvatar = avatarUrl; }
      } else {
        myMarkerAvatar = avatarUrl;
        myMarker = L.marker([lat, lng], { icon }).addTo(map);
      }
    };
    window.clearMyLocation = () => {
      if (myMarker) { map.removeLayer(myMarker); myMarker = null; myMarkerAvatar = null; }
    };
    window.rotateTo = (bearing) => {
      map.setBearing(bearing, { animate: true, duration: 0.4 });
    };
    window.resetNorth = () => {
      map.setBearing(0, { animate: true, duration: 0.4 });
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
    clearPickup: () => send('window.clearPickup()'),
    setDestination: (lat, lng, label = '') =>
      send(`window.setDestination(${lat}, ${lng}, '${label.replace(/'/g, "\\'")}')`),
    clearDestination: () => send('window.clearDestination()'),
    flyTo: (lat, lng, zoom = 15) => send(`window.flyTo(${lat}, ${lng}, ${zoom})`),
    drawRoute: (coords) => send(`window.drawRoute(${JSON.stringify(coords)})`),
    clearRoute: () => send('window.clearRoute()'),
    setRiderLocation: (lat, lng, avatarUrl = '') =>
      send(`window.setRiderLocation(${lat}, ${lng}, '${(avatarUrl ?? '').replace(/'/g, "\\'")}')`),
    clearRider: () => send('window.clearRider()'),
    setMyLocation: (lat, lng, avatarUrl = '') =>
      send(`window.setMyLocation(${lat}, ${lng}, '${(avatarUrl ?? '').replace(/'/g, "\\'")}')`),
    clearMyLocation: () => send('window.clearMyLocation()'),
    rotateTo: (bearing) => send(`window.rotateTo(${bearing})`),
    resetNorth: () => send('window.resetNorth()'),
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
