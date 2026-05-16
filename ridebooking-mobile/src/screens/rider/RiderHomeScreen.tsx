import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput,
  useWindowDimensions, Image, BackHandler, Alert, Vibration,
  Animated, PanResponder,
} from 'react-native';
import * as KeepAwake from 'expo-keep-awake';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OsmMap, { OsmMapHandle } from '../../components/OsmMap';
import { supabase, Profile, RiderVehicle } from '../../lib/supabase';
import { ChatMessage, fetchMessages, sendMessage, subscribeToMessages } from '../../lib/chatService';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

interface Props {
  profile: Profile;
  onSignOut: () => void;
}

const RIDER_RIDE_KEY = 'biyahero_rider_ride';
const RIDER_ERRAND_KEY = 'biyahero_rider_errand';

export default function RiderHomeScreen({ profile, onSignOut }: Props) {
  const { width, height: SCREEN_HEIGHT } = useWindowDimensions();

  // Draggable bottom sheet
  const riderSheetY = useRef(new Animated.Value(0)).current;
  const riderSheetSnapRef = useRef(0);
  const riderSheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        riderSheetY.setValue(Math.max(0, Math.min(riderSheetSnapRef.current, gs.dy)));
      },
      onPanResponderRelease: (_, gs) => {
        const snap = riderSheetSnapRef.current;
        const shouldCollapse = gs.dy > snap * 0.35 || gs.vy > 0.5;
        Animated.spring(riderSheetY, {
          toValue: shouldCollapse ? snap : 0,
          useNativeDriver: true,
          tension: 120,
          friction: 14,
        }).start();
      },
    })
  ).current;
  const fs = (base: number) => Math.round(base * (width / 390)); // responsive font scale
  const mapRef = useRef<OsmMapHandle>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const riderCurrentLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const riderTargetRef = useRef<{ lat: number; lng: number } | null>(null);
  const routeTickRef = useRef(0);
  const isOnlineRef = useRef(false);
  const acceptedRideIdRef = useRef<string | null>(null);
  const declinedRidesRef = useRef<Map<string, number>>(new Map());
  const currentRequestRef = useRef<any>(null);
  const ridesChannelRef = useRef<any>(null);
  const wasRestoredRef = useRef(false);
  const hasRestoredMapRef = useRef(false);
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertNotifIdsRef = useRef<string[]>([]);
  const notifiedRideIdsRef = useRef<Set<string>>(new Set());

  const [isOnline, setIsOnline] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Vehicle selection
  const [approvedVehicles, setApprovedVehicles] = useState<RiderVehicle[]>([]);
  const [activeVehicle, setActiveVehicle] = useState<RiderVehicle | null>(null);
  const [showVehicleSelect, setShowVehicleSelect] = useState(false);
  const pendingOnlineRef = useRef(false);

  // Today stats
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayRides, setTodayRides] = useState(0);

  // Requests
  const [requestQueue, setRequestQueue] = useState<any[]>([]);
  const [currentRequest, setCurrentRequest] = useState<any>(null);
  const [hasRequest, setHasRequest] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);

  // Active ride
  const [activeRide, setActiveRide] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<'going_to_pickup' | 'picked_up'>('going_to_pickup');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Errand requests
  const [currentErrand, setCurrentErrand] = useState<any>(null);
  const [hasErrand, setHasErrand] = useState(false);
  const [activeErrand, setActiveErrand] = useState<any>(null);
  const activeErrandRef = useRef<any>(null);
  const [errandStatus, setErrandStatus] = useState<'going_to_pickup' | 'picked_up' | 'going_to_dropoff'>('going_to_pickup');
  const errandChannelRef = useRef<any>(null);
  const [errandCanceling, setErrandCanceling] = useState(false);
  const [showErrandCancelConfirm, setShowErrandCancelConfirm] = useState(false);

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  const stopRideRequestAlert = () => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    alertNotifIdsRef.current.forEach(id =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    );
    alertNotifIdsRef.current = [];
    Vibration.cancel();
  };

  const saveRiderRide = async (request: any, accepted: boolean, status: 'going_to_pickup' | 'picked_up' = 'going_to_pickup') => {
    try {
      await AsyncStorage.setItem(RIDER_RIDE_KEY, JSON.stringify({ currentRequest: request, requestAccepted: accepted, rideStatus: status }));
    } catch { /* silent */ }
  };

  const clearRiderRide = async () => {
    try { await AsyncStorage.removeItem(RIDER_RIDE_KEY); } catch { /* silent */ }
  };

  const fetchRiderRoute = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
      );
      const data = await res.json();
      if (!data.routes?.[0]) return;
      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng],
      );
      mapRef.current?.drawRoute(coords);
    } catch { /* ignore */ }
  };

  const registerPushToken = async () => {
    try {
      if (Platform.OS === 'web') return;

      // Expo Go does not support remote push notifications from SDK 53+
      if (Constants.appOwnership === 'expo') {
        console.warn('[PUSH] Expo Go detected — push tokens not supported. Build an APK to test push.');
        return;
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;

      if (finalStatus !== 'granted') {
        console.warn('[PUSH] Permission denied');
        Alert.alert('Notifications disabled', 'Enable notifications in your phone settings to receive ride requests.');
        return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId ??
        '6a2352a2-9e24-401f-9273-41843f055a2b';

      const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
      console.log('[PUSH] token:', tokenData);

      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: tokenData })
        .eq('id', profile.id);

      if (error) {
        console.warn('[PUSH] save error:', error.message);
      } else {
        console.log('[PUSH] token saved successfully');
      }
    } catch (e: any) {
      console.warn('[PUSH] registerPushToken error:', e?.message ?? e);
    }
  };

  const unregisterPushToken = async () => {
    try {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', profile.id);
    } catch { /* silent */ }
  };


  // Force offline on every app open so stale DB state doesn't auto-online the rider
  useEffect(() => {
    supabase.from('profiles').update({ is_online: false }).eq('id', profile.id);
    unregisterPushToken();
    // Restore active errand from previous session
    AsyncStorage.getItem(RIDER_ERRAND_KEY).then(async raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!saved.errandId) return;
        const { data } = await supabase.from('errands').select('status, rider_id').eq('id', saved.errandId).single();
        if (!data || data.rider_id !== profile.id || !['accepted', 'picked_up'].includes(data.status)) {
          AsyncStorage.removeItem(RIDER_ERRAND_KEY);
          return;
        }
        setActiveErrand(saved);
        activeErrandRef.current = saved;
        setErrandStatus(data.status === 'picked_up' ? 'going_to_dropoff' : 'going_to_pickup');
      } catch { AsyncStorage.removeItem(RIDER_ERRAND_KEY); }
    });
  }, []);

  // Load approved vehicles
  useEffect(() => {
    supabase
      .from('vehicles')
      .select('*')
      .eq('rider_id', profile.id)
      .eq('status', 'approved')
      .order('vehicle_number', { ascending: true })
      .then(({ data }) => setApprovedVehicles((data ?? []) as RiderVehicle[]));
  }, [profile.id]);

  // GPS
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        async (loc) => {
          const { latitude, longitude } = loc.coords;
          riderCurrentLocRef.current = { lat: latitude, lng: longitude };
          if (mapReady) {
            mapRef.current?.setMyLocation(latitude, longitude);
            // Auto-rotate map to face direction of travel during active ride
            if (acceptedRideIdRef.current && loc.coords.heading != null && loc.coords.heading >= 0) {
              mapRef.current?.rotateTo(loc.coords.heading);
            }
          }
          if (isOnlineRef.current) {
            // Fire-and-forget — don't block GPS callback on DB round-trip
            supabase.from('profiles')
              .update({ last_lat: latitude, last_lng: longitude })
              .eq('id', profile.id);
            if (acceptedRideIdRef.current) {
              const ch = ridesChannelRef.current ?? supabase.channel('rides');
              ch.send({
                type: 'broadcast', event: 'RIDER_LOCATION',
                payload: { rideId: acceptedRideIdRef.current, lat: latitude, lng: longitude },
              });
              // Redraw route every 3 GPS ticks (~9s) toward current target
              if (riderTargetRef.current) {
                routeTickRef.current++;
                if (routeTickRef.current >= 3) {
                  routeTickRef.current = 0;
                  fetchRiderRoute({ lat: latitude, lng: longitude }, riderTargetRef.current);
                }
              }
            }
            if (activeErrandRef.current) {
              const ch = errandChannelRef.current ?? supabase.channel('errands');
              ch.send({
                type: 'broadcast', event: 'ERRAND_RIDER_LOCATION',
                payload: { errandId: activeErrandRef.current.errandId, lat: latitude, lng: longitude },
              });
            }
          }
        },
      );

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mapReady) {
        mapRef.current?.setMyLocation(loc.coords.latitude, loc.coords.longitude);
        mapRef.current?.flyTo(loc.coords.latitude, loc.coords.longitude, 15);
      }
    })();
    return () => { try { locationSub.current?.remove(); } catch { /* web compat */ } };
  }, [mapReady]);

  // Restore map markers + route after app restart mid-ride
  useEffect(() => {
    if (!mapReady || !wasRestoredRef.current || hasRestoredMapRef.current) return;
    if (!requestAccepted || !activeRide) return;
    hasRestoredMapRef.current = true;

    const target = rideStatus === 'going_to_pickup'
      ? activeRide.pickup?.coords
      : activeRide.dropoff?.coords;
    const label = rideStatus === 'going_to_pickup'
      ? '📍 Pickup: ' + (activeRide.pickup?.label ?? 'Passenger Pickup')
      : '🏁 Dropoff: ' + (activeRide.dropoff?.label ?? 'Destination');

    if (target) {
      riderTargetRef.current = target;
      mapRef.current?.setDestination(target.lat, target.lng, label);
      mapRef.current?.setDestDraggable(false);
      mapRef.current?.flyTo(target.lat, target.lng, 15);
      if (riderCurrentLocRef.current) {
        fetchRiderRoute(riderCurrentLocRef.current, target);
      } else {
        // GPS not ready yet — draw route on next tick
        routeTickRef.current = 4;
      }
    }
  }, [mapReady, requestAccepted, activeRide, rideStatus]);

  // Today stats
  const fetchTodayStats = async () => {
    const date = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('rides')
      .select('fare')
      .eq('rider_id', profile.id)
      .eq('status', 'completed')
      .gte('completed_at', `${date}T00:00:00.000Z`)
      .lte('completed_at', `${date}T23:59:59.999Z`);
    const rides = data ?? [];
    setTodayRides(rides.length);
    setTodayEarnings(rides.reduce((sum, r) => sum + (r.fare ?? 0), 0));
  };

  useEffect(() => { fetchTodayStats(); }, []);

  // Keep screen awake during active booking so rider can navigate
  useEffect(() => {
    if (requestAccepted) {
      KeepAwake.activateKeepAwakeAsync('rider-active-ride');
    } else {
      KeepAwake.deactivateKeepAwake('rider-active-ride');
    }
    return () => { KeepAwake.deactivateKeepAwake('rider-active-ride'); };
  }, [requestAccepted]);

  // Reset sheet to expanded when active ride state changes
  useEffect(() => { riderSheetY.setValue(0); }, [requestAccepted]);

  // Prevent Android back button from exiting app during active ride
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (requestAccepted) return true; // block back during active ride
      return false;
    });
    return () => handler.remove();
  }, [requestAccepted]);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(RIDER_RIDE_KEY);
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!saved.currentRequest?.rideId) { await AsyncStorage.removeItem(RIDER_RIDE_KEY); return; }
        const { data } = await supabase.from('rides').select('status').eq('id', saved.currentRequest.rideId).single();
        if (!data || ['completed', 'cancelled', 'pending'].includes(data.status)) {
          await AsyncStorage.removeItem(RIDER_RIDE_KEY);
          return;
        }
        setCurrentRequest(saved.currentRequest);
        setRequestAccepted(saved.requestAccepted ?? false);
        setActiveRide(saved.currentRequest);
        acceptedRideIdRef.current = saved.currentRequest.rideId;
        if (saved.rideStatus) setRideStatus(saved.rideStatus);
        wasRestoredRef.current = true;
      } catch {
        await AsyncStorage.removeItem(RIDER_RIDE_KEY);
      }
    })();
  }, []);

  useEffect(() => { currentRequestRef.current = currentRequest; }, [currentRequest]);

  // Rides channel — dep is only isOnline; use refs inside handlers to avoid channel churn
  useEffect(() => {
    if (!isOnline) return;
    const ch = supabase.channel('rides');

    ch.on('broadcast', { event: 'REQUEST_RIDE' }, ({ payload }) => {
      const declinedAt = declinedRidesRef.current.get(payload.rideId);
      if (declinedAt && Date.now() - declinedAt < 60000) return;
      setRequestQueue(prev => {
        if (prev.some((r: any) => r.rideId === payload.rideId)) return prev;
        return [...prev, payload];
      });
      // Only notify once per rideId — passenger broadcasts every 4s so we'd spam otherwise
      if (!notifiedRideIdsRef.current.has(payload.rideId)) {
        notifiedRideIdsRef.current.add(payload.rideId);
        const passengerName = [payload.user?.first_name, payload.user?.last_name].filter(Boolean).join(' ') || 'Passenger';
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'New Ride Request',
            body: `₱${payload.fare} · ${passengerName}`,
            sound: true,
            channelId: 'ride-requests',
          },
          trigger: null,
        });
      }
    });

    ch.on('broadcast', { event: 'CANCEL_RIDE' }, ({ payload }) => {
      const { rideId } = payload;
      setRequestQueue(prev => prev.filter(r => r.rideId !== rideId));
      if (acceptedRideIdRef.current === rideId) {
        acceptedRideIdRef.current = null;
        riderTargetRef.current = null;
        clearRiderRide();
        setRequestAccepted(false);
        setCurrentRequest(null);
        setActiveRide(null);
        setHasRequest(false);
        setMessages([]);
        setRideStatus('going_to_pickup');
        mapRef.current?.clearDestination();
        mapRef.current?.clearRoute();
      } else if (currentRequestRef.current?.rideId === rideId) {
        setHasRequest(false);
        setCurrentRequest(null);
      }
    });

    ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
      if (acceptedRideIdRef.current !== payload.rideId) {
        setRequestQueue(prev => prev.filter(r => r.rideId !== payload.rideId));
      }
    });

    ch.subscribe();
    ridesChannelRef.current = ch;
    return () => { ridesChannelRef.current = null; supabase.removeChannel(ch); };
  }, [isOnline]);

  // Errands channel
  useEffect(() => {
    if (!isOnline) return;
    const errandCh = supabase.channel('errands');
    errandCh.on('broadcast', { event: 'REQUEST_ERRAND' }, ({ payload }) => {
      if (hasErrand || activeErrand) return;
      setCurrentErrand(payload);
      setHasErrand(true);
      Notifications.scheduleNotificationAsync({
        content: { title: '📦 New Errand Request', body: `₱${payload.fare} · ${payload.description?.slice(0, 40)}`, sound: true, channelId: 'ride-requests' },
        trigger: null,
      });
    });
    errandCh.on('broadcast', { event: 'CANCEL_ERRAND' }, ({ payload }) => {
      if (currentErrand?.errandId === payload.errandId) { setHasErrand(false); setCurrentErrand(null); }
      if (activeErrandRef.current?.errandId === payload.errandId) {
        setActiveErrand(null); activeErrandRef.current = null; setErrandStatus('going_to_pickup');
        AsyncStorage.removeItem(RIDER_ERRAND_KEY);
        mapRef.current?.clearDestination(); mapRef.current?.clearRoute();
        riderTargetRef.current = null;
        Alert.alert('Errand Cancelled', 'The user cancelled the errand.');
      }
    });
    errandCh.subscribe();
    errandChannelRef.current = errandCh;
    return () => { errandChannelRef.current = null; supabase.removeChannel(errandCh); };
  }, [isOnline, hasErrand, activeErrand]);

  // Pop from queue
  useEffect(() => {
    if (requestQueue.length > 0 && !hasRequest && !requestAccepted) {
      setCurrentRequest(requestQueue[0]);
      setHasRequest(true);
      setRequestQueue(prev => prev.slice(1));
    }
  }, [requestQueue, hasRequest, requestAccepted]);

  // Repeat alert sound + vibration every 10s while request modal is visible
  useEffect(() => {
    if (!hasRequest || !currentRequest) {
      stopRideRequestAlert();
      return;
    }

    const passengerName = [currentRequest.user?.first_name, currentRequest.user?.last_name]
      .filter(Boolean).join(' ') || 'Passenger';
    const title = 'New Ride Request';
    const body = `₱${currentRequest.fare} · ${passengerName}`;

    // Immediate vibration (sound already played by the first notification in the broadcast handler)
    Vibration.vibrate([0, 400, 200, 400, 200, 400]);

    alertIntervalRef.current = setInterval(() => {
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, channelId: 'ride-requests' },
        trigger: null,
      }).then(id => alertNotifIdsRef.current.push(id)).catch(() => {});
    }, 10000);

    return () => stopRideRequestAlert();
  }, [hasRequest, currentRequest]);

  // Chat subscription when active ride
  useEffect(() => {
    if (!acceptedRideIdRef.current) return;
    const rideId = acceptedRideIdRef.current;
    fetchMessages(rideId).then(setMessages);
    const unsub = subscribeToMessages(rideId, (msg) => {
      if (msg.sender_id === profile.id) return;
      setMessages(prev => [...prev, msg]);
      if (!showChat) setUnreadCount(c => c + 1);
    });
    return unsub;
  }, [requestAccepted, showChat]);

  useEffect(() => {
    if (showChat) {
      setUnreadCount(0);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [showChat, messages]);

  const goOnlineWithVehicle = async (vehicle: RiderVehicle) => {
    setActiveVehicle(vehicle);
    // Sync selected vehicle to profiles so rest of app sees correct vehicle
    await supabase.from('profiles').update({
      vehicle_type: vehicle.vehicle_type,
      vehicle_make: vehicle.vehicle_make,
      vehicle_model: vehicle.vehicle_model,
      vehicle_plate: vehicle.vehicle_plate,
      vehicle_color: vehicle.vehicle_color,
      vehicle_image_url: vehicle.vehicle_image_url,
      is_online: true,
    }).eq('id', profile.id);
    await registerPushToken();
    isOnlineRef.current = true;
    setIsOnline(true);
  };

  const toggleOnline = async (value: boolean) => {
    if (!value) {
      // Going offline — straightforward
      isOnlineRef.current = false;
      setIsOnline(false);
      setHasRequest(false);
      setRequestQueue([]);
      setActiveVehicle(null);
      await unregisterPushToken();
      await supabase.from('profiles').update({ is_online: false }).eq('id', profile.id);
      return;
    }
    // Going online — need an approved vehicle
    if (approvedVehicles.length === 0) {
      Alert.alert('No Approved Vehicle', 'You need at least one approved vehicle before going online. Submit your vehicle for verification.');
      return;
    }
    if (approvedVehicles.length === 1) {
      // Auto-select the only vehicle
      await goOnlineWithVehicle(approvedVehicles[0]);
      return;
    }
    // Multiple vehicles — prompt selection
    pendingOnlineRef.current = true;
    setShowVehicleSelect(true);
  };

  const handleAccept = async () => {
    stopRideRequestAlert();
    notifiedRideIdsRef.current.clear();
    if (!currentRequest) return;
    const rideId = currentRequest.rideId;
    const { error } = await supabase.from('rides')
      .update({ status: 'accepted', rider_id: profile.id })
      .eq('id', rideId)
      .eq('status', 'pending');

    if (error) {
      setHasRequest(false);
      setCurrentRequest(null);
      return;
    }

    acceptedRideIdRef.current = rideId;
    setHasRequest(false);
    setRequestAccepted(true);
    setActiveRide(currentRequest);
    saveRiderRide(currentRequest, true);

    // Show pickup on map + draw route from rider to pickup
    const pickupCoords = currentRequest.pickup?.coords;
    if (pickupCoords) {
      riderTargetRef.current = pickupCoords;
      routeTickRef.current = 0;
      mapRef.current?.setDestination(pickupCoords.lat, pickupCoords.lng, '📍 Pickup: ' + (currentRequest.pickup?.label ?? 'Passenger Pickup'));
      mapRef.current?.setDestDraggable(false);
      mapRef.current?.flyTo(pickupCoords.lat, pickupCoords.lng, 15);
      if (riderCurrentLocRef.current) {
        fetchRiderRoute(riderCurrentLocRef.current, pickupCoords);
      }
    }

    const ch = ridesChannelRef.current ?? supabase.channel('rides');
    ch.send({
      type: 'broadcast', event: 'RIDE_ACCEPTED',
      payload: { rideId, rider: profile },
    });
  };

  const handleDecline = () => {
    stopRideRequestAlert();
    notifiedRideIdsRef.current.clear();
    const declined = currentRequest;
    setHasRequest(false);
    setCurrentRequest(null);
    if (declined?.rideId) {
      declinedRidesRef.current.set(declined.rideId, Date.now());
      setTimeout(() => {
        declinedRidesRef.current.delete(declined.rideId);
      }, 60000);
    }
  };

  const handleAcceptErrand = async () => {
    if (!currentErrand) return;
    const errandId = currentErrand.errandId;
    const riderName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    const { data: accepted, error } = await supabase.rpc('accept_errand', {
      p_errand_id: errandId,
      p_rider_name: riderName,
      p_rider_avatar: profile.avatar_url,
    });
    if (error || accepted !== true) {
      setHasErrand(false);
      setCurrentErrand(null);
      Alert.alert('Errand unavailable', 'This errand is no longer available.');
      return;
    }
    setHasErrand(false);
    setActiveErrand(currentErrand);
    activeErrandRef.current = currentErrand;
    setCurrentErrand(null);
    setErrandStatus('going_to_pickup');
    AsyncStorage.setItem(RIDER_ERRAND_KEY, JSON.stringify(currentErrand));
    const ch = errandChannelRef.current ?? supabase.channel('errands');
    ch.send({ type: 'broadcast', event: 'ERRAND_ACCEPTED', payload: { errandId, rider: profile } });
    // Navigate to pickup on map + draw route
    if (currentErrand.pickup?.coords) {
      riderTargetRef.current = currentErrand.pickup.coords;
      mapRef.current?.setDestination(currentErrand.pickup.coords.lat, currentErrand.pickup.coords.lng, '📍 ' + currentErrand.pickup.label);
      mapRef.current?.setDestDraggable(false);
      mapRef.current?.setPickupDraggable(false);
      mapRef.current?.flyTo(currentErrand.pickup.coords.lat, currentErrand.pickup.coords.lng, 15);
      if (riderCurrentLocRef.current) {
        fetchRiderRoute(riderCurrentLocRef.current, currentErrand.pickup.coords);
      }
    }
  };

  const handleDeclineErrand = () => {
    setHasErrand(false);
    setCurrentErrand(null);
  };

  const handleErrandPickedUp = async () => {
    if (!activeErrand) return;
    await supabase.from('errands').update({ status: 'picked_up' }).eq('id', activeErrand.errandId);
    setErrandStatus('going_to_dropoff');
    const ch = errandChannelRef.current ?? supabase.channel('errands');
    ch.send({ type: 'broadcast', event: 'ERRAND_PICKED_UP', payload: { errandId: activeErrand.errandId } });
    if (activeErrand.dropoff?.coords) {
      riderTargetRef.current = activeErrand.dropoff.coords;
      mapRef.current?.setDestination(activeErrand.dropoff.coords.lat, activeErrand.dropoff.coords.lng, '🏁 ' + activeErrand.dropoff.label);
      mapRef.current?.setDestDraggable(false);
      mapRef.current?.setPickupDraggable(false);
      mapRef.current?.flyTo(activeErrand.dropoff.coords.lat, activeErrand.dropoff.coords.lng, 15);
      if (riderCurrentLocRef.current) {
        fetchRiderRoute(riderCurrentLocRef.current, activeErrand.dropoff.coords);
      }
    }
  };

  const handleErrandCompleted = async () => {
    if (!activeErrand) return;
    await supabase.from('errands').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeErrand.errandId);
    const ch = errandChannelRef.current ?? supabase.channel('errands');
    ch.send({ type: 'broadcast', event: 'ERRAND_COMPLETED', payload: { errandId: activeErrand.errandId } });
    mapRef.current?.clearDestination();
    mapRef.current?.clearRoute();
    setActiveErrand(null);
    activeErrandRef.current = null;
    setErrandStatus('going_to_pickup');
    AsyncStorage.removeItem(RIDER_ERRAND_KEY);
  };

  const clearActiveErrand = async () => {
    mapRef.current?.clearDestination();
    mapRef.current?.clearRoute();
    riderTargetRef.current = null;
    setActiveErrand(null);
    activeErrandRef.current = null;
    setErrandStatus('going_to_pickup');
    await AsyncStorage.removeItem(RIDER_ERRAND_KEY);
  };

  const cancelErrandInSupabase = async (errandId: string) => {
    const { data: rpcData, error: rpcError } = await supabase.rpc('cancel_errand', { p_errand_id: errandId });
    if (!rpcError && rpcData !== false) return;

    const { error: functionError } = await supabase.functions.invoke('errand-cancel', {
      body: { errand_id: errandId },
    });
    if (!functionError) return;

    const { data: updated, error: updateError } = await supabase
      .from('errands')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', errandId)
      .eq('rider_id', profile.id)
      .select('id, status')
      .maybeSingle();

    if (updateError || !updated) {
      throw new Error(updateError?.message || functionError.message || rpcError?.message || 'Unable to cancel errand.');
    }
  };

  const handleCancelErrand = async () => {
    const errandId = activeErrandRef.current?.errandId ?? activeErrand?.errandId;
    if (!errandId || errandCanceling) return;

    setShowErrandCancelConfirm(false);
    setErrandCanceling(true);
    try {
      await cancelErrandInSupabase(errandId);
      const ch = errandChannelRef.current ?? supabase.channel('errands');
      await ch.send({ type: 'broadcast', event: 'CANCEL_ERRAND', payload: { errandId } }).catch(() => {});
      await clearActiveErrand();
    } catch (e: any) {
      Alert.alert('Cancel Failed', e?.message ?? 'Unable to cancel errand. Please try again.');
    } finally {
      setErrandCanceling(false);
    }
  };

  const confirmCancelErrand = () => {
    if (errandCanceling) return;
    setShowErrandCancelConfirm(true);
  };

  const handleCancelRide = () => {
    if (!acceptedRideIdRef.current) return;
    const rideId = acceptedRideIdRef.current;

    // Reset UI immediately — don't block on network
    acceptedRideIdRef.current = null;
    riderTargetRef.current = null;
    clearRiderRide();
    setShowCancelConfirm(false);
    setRequestAccepted(false);
    setActiveRide(null);
    setCurrentRequest(null);
    setMessages([]);
    setRideStatus('going_to_pickup');
    mapRef.current?.clearDestination();
    mapRef.current?.clearRoute();

    // Fire-and-forget network sync
    const ch = ridesChannelRef.current ?? supabase.channel('rides');
    ch.send({ type: 'broadcast', event: 'RIDE_CANCELLED', payload: { rideId, riderId: profile.id } });
    supabase.from('rides').update({ status: 'pending', rider_id: null }).eq('id', rideId);
  };

  const handleArrivedAtPickup = () => {
    if (!acceptedRideIdRef.current) return;
    const ch = ridesChannelRef.current ?? supabase.channel('rides');
    ch.send({
      type: 'broadcast', event: 'RIDER_ARRIVED',
      payload: { rideId: acceptedRideIdRef.current },
    });
    setRideStatus('picked_up');
    saveRiderRide(activeRide, true, 'picked_up');

    // Switch map to show dropoff + draw initial route + enable live route updates
    const dropoffCoords = activeRide?.dropoff?.coords;
    if (dropoffCoords) {
      riderTargetRef.current = dropoffCoords;
      routeTickRef.current = 0;
      mapRef.current?.clearDestination();
      mapRef.current?.setDestination(dropoffCoords.lat, dropoffCoords.lng, '🏁 Dropoff: ' + (activeRide?.dropoff?.label ?? 'Destination'));
      mapRef.current?.setDestDraggable(false);
      mapRef.current?.flyTo(dropoffCoords.lat, dropoffCoords.lng, 15);
      if (riderCurrentLocRef.current) {
        fetchRiderRoute(riderCurrentLocRef.current, dropoffCoords);
      }
    }
  };

  const handleCompleteRide = () => {
    if (!acceptedRideIdRef.current) return;
    const rideId = acceptedRideIdRef.current;

    // Reset UI immediately
    acceptedRideIdRef.current = null;
    clearRiderRide();
    setRequestAccepted(false);
    setActiveRide(null);
    setCurrentRequest(null);
    setMessages([]);
    setRideStatus('going_to_pickup');
    mapRef.current?.clearDestination();
    mapRef.current?.clearRoute();

    // Fire-and-forget network sync
    const ch = ridesChannelRef.current ?? supabase.channel('rides');
    ch.send({ type: 'broadcast', event: 'RIDE_COMPLETED', payload: { rideId, rider: profile } });
    supabase.from('rides').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', rideId);
    fetchTodayStats();
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !acceptedRideIdRef.current) return;
    setChatInput('');
    const rideId = acceptedRideIdRef.current;
    const tempMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      ride_id: rideId,
      sender_id: profile.id,
      sender_role: 'rider',
      sender_name: profile.first_name ?? 'Rider',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    await sendMessage(rideId, profile.id, 'rider', profile.first_name ?? 'Rider', text);
  };

  // ─── Chat overlay ───────────────────────────────────────────────────────────
  if (showChat) {
    return (
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setShowChat(false)} style={styles.chatBack}>
            <Text style={styles.chatBackText}>←</Text>
          </TouchableOpacity>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>
              {(activeRide?.user?.first_name?.[0] ?? 'U').toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.chatName}>{activeRide?.user?.first_name} {activeRide?.user?.last_name}</Text>
            <Text style={styles.chatRole}>Passenger</Text>
          </View>
        </View>
        <ScrollView
          ref={chatScrollRef}
          style={styles.chatMessages}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        >
          {messages.length === 0 && (
            <Text style={styles.chatEmpty}>No messages yet.</Text>
          )}
          {messages.map(m => {
            const isMe = m.sender_id === profile.id;
            return (
              <View key={m.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem]}>
                  <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                    {m.content}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !chatInput.trim() && styles.sendBtnDisabled]}
            onPress={handleSendChat}
            disabled={!chatInput.trim()}
          >
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  riderSheetSnapRef.current = requestAccepted ? SCREEN_HEIGHT * 0.45 : 180;

  return (
    <View style={styles.container}>
      <OsmMap ref={mapRef} style={styles.map} onMapReady={() => setMapReady(true)} />

      {/* Active ride sheet */}
      {requestAccepted && activeRide ? (
        <Animated.View style={[styles.activeSheet, { height: SCREEN_HEIGHT * 0.58, transform: [{ translateY: riderSheetY }] }]}>
          <View {...riderSheetPan.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.sectionLabel}>ACTIVE RIDE</Text>

          {/* Scrollable ride details */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Passenger */}
            <View style={styles.passengerCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {(activeRide.user?.first_name?.[0] ?? 'U').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>
                  {activeRide.user?.first_name} {activeRide.user?.last_name}
                </Text>
                <Text style={styles.fareText}>₱{activeRide.fare}</Text>
              </View>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { setShowChat(true); setUnreadCount(0); }}
              >
                <Text style={styles.actionBtnIcon}>💬</Text>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Route info */}
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={styles.dotBlack} />
                <View>
                  <Text style={styles.routeLabel}>PICKUP</Text>
                  <Text style={styles.routeValue}>{activeRide.pickup?.label ?? 'Current Location'}</Text>
                </View>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}>
                <View style={styles.dotGreen} />
                <View>
                  <Text style={styles.routeLabel}>DROPOFF</Text>
                  <Text style={styles.routeValue}>{activeRide.dropoff?.label ?? activeRide.dropoff_label}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Actions — always visible at bottom */}
          {rideStatus === 'going_to_pickup' ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleArrivedAtPickup}>
              <Text style={styles.primaryBtnText}>I Arrived at Pickup</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#10b981' }]} onPress={handleCompleteRide}>
              <Text style={styles.primaryBtnText}>Complete Ride ✓</Text>
            </TouchableOpacity>
          )}

          {showCancelConfirm ? (
            <View style={styles.cancelConfirmRow}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowCancelConfirm(false)}>
                <Text style={styles.keepBtnText}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yesCancelBtn} onPress={handleCancelRide}>
                <Text style={styles.yesCancelText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cancelRideBtn} onPress={() => setShowCancelConfirm(true)}>
              <Text style={styles.cancelRideBtnText}>Cancel Booking</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      ) : (
        /* Default rider sheet */
        <Animated.View style={[styles.sheet, { maxHeight: SCREEN_HEIGHT * 0.55, transform: [{ translateY: riderSheetY }] }]}>
          <View {...riderSheetPan.panHandlers}>
            <View style={styles.handle} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={styles.riderRow}>
            <View style={styles.driverAvatarPro}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.driverAvatarImg} />
              ) : (
                <Text style={[styles.driverAvatarProText, { fontSize: fs(20) }]}>
                  {(profile.first_name?.[0] ?? 'R').toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverName, { fontSize: fs(15) }]} numberOfLines={1}>
                {profile.first_name} {profile.last_name}
              </Text>
              <Text style={[styles.driverMeta, { fontSize: fs(12) }]} numberOfLines={1}>
                {[profile.vehicle_make, profile.vehicle_model, profile.vehicle_plate].filter(Boolean).join(' · ') || 'No vehicle info'}
              </Text>
            </View>
          </View>

          {!activeErrand && (
            <>
              <View style={styles.onlineCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.onlineDot, isOnline && styles.onlineDotActive]} />
                  <View>
                    <Text style={styles.onlineLabel}>{isOnline ? 'You are Online' : 'You are Offline'}</Text>
                    <Text style={styles.onlineSub}>
                      {isOnline && activeVehicle
                        ? `${activeVehicle.vehicle_type} · ${activeVehicle.vehicle_plate ?? 'No plate'}`
                        : isOnline ? 'Accepting ride requests' : 'Go online to accept rides'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isOnline}
                  onValueChange={toggleOnline}
                  trackColor={{ false: '#e5e7eb', true: '#030712' }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>STATUS</Text>
                  <Text style={[styles.statValue, { color: isOnline ? '#10b981' : '#9ca3af' }]}>
                    {isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
                <View style={[styles.statCard, { marginHorizontal: 8 }]}>
                  <Text style={styles.statLabel}>TODAY</Text>
                  <Text style={styles.statValue}>₱{todayEarnings.toFixed(0)}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>RIDES</Text>
                  <Text style={styles.statValue}>{todayRides}</Text>
                </View>
              </View>
            </>
          )}

          {/* Active errand indicator */}
          {activeErrand && errandStatus === 'going_to_pickup' && (
            <View style={styles.activeErrandCard}>
              {/* Status badge */}
              <View style={styles.activeErrandStatusRow}>
                <View style={styles.activeErrandStatusDot} />
                <Text style={styles.activeErrandStatusText}>On the way to pickup</Text>
                {activeErrand.fare ? (
                  <View style={styles.activeErrandFareChip}>
                    <Text style={styles.activeErrandFareChipText}>₱{activeErrand.fare}</Text>
                  </View>
                ) : null}
              </View>

              {/* Requester */}
              <View style={styles.activeErrandUserRow}>
                <View style={styles.activeErrandUserAvatar}>
                  {activeErrand.user?.avatar_url ? (
                    <Image source={{ uri: activeErrand.user.avatar_url }} style={styles.activeErrandUserAvatarImg} />
                  ) : (
                    <Text style={styles.activeErrandUserAvatarText}>
                      {(activeErrand.user?.first_name?.[0] ?? 'U').toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeErrandUserLabel}>REQUESTED BY</Text>
                  <Text style={styles.activeErrandUserName}>
                    {activeErrand.user?.first_name} {activeErrand.user?.last_name}
                  </Text>
                  {activeErrand.user?.phone ? (
                    <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>📞 {activeErrand.user.phone}</Text>
                  ) : null}
                </View>
                {activeErrand.errand_type ? (
                  <View style={styles.activeErrandTypePill}>
                    <Text style={styles.activeErrandTypePillText}>
                      {activeErrand.errand_type === 'buy' ? '🛍️ Buy' : activeErrand.errand_type === 'pickup_deliver' ? '📦 P&D' : '📋 Other'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Task description */}
              {activeErrand.description ? (
                <View style={styles.activeErrandDescCard}>
                  <Text style={styles.activeErrandDescText} numberOfLines={2}>{activeErrand.description}</Text>
                </View>
              ) : null}

              {/* Pickup location */}
              <View style={styles.activeErrandLocCard}>
                <View style={styles.activeErrandLocRow}>
                  <View style={styles.activeErrandDotBlack} />
                  <Text style={styles.activeErrandLocVal} numberOfLines={2}>{activeErrand.pickup?.label}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.errandStatusBtn} onPress={handleErrandPickedUp}>
                <Text style={styles.errandStatusBtnText}>✓ Mark Picked Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.riderErrandCancelBtn, errandCanceling && styles.disabledBtn]}
                disabled={errandCanceling}
                onPress={confirmCancelErrand}
              >
                <Text style={styles.riderErrandCancelBtnText}>{errandCanceling ? 'Cancelling...' : 'Cancel Errand'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {activeErrand && errandStatus === 'going_to_dropoff' && (
            <View style={[styles.activeErrandCard, { borderColor: '#10b981' }]}>
              {/* Status badge */}
              <View style={styles.activeErrandStatusRow}>
                <View style={[styles.activeErrandStatusDot, { backgroundColor: '#10b981' }]} />
                <Text style={[styles.activeErrandStatusText, { color: '#10b981' }]}>Delivering item</Text>
                {activeErrand.fare ? (
                  <View style={[styles.activeErrandFareChip, { backgroundColor: '#10b981' }]}>
                    <Text style={styles.activeErrandFareChipText}>₱{activeErrand.fare}</Text>
                  </View>
                ) : null}
              </View>

              {/* Requester */}
              <View style={styles.activeErrandUserRow}>
                <View style={styles.activeErrandUserAvatar}>
                  {activeErrand.user?.avatar_url ? (
                    <Image source={{ uri: activeErrand.user.avatar_url }} style={styles.activeErrandUserAvatarImg} />
                  ) : (
                    <Text style={styles.activeErrandUserAvatarText}>
                      {(activeErrand.user?.first_name?.[0] ?? 'U').toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeErrandUserLabel}>REQUESTED BY</Text>
                  <Text style={styles.activeErrandUserName}>
                    {activeErrand.user?.first_name} {activeErrand.user?.last_name}
                  </Text>
                  {activeErrand.user?.phone ? (
                    <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>📞 {activeErrand.user.phone}</Text>
                  ) : null}
                </View>
              </View>

              {/* Task description */}
              {activeErrand.description ? (
                <View style={styles.activeErrandDescCard}>
                  <Text style={styles.activeErrandDescText} numberOfLines={2}>{activeErrand.description}</Text>
                </View>
              ) : null}

              {/* Recipient */}
              {activeErrand.recipient_name ? (
                <View style={styles.activeErrandRecipientRow}>
                  <Text style={styles.activeErrandRecipientText}>👤 {activeErrand.recipient_name}</Text>
                  {activeErrand.recipient_phone ? <Text style={styles.activeErrandRecipientPhone}>{activeErrand.recipient_phone}</Text> : null}
                </View>
              ) : null}

              {/* Dropoff location */}
              <View style={styles.activeErrandLocCard}>
                <View style={styles.activeErrandLocRow}>
                  <View style={styles.activeErrandDotGreen} />
                  <Text style={styles.activeErrandLocVal} numberOfLines={2}>{activeErrand.dropoff?.label}</Text>
                </View>
              </View>

              <TouchableOpacity style={[styles.errandStatusBtn, { backgroundColor: '#10b981' }]} onPress={handleErrandCompleted}>
                <Text style={styles.errandStatusBtnText}>✓ Mark Delivered / Completed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.riderErrandCancelBtn, errandCanceling && styles.disabledBtn]}
                disabled={errandCanceling}
                onPress={confirmCancelErrand}
              >
                <Text style={styles.riderErrandCancelBtnText}>{errandCanceling ? 'Cancelling...' : 'Cancel Errand'}</Text>
              </TouchableOpacity>
            </View>
          )}


          {!isOnline && !activeErrand && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>Toggle online to start receiving ride requests.</Text>
            </View>
          )}

          </ScrollView>
        </Animated.View>
      )}

      {/* Profile button — top right */}
      <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfileMenu(true)} activeOpacity={0.85}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.profileBtnImg} />
        ) : (
          <Text style={styles.profileBtnText}>{(profile.first_name?.[0] ?? 'R').toUpperCase()}</Text>
        )}
      </TouchableOpacity>

      {/* Errand request modal — slides up from bottom */}
      <Modal visible={hasErrand && !!currentErrand && !requestAccepted && !activeErrand} transparent animationType="slide" onRequestClose={handleDeclineErrand}>
        <View style={styles.errandModalOverlay}>
          <View style={styles.errandModalSheet}>
            <View style={styles.errandModalHandle} />

            {/* Header: label + fare */}
            <View style={styles.errandModalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.errandModalLabel}>📦 ERRAND REQUEST</Text>
                <View style={styles.errandTypeRow}>
                  <View style={styles.errandTypePill}>
                    <Text style={styles.errandTypePillText}>
                      {currentErrand?.errand_type === 'buy' ? '🛍️ Buy' : currentErrand?.errand_type === 'pickup_deliver' ? '📦 Pickup & Deliver' : '📋 Other'}
                    </Text>
                  </View>
                  <View style={styles.errandTypePill}>
                    <Text style={styles.errandTypePillText}>{currentErrand?.vehicle_type === 'moto' ? '🏍️ Moto' : '🛺 Tricycle'}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.errandModalFare}>₱{currentErrand?.fare}</Text>
            </View>

            {/* Requester card */}
            <View style={styles.errandRequesterCard}>
              <View style={styles.errandRequesterAvatar}>
                {currentErrand?.user?.avatar_url ? (
                  <Image source={{ uri: currentErrand.user.avatar_url }} style={styles.errandRequesterAvatarImg} />
                ) : (
                  <Text style={styles.errandRequesterAvatarText}>
                    {(currentErrand?.user?.first_name?.[0] ?? 'U').toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.errandRequesterLabel}>REQUESTED BY</Text>
                <Text style={styles.errandRequesterName}>
                  {currentErrand?.user?.first_name} {currentErrand?.user?.last_name}
                </Text>
                {currentErrand?.user?.phone ? (
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>📞 {currentErrand.user.phone}</Text>
                ) : null}
              </View>
              <View style={styles.errandUserBadge}>
                <Text style={styles.errandUserBadgeText}>User</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              {/* Route card */}
              <View style={styles.errandRouteCard}>
                <View style={styles.errandRouteRow}>
                  <View style={styles.errandRouteDotBlack} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.errandRouteLabel}>PICKUP</Text>
                    <Text style={styles.errandRouteVal} numberOfLines={2}>{currentErrand?.pickup?.label}</Text>
                  </View>
                </View>
                <View style={styles.errandRouteConnector} />
                <View style={styles.errandRouteRow}>
                  <View style={styles.errandRouteDotGreen} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.errandRouteLabel}>DROPOFF</Text>
                    <Text style={styles.errandRouteVal} numberOfLines={2}>{currentErrand?.dropoff?.label}</Text>
                  </View>
                </View>
              </View>

              {/* Task description */}
              {currentErrand?.description ? (
                <View style={styles.errandTaskCard}>
                  <Text style={styles.errandTaskLabel}>TASK</Text>
                  <Text style={styles.errandTaskText}>{currentErrand.description}</Text>
                </View>
              ) : null}
              {currentErrand?.instructions ? (
                <Text style={styles.errandInstructions}>📝 {currentErrand.instructions}</Text>
              ) : null}
              {currentErrand?.recipient_name ? (
                <Text style={styles.errandRecipient}>👤 {currentErrand.recipient_name} · {currentErrand.recipient_phone}</Text>
              ) : null}
            </ScrollView>

            {/* Action buttons */}
            <View style={styles.errandBtnRow}>
              <TouchableOpacity style={styles.errandDeclineBtn} onPress={handleDeclineErrand}>
                <Text style={styles.errandDeclineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.errandAcceptBtn} onPress={handleAcceptErrand}>
                <Text style={styles.errandAcceptBtnText}>Accept ₱{currentErrand?.fare}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Errand cancel confirmation */}
      <Modal
        visible={showErrandCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrandCancelConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Cancel Errand?</Text>
            <Text style={styles.confirmMessage}>Are you sure you want to cancel this errand?</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmNoBtn}
                disabled={errandCanceling}
                onPress={() => setShowErrandCancelConfirm(false)}
              >
                <Text style={styles.confirmNoText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmYesBtn, errandCanceling && styles.disabledBtn]}
                disabled={errandCanceling}
                onPress={handleCancelErrand}
              >
                <Text style={styles.confirmYesText}>{errandCanceling ? 'Cancelling...' : 'Yes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Vehicle selection modal */}
      <Modal visible={showVehicleSelect} transparent animationType="slide" onRequestClose={() => { setShowVehicleSelect(false); pendingOnlineRef.current = false; }}>
        <View style={styles.vsOverlay}>
          <View style={styles.vsSheet}>
            <Text style={styles.vsTitle}>Select Vehicle</Text>
            <Text style={styles.vsSub}>Choose which vehicle you're using today</Text>
            {approvedVehicles.map(v => (
              <TouchableOpacity
                key={v.id}
                style={styles.vsItem}
                onPress={async () => {
                  setShowVehicleSelect(false);
                  pendingOnlineRef.current = false;
                  await goOnlineWithVehicle(v);
                }}
              >
                <View style={styles.vsItemLeft}>
                  <Text style={styles.vsItemEmoji}>
                    {v.vehicle_type === 'Tricycle' ? '🛺' : v.vehicle_type === 'Car' ? '🚕' : v.vehicle_type === 'Van' ? '🚐' : '🏍️'}
                  </Text>
                  <View>
                    <Text style={styles.vsItemType}>{v.vehicle_type}</Text>
                    <Text style={styles.vsItemDetail}>
                      {[v.vehicle_make, v.vehicle_model].filter(Boolean).join(' ')}
                      {v.vehicle_plate ? ` · ${v.vehicle_plate}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.vsItemNum}>
                  {['', '1st', '2nd', '3rd', '4th', '5th'][v.vehicle_number] ?? `#${v.vehicle_number}`}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.vsCancelBtn} onPress={() => { setShowVehicleSelect(false); pendingOnlineRef.current = false; }}>
              <Text style={styles.vsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Profile menu modal */}
      <Modal visible={showProfileMenu} transparent animationType="fade" onRequestClose={() => setShowProfileMenu(false)}>
        <TouchableOpacity style={styles.profileMenuOverlay} activeOpacity={1} onPress={() => setShowProfileMenu(false)}>
          <View style={styles.profileMenuCard}>
            <View style={styles.profileMenuAvatar}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.profileMenuAvatarImg} />
              ) : (
                <Text style={styles.profileMenuAvatarText}>{(profile.first_name?.[0] ?? 'R').toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.profileMenuName}>{profile.first_name} {profile.last_name}</Text>
            <Text style={styles.profileMenuEmail}>{profile.email}</Text>
            <View style={styles.profileMenuDivider} />
            <TouchableOpacity
              style={styles.profileMenuSignOut}
              onPress={() => { setShowProfileMenu(false); clearRiderRide(); unregisterPushToken(); onSignOut(); }}
            >
              <Text style={styles.profileMenuSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Incoming request modal */}
      <Modal visible={hasRequest && !!currentRequest} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            <Text style={styles.sectionLabel}>INCOMING RIDE</Text>

            {/* Passenger info */}
            <View style={styles.passengerCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {(currentRequest?.user?.first_name?.[0] ?? 'U').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>
                  {currentRequest?.user?.first_name} {currentRequest?.user?.last_name}
                </Text>
                <Text style={styles.fareText}>₱{currentRequest?.fare}</Text>
              </View>
            </View>

            {/* Route */}
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={styles.dotBlack} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>PICKUP</Text>
                  <Text style={styles.routeValue} numberOfLines={2}>
                    {currentRequest?.pickup?.label}
                  </Text>
                </View>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}>
                <View style={styles.dotGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeLabel}>DROPOFF</Text>
                  <Text style={styles.routeValue} numberOfLines={2}>
                    {currentRequest?.dropoff?.label}
                  </Text>
                </View>
              </View>
              {currentRequest?.routeDistance > 0 && (
                <Text style={styles.distanceText}>
                  {(currentRequest.routeDistance / 1000).toFixed(1)} km
                </Text>
              )}
            </View>

            {/* Ride type */}
            <View style={styles.rideTypeBadge}>
              <Text style={styles.rideTypeText}>
                {currentRequest?.ride_type === 'moto' ? '🏍️ Motorcycle' :
                  currentRequest?.ride_type === 'eco' ? '🚕 Standard Car' : '🚙 Premium'}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    shadowOffset: { width: 0, height: -1 }, elevation: 16,
  },
  activeSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 36, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20,
    shadowOffset: { width: 0, height: -1 }, elevation: 16,
  },
  handle: { width: 40, height: 5, backgroundColor: '#e5e7eb', borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 12 },

  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  driverAvatar: { width: 48, height: 48, borderRadius: 99, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  driverAvatarText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  driverAvatarPro: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  driverAvatarImg: { width: 48, height: 48, borderRadius: 14 },
  driverAvatarProText: { fontWeight: '700', color: '#fff' },
  driverName: { fontWeight: '700', color: '#030712' },
  driverMeta: { color: '#9ca3af', marginTop: 1 },
  profileBtn: {
    position: 'absolute', top: 52, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
    overflow: 'hidden',
  },
  profileBtnImg: { width: 44, height: 44, borderRadius: 22 },
  profileBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  profileMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'flex-end', paddingTop: 100, paddingRight: 16 },
  profileMenuCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: 220, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    alignItems: 'center',
  },
  profileMenuAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
  profileMenuAvatarImg: { width: 64, height: 64, borderRadius: 32 },
  profileMenuAvatarText: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileMenuName: { fontSize: 15, fontWeight: '700', color: '#030712', textAlign: 'center' },
  profileMenuEmail: { fontSize: 12, color: '#9ca3af', marginTop: 2, textAlign: 'center' },
  profileMenuDivider: { height: 1, backgroundColor: '#f3f4f6', width: '100%', marginVertical: 14 },
  profileMenuSignOut: { backgroundColor: '#fef2f2', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 28 },
  profileMenuSignOutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  fareText: { fontSize: 15, fontWeight: '700', color: '#10b981', marginTop: 2 },

  onlineCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f9fafb', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 12,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#d1d5db' },
  onlineDotActive: { backgroundColor: '#10b981' },
  onlineLabel: { fontSize: 14, fontWeight: '600', color: '#030712' },
  onlineSub: { fontSize: 11, color: '#9ca3af', marginTop: 1 },

  // Errand request modal
  errandModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  errandModalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  errandModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 18 },
  errandModalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  errandModalLabel: { fontSize: 10, fontWeight: '800', color: '#10b981', letterSpacing: 1.5, marginBottom: 8 },
  errandModalFare: { fontSize: 28, fontWeight: '800', color: '#030712' },
  errandTypeRow: { flexDirection: 'row', gap: 6, marginBottom: 0 },
  errandTypePill: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  errandTypePillText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  // Requester card
  errandRequesterCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 16, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  errandRequesterAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  errandRequesterAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  errandRequesterAvatarText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  errandRequesterLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.2, marginBottom: 2 },
  errandRequesterName: { fontSize: 14, fontWeight: '700', color: '#030712' },
  errandUserBadge: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  errandUserBadgeText: { fontSize: 10, fontWeight: '700', color: '#3b82f6' },

  // Route card inside modal
  errandRouteCard: { backgroundColor: '#f9fafb', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  errandRouteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  errandRouteDotBlack: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#030712', marginTop: 4 },
  errandRouteDotGreen: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#10b981', marginTop: 4 },
  errandRouteConnector: { width: 1, height: 14, backgroundColor: '#e5e7eb', marginLeft: 3, marginVertical: 3 },
  errandRouteLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1 },
  errandRouteVal: { fontSize: 13, fontWeight: '600', color: '#030712', marginTop: 1 },

  // Task card
  errandTaskCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#d1fae5' },
  errandTaskLabel: { fontSize: 9, fontWeight: '700', color: '#10b981', letterSpacing: 1.2, marginBottom: 3 },
  errandTaskText: { fontSize: 12, color: '#374151', lineHeight: 18 },

  // Legacy kept for active errand cards
  errandRequestCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 2, borderColor: '#10b981' },
  errandRequestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  errandRequestBadge: { fontSize: 11, fontWeight: '700', color: '#10b981' },
  errandRequestFare: { fontSize: 18, fontWeight: '800', color: '#030712' },
  errandTypeBadge: { fontSize: 10, fontWeight: '600', color: '#374151', backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  errandVehicleBadge: { fontSize: 10, fontWeight: '600', color: '#374151', backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  errandLocRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  errandLocLabel: { fontSize: 11, color: '#9ca3af', width: 18 },
  errandLocVal: { flex: 1, fontSize: 12, color: '#030712', fontWeight: '500' },
  errandDesc: { fontSize: 12, color: '#374151', marginTop: 4, marginBottom: 2, fontStyle: 'italic' },
  errandInstructions: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  errandRecipient: { fontSize: 11, color: '#6b7280', marginBottom: 6 },
  errandBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  errandDeclineBtn: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb' },
  errandDeclineBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  errandAcceptBtn: { flex: 2, backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  errandAcceptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  activeErrandCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#bbf7d0', shadowColor: '#10b981', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },

  // Status row
  activeErrandStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  activeErrandStatusDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#f59e0b' },
  activeErrandStatusText: { fontSize: 11, fontWeight: '700', color: '#f59e0b', letterSpacing: 0.5, flex: 1 },
  activeErrandFareChip: { backgroundColor: '#030712', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  activeErrandFareChipText: { fontSize: 12, fontWeight: '800', color: '#10b981' },

  // User row
  activeErrandUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  activeErrandUserAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  activeErrandUserAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  activeErrandUserAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  activeErrandUserLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.2, marginBottom: 1 },
  activeErrandUserName: { fontSize: 13, fontWeight: '700', color: '#030712' },
  activeErrandTypePill: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#d1fae5' },
  activeErrandTypePillText: { fontSize: 10, fontWeight: '600', color: '#10b981' },

  // Description
  activeErrandDescCard: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  activeErrandDescText: { fontSize: 12, color: '#374151', lineHeight: 18 },

  // Location
  activeErrandLocCard: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  activeErrandLocRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  activeErrandDotBlack: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#030712', marginTop: 3 },
  activeErrandDotGreen: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#10b981', marginTop: 3 },
  activeErrandLocVal: { flex: 1, fontSize: 12, fontWeight: '600', color: '#030712', lineHeight: 18 },

  // Recipient
  activeErrandRecipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  activeErrandRecipientText: { fontSize: 12, fontWeight: '600', color: '#374151', flex: 1 },
  activeErrandRecipientPhone: { fontSize: 11, color: '#9ca3af' },

  // Legacy kept for reference
  activeErrandTitle: { fontSize: 13, fontWeight: '700', color: '#10b981', marginBottom: 4 },
  activeErrandDesc: { fontSize: 12, color: '#374151', fontStyle: 'italic', marginBottom: 4 },
  activeErrandFare: { fontSize: 14, fontWeight: '700', color: '#030712', marginTop: 2, marginBottom: 8 },
  errandStatusBtn: { backgroundColor: '#030712', borderRadius: 12, paddingVertical: 13, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 },
  errandStatusBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  riderErrandCancelBtn: { alignSelf: 'center', marginTop: 8, paddingVertical: 4, paddingHorizontal: 12 },
  riderErrandCancelBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  disabledBtn: { opacity: 0.55 },

  // Confirmation modal
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#030712', textAlign: 'center', marginBottom: 8 },
  confirmMessage: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmNoBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f3f4f6' },
  confirmNoText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmYesBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmYesText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Vehicle select modal
  vsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  vsSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  vsTitle: { fontSize: 18, fontWeight: '800', color: '#030712', marginBottom: 4 },
  vsSub: { fontSize: 13, color: '#9ca3af', marginBottom: 20 },
  vsItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  vsItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsItemEmoji: { fontSize: 28 },
  vsItemType: { fontSize: 15, fontWeight: '700', color: '#030712' },
  vsItemDetail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  vsItemNum: { fontSize: 11, fontWeight: '700', color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  vsCancelBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  vsCancelText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },

  statsRow: { flexDirection: 'row', marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '600', color: '#9ca3af', letterSpacing: 1, marginBottom: 4 },
  statValue: { fontSize: 17, fontWeight: '700', color: '#030712' },

  offlineBanner: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#fde68a' },
  offlineText: { fontSize: 12, color: '#92400e', fontWeight: '500' },

  signOut: { alignItems: 'center', marginTop: 12 },
  signOutText: { fontSize: 12, color: '#d1d5db' },

  // Active ride
  passengerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 10, gap: 12 },
  actionBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  actionBtnIcon: { fontSize: 16 },
  badge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 99, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  routeCard: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dotBlack: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#030712', marginTop: 4 },
  dotGreen: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#10b981', marginTop: 4 },
  routeLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1 },
  routeValue: { fontSize: 13, fontWeight: '600', color: '#030712', marginTop: 1 },
  routeDivider: { height: 16, width: 1, backgroundColor: '#e5e7eb', marginLeft: 3, marginVertical: 4 },
  distanceText: { fontSize: 11, color: '#9ca3af', marginTop: 8 },

  primaryBtn: { backgroundColor: '#030712', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelRideBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelConfirmRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  keepBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  keepBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  yesCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#fef2f2', alignItems: 'center' },
  yesCancelText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  cancelRideBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  rideTypeBadge: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 10, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  rideTypeText: { fontSize: 14, fontWeight: '600', color: '#030712' },
  actionRow: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  declineBtnText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  acceptBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#030712', alignItems: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  // Chat
  chatContainer: { flex: 1, backgroundColor: '#fff' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  chatBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chatBackText: { fontSize: 20, color: '#030712' },
  chatAvatar: { width: 36, height: 36, borderRadius: 99, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  chatName: { fontSize: 14, fontWeight: '700', color: '#030712' },
  chatRole: { fontSize: 10, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5 },
  chatMessages: { flex: 1, backgroundColor: '#f6f7f9' },
  chatEmpty: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 32 },
  msgRow: { flexDirection: 'row', marginBottom: 6 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  msgBubbleMe: { backgroundColor: '#10b981' },
  msgBubbleThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6' },
  msgText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextThem: { color: '#111827' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  chatInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 99, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
