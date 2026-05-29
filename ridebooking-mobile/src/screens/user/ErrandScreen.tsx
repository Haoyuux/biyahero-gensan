import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal,
  ScrollView, Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, Image,
  Animated, PanResponder, useWindowDimensions,
} from 'react-native';
import * as Location from 'expo-location';
import OsmMap, { OsmMapHandle } from '../../components/OsmMap';
import { supabase } from '../../lib/supabase';
import { calculateErrandFare, ErrandFareBreakdown, loadPricingConfigFromDB, PricingConfig, DEFAULT_PRICING } from '../../lib/fareService';
import { fetchUserVouchers, quoteVoucher, markVoucherUsed, UserVoucher } from '../../lib/voucherService';
import { sendErrandRequestToTelegram } from '../../lib/telegramService';
import { useProfile } from '../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, fetchMessages, sendMessage, subscribeToMessages } from '../../lib/chatService';

const genUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'en', 'User-Agent': 'BiyaheroApp/1.0 (com.biyahero.app)' } });
    const data = await res.json();
    const parts = [data.address?.road, data.address?.suburb, data.address?.city || data.address?.town].filter(Boolean);
    return parts.slice(0, 2).join(', ') || data.display_name?.split(',').slice(0, 2).join(', ') || 'Selected location';
  } catch { return 'Selected location'; }
}

type ErrandType = 'buy' | 'pickup_deliver' | 'other';
type VehicleType = 'moto' | 'tricycle';
type ErrandStep = 'type' | 'location' | 'details' | 'vehicle' | 'confirm' | 'searching' | 'matched' | 'picked_up';

const ERRAND_TYPES: { id: ErrandType; label: string; emoji: string; desc: string }[] = [
  { id: 'buy', label: 'Buy Something', emoji: '🛍️', desc: 'Rider buys items for you' },
  { id: 'pickup_deliver', label: 'Pick Up & Deliver', emoji: '📦', desc: 'Rider picks up and delivers an item' },
  { id: 'other', label: 'Other', emoji: '📋', desc: 'Any other errand task' },
];

const VEHICLES: { id: VehicleType; label: string; emoji: string; capacity: string }[] = [
  { id: 'moto', label: 'Motorcycle', emoji: '🏍️', capacity: 'Small items' },
  { id: 'tricycle', label: 'Tricycle', emoji: '🛺', capacity: 'Bigger items' },
];

const ERRAND_KEY = 'biyahero_active_errand';

export default function ErrandScreen({ onClose }: { onClose: () => void }) {
  const { profile } = useProfile();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();

  // Draggable bottom sheet for matched/picked_up step
  const sheetY = useRef(new Animated.Value(0)).current;
  const sheetSnapRef = useRef(0);
  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        sheetY.setValue(Math.max(0, Math.min(sheetSnapRef.current, gs.dy)));
      },
      onPanResponderRelease: (_, gs) => {
        const snap = sheetSnapRef.current;
        const shouldCollapse = gs.dy > snap * 0.3 || gs.vy > 0.5;
        Animated.spring(sheetY, {
          toValue: shouldCollapse ? snap : 0,
          useNativeDriver: true,
          tension: 120,
          friction: 14,
        }).start();
      },
    })
  ).current;
  const [step, setStep] = useState<ErrandStep>('type');
  const [errandType, setErrandType] = useState<ErrandType | null>(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [dropoffLabel, setDropoffLabel] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeDistance, setRouteDistance] = useState(0);
  const [pickupSugg, setPickupSugg] = useState<any[]>([]);
  const [dropoffSugg, setDropoffSugg] = useState<any[]>([]);
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff' | null>(null);
  // Map
  const errandMapRef = useRef<OsmMapHandle>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeLocType, setActiveLocType] = useState<'pickup' | 'dropoff'>('pickup');
  const [locatingMe, setLocatingMe] = useState(false);
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('moto');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [fareBreakdown, setFareBreakdown] = useState<ErrandFareBreakdown | null>(null);
  const [userVouchers, setUserVouchers] = useState<UserVoucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [booking, setBooking] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [currentErrandId, setCurrentErrandId] = useState<string | null>(null);
  const currentErrandIdRef = useRef<string | null>(null);
  const [restoredFare, setRestoredFare] = useState(0);
  const [matchedRider, setMatchedRider] = useState<any>(null);
  const [matchedMapReady, setMatchedMapReady] = useState(false);
  const matchedMapRef = useRef<OsmMapHandle>(null);
  const broadcastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const broadcastPayloadRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const riderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  // Refs so closures (channel handlers) always see current values without re-subscribing
  const stepRef = useRef<ErrandStep>('type');
  const pickupCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const dropoffCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRiderPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRiderRouteTimeRef = useRef<number>(0);
  const matchedMapReadyRef = useRef(false);

  useEffect(() => { stepRef.current = step; sheetY.setValue(0); }, [step]);
  useEffect(() => { pickupCoordsRef.current = pickupCoords; }, [pickupCoords]);
  useEffect(() => { dropoffCoordsRef.current = dropoffCoords; }, [dropoffCoords]);

  // Draw route from rider's current position to pickup (matched) or dropoff (picked_up)
  const drawRiderRoute = useCallback(async (riderLat: number, riderLng: number, forceImmediate = false) => {
    const now = Date.now();
    if (!forceImmediate && now - lastRiderRouteTimeRef.current < 4000) return;
    lastRiderRouteTimeRef.current = now;
    const target = stepRef.current === 'picked_up' ? dropoffCoordsRef.current : pickupCoordsRef.current;
    if (!target) return;
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${riderLng},${riderLat};${target.lng},${target.lat}?overview=full&geometries=geojson&alternatives=3`
      );
      const data = await res.json();
      if (!data.routes?.[0]) return;
      const route = data.routes.reduce((best: any, r: any) => r.distance < best.distance ? r : best, data.routes[0]);
      const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
      matchedMapRef.current?.drawRoute(coords);
    } catch { /* silent */ }
  }, []);

  // When step flips to picked_up, immediately reroute from rider to dropoff
  useEffect(() => {
    if ((step === 'matched' || step === 'picked_up') && lastRiderPosRef.current) {
      lastRiderRouteTimeRef.current = 0;
      drawRiderRoute(lastRiderPosRef.current.lat, lastRiderPosRef.current.lng, true);
    }
  }, [step, drawRiderRoute]);

  // Poll rider's last_lat/last_lng from DB — reliable fallback when broadcast is missed
  useEffect(() => {
    if ((step !== 'matched' && step !== 'picked_up') || !matchedRider?.id) return;
    const riderId = matchedRider.id;
    const poll = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('last_lat, last_lng')
        .eq('id', riderId)
        .single();
      if (!data?.last_lat || !data?.last_lng) return;
      const { last_lat: lat, last_lng: lng } = data;
      const last = lastRiderPosRef.current;
      if (last && Math.abs(last.lat - lat) < 0.000005 && Math.abs(last.lng - lng) < 0.000005) return;
      const isFirst = !lastRiderPosRef.current;
      lastRiderPosRef.current = { lat, lng };
      if (matchedMapReadyRef.current) {
        matchedMapRef.current?.setRiderLocation(lat, lng);
        if (isFirst) matchedMapRef.current?.flyTo(lat, lng, 14);
      }
      drawRiderRoute(lat, lng);
    };
    poll();
    riderPollRef.current = setInterval(poll, 3000);
    return () => {
      if (riderPollRef.current) { clearInterval(riderPollRef.current); riderPollRef.current = null; }
    };
  }, [step, matchedRider?.id, drawRiderRoute]);

  // Subscribe to chat messages when errand is active
  useEffect(() => {
    if ((step !== 'matched' && step !== 'picked_up') || !currentErrandId) return;
    fetchMessages(currentErrandId).then(setChatMessages);
    const unsub = subscribeToMessages(currentErrandId, (msg) => {
      if (msg.sender_id === profile.id) return;
      setChatMessages(prev => [...prev, msg]);
      if (!showChat) setChatUnread(c => c + 1);
    });
    return unsub;
  }, [step, currentErrandId]);

  useEffect(() => { if (showChat) setChatUnread(0); }, [showChat]);
  useEffect(() => {
    if (showChat) setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chatMessages, showChat]);

  const handleSendErrandChat = async () => {
    const text = chatInput.trim();
    if (!text || !currentErrandId) return;
    setChatInput('');
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      ride_id: currentErrandId,
      sender_id: profile.id,
      sender_role: 'user',
      sender_name: profile.first_name ?? 'User',
      content: text,
      created_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, temp]);
    await sendMessage(currentErrandId, profile.id, 'user', profile.first_name ?? 'User', text);
  };

  const connectToChannel = (errandId: string, savedStep: string) => {
    const ch = supabase.channel('errands');
    channelRef.current = ch;
    ch.on('broadcast', { event: 'ERRAND_ACCEPTED' }, (msg: any) => {
      if (msg.payload?.errandId !== errandId) return;
      stopBroadcast();
      setMatchedRider(msg.payload.rider);
      setStep('matched');
      AsyncStorage.mergeItem(ERRAND_KEY, JSON.stringify({ step: 'matched', rider: msg.payload.rider }));
    });
    ch.on('broadcast', { event: 'ERRAND_RIDER_LOCATION' }, (msg: any) => {
      if (msg.payload?.errandId !== errandId) return;
      const { lat, lng } = msg.payload;
      const isFirst = !lastRiderPosRef.current;
      lastRiderPosRef.current = { lat, lng };
      if (matchedMapReadyRef.current) {
        matchedMapRef.current?.setRiderLocation(lat, lng);
        // On first location, pan to the rider so they're visible
        if (isFirst) matchedMapRef.current?.flyTo(lat, lng, 14);
      }
      drawRiderRoute(lat, lng);
    });
    ch.on('broadcast', { event: 'ERRAND_PICKED_UP' }, (msg: any) => {
      if (msg.payload?.errandId !== errandId) return;
      setStep('picked_up');
      AsyncStorage.mergeItem(ERRAND_KEY, JSON.stringify({ step: 'picked_up' }));
    });
    ch.on('broadcast', { event: 'ERRAND_COMPLETED' }, (msg: any) => {
      if (msg.payload?.errandId !== errandId) return;
      stopBroadcast();
      ch.unsubscribe();
      AsyncStorage.removeItem(ERRAND_KEY);
      Alert.alert('Errand Completed!', 'Your errand has been completed.');
      onClose();
    });
    ch.on('broadcast', { event: 'CANCEL_ERRAND' }, (msg: any) => {
      if (msg.payload?.errandId !== errandId) return;
      stopBroadcast();
      ch.unsubscribe();
      AsyncStorage.removeItem(ERRAND_KEY);
      Alert.alert('Errand Cancelled', 'The errand has been cancelled.');
      onClose();
    });
    ch.subscribe();
    // If still searching, repeat broadcast with full payload so late-joining riders see all details
    if (savedStep === 'searching') {
      broadcastIntervalRef.current = setInterval(() => {
        if (broadcastIntervalRef.current) {
          ch.send({ type: 'broadcast', event: 'REQUEST_ERRAND', payload: broadcastPayloadRef.current ?? { errandId } });
        }
      }, 4000);
    }
  };

  const handleCancelErrand = async () => {
    const eid = currentErrandIdRef.current;
    console.log('[CANCEL_ERRAND] confirmed. eid:', eid, 'channel:', channelRef.current ? 'exists' : 'NULL');
    setCancelConfirming(false);
    stopBroadcast();
    if (eid) {
      const broadcastResult = await channelRef.current?.send({ type: 'broadcast', event: 'CANCEL_ERRAND', payload: { errandId: eid } });
      console.log('[CANCEL_ERRAND] broadcast result:', broadcastResult);
      const { data: rpcData, error: rpcError } = await supabase.rpc('cancel_errand', { p_errand_id: eid });
      console.log('[CANCEL_ERRAND] rpc result:', { rpcData, rpcError });
      if (rpcError) {
        console.log('[CANCEL_ERRAND] rpc failed, trying direct update...');
        const { error: updateError } = await supabase.from('errands').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', eid);
        console.log('[CANCEL_ERRAND] direct update result:', updateError ?? 'success');
      }
    } else {
      console.warn('[CANCEL_ERRAND] no errandId — skipping DB update and broadcast');
    }
    channelRef.current?.unsubscribe();
    AsyncStorage.removeItem(ERRAND_KEY);
    onClose();
  };

  useEffect(() => {
    loadPricingConfigFromDB(supabase).then(setPricingConfig);
    fetchUserVouchers(profile.id).then(setUserVouchers);
    // Restore active errand — read full data from DB so display is complete
    AsyncStorage.getItem(ERRAND_KEY).then(async raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!saved.errandId) return;
        const { data } = await supabase.from('errands')
          .select('id, status, pickup_label, dropoff_label, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, description, instructions, recipient_name, recipient_phone, fare, rider_id, request_data')
          .eq('id', saved.errandId).single();
        // Always clear + cancel pending errands — no rider yet, start fresh
        if (!data || data.status === 'pending' || ['completed', 'cancelled'].includes(data.status)) {
          if (data?.status === 'pending') {
            supabase.from('errands').update({ status: 'cancelled' }).eq('id', saved.errandId);
          }
          AsyncStorage.removeItem(ERRAND_KEY);
          return;
        }
        // Only restore accepted/picked_up (rider already assigned)
        const eid = data.id;
        currentErrandIdRef.current = eid;
        setCurrentErrandId(eid);
        setPickupLabel(data.pickup_label ?? '');
        setDropoffLabel(data.dropoff_label ?? '');
        setPickupCoords({ lat: data.pickup_lat, lng: data.pickup_lng });
        setDropoffCoords({ lat: data.dropoff_lat, lng: data.dropoff_lng });
        setDescription(data.description ?? '');
        setRecipientName(data.recipient_name ?? '');
        setRecipientPhone(data.recipient_phone ?? '');
        setRestoredFare(data.fare ?? 0);
        if (saved.rider) {
          setMatchedRider(saved.rider);
        } else if (data.rider_id) {
          supabase.from('profiles').select('id, first_name, last_name, vehicle_make, vehicle_model, vehicle_plate, avatar_url, phone').eq('id', data.rider_id).single()
            .then(({ data: rp }) => { if (rp) setMatchedRider(rp); });
        }
        const restoredStep = data.status === 'picked_up' ? 'picked_up' : 'matched';
        setStep(restoredStep as any);
        connectToChannel(eid, restoredStep);
      } catch { /* ignore */ }
    });
  }, []);

  useEffect(() => {
    if (!errandType || routeDistance === 0) return;
    const bd = calculateErrandFare(errandType, vehicleType, routeDistance, pricingConfig);
    setFareBreakdown(bd);
    setVoucherDiscount(0);
    setSelectedVoucher(null);
  }, [errandType, vehicleType, routeDistance, pricingConfig]);

  const fetchRoute = useCallback(async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=3`);
      const data = await res.json();
      if (!data.routes?.[0]) return;
      const route = data.routes.reduce((best: any, r: any) => r.distance < best.distance ? r : best, data.routes[0]);
      setRouteDistance(route.distance);
      const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
      errandMapRef.current?.drawRoute(coords);
    } catch { /* silent */ }
  }, []);

  const setLocation = useCallback(async (lat: number, lng: number, type: 'pickup' | 'dropoff') => {
    const label = await reverseGeocode(lat, lng);
    const coords = { lat, lng };
    if (type === 'pickup') {
      setPickupLabel(label);
      setPickupCoords(coords);
      errandMapRef.current?.setUserLocation(lat, lng);
      if (dropoffCoords) fetchRoute(coords, dropoffCoords);
      else setActiveLocType('dropoff');
    } else {
      setDropoffLabel(label);
      setDropoffCoords(coords);
      errandMapRef.current?.setDestination(lat, lng, '🏁 Dropoff');
      if (pickupCoords) fetchRoute(pickupCoords, coords);
    }
  }, [pickupCoords, dropoffCoords, fetchRoute]);

  const useCurrentLocation = async () => {
    setLocatingMe(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow location access to use current location.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      errandMapRef.current?.flyTo(latitude, longitude, 16);
      await setLocation(latitude, longitude, 'pickup');
    } catch { Alert.alert('Error', 'Could not get location'); }
    finally { setLocatingMe(false); }
  };

  const nominatimHeaders = {
    'Accept-Language': 'en',
    'User-Agent': 'BiyaheroApp/1.0 (com.biyahero.app)',
  };

  const searchErrand = useCallback(async (query: string, type: 'pickup' | 'dropoff') => {
    if (query.length < 3) { type === 'pickup' ? setPickupSugg([]) : setDropoffSugg([]); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ph&viewbox=124.5,5.5,126.5,8.5&bounded=1`, { headers: nominatimHeaders });
      const data = await res.json();
      type === 'pickup' ? setPickupSugg(data) : setDropoffSugg(data);
    } catch { /* silent */ }
  }, []);

  const selectSugg = async (item: any, type: 'pickup' | 'dropoff') => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const label = item.display_name.split(',').slice(0, 2).join(', ');
    const coords = { lat, lng };
    if (type === 'pickup') {
      setPickupLabel(label); setPickupCoords(coords); setPickupSugg([]); setActiveField(null);
      errandMapRef.current?.setUserLocation(lat, lng);
      errandMapRef.current?.flyTo(lat, lng, 16);
      setActiveLocType('dropoff');
      if (dropoffCoords) fetchRoute(coords, dropoffCoords);
    } else {
      setDropoffLabel(label); setDropoffCoords(coords); setDropoffSugg([]); setActiveField(null);
      errandMapRef.current?.setDestination(lat, lng, '🏁 ' + label);
      errandMapRef.current?.flyTo(lat, lng, 16);
      if (pickupCoords) fetchRoute(pickupCoords, coords);
    }
  };

  const applyVoucher = async () => {
    if (!fareBreakdown) return;
    const v = userVouchers.find(uv => uv.code.toUpperCase() === voucherCode.toUpperCase());
    if (!v) { setVoucherError('Voucher not found'); return; }
    const result = await quoteVoucher(v.voucher_id, fareBreakdown.total, 0);
    if (!result || result.discount <= 0) { setVoucherError('Voucher not applicable'); return; }
    setSelectedVoucher(v);
    setVoucherDiscount(result.discount);
    setVoucherError('');
  };

  const stopBroadcast = () => {
    if (broadcastIntervalRef.current) { clearInterval(broadcastIntervalRef.current); broadcastIntervalRef.current = null; }
  };

  const handleBook = async () => {
    if (!errandType || !pickupCoords || !dropoffCoords || !description.trim() || !fareBreakdown) return;
    setBooking(true);
    const finalFare = Math.max(0, fareBreakdown.total - voucherDiscount);
    const errandId = genUUID();
    const payload = {
      errandId,
      errand_type: errandType,
      vehicle_type: vehicleType,
      pickup: { label: pickupLabel, coords: pickupCoords },
      dropoff: { label: dropoffLabel, coords: dropoffCoords },
      description: description.trim(),
      instructions: instructions.trim() || null,
      recipient_name: recipientName.trim() || null,
      recipient_phone: recipientPhone.trim() || null,
      fare: finalFare,
      original_fare: fareBreakdown.total,
      fare_breakdown: fareBreakdown,
      voucher_discount: voucherDiscount,
      user: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name, avatar_url: profile.avatar_url, phone: profile.phone },
    };

    const { error: insertErr } = await supabase.from('errands').insert({
      id: errandId,
      user_id: profile.id,
      user_name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
      user_avatar: profile.avatar_url,
      errand_type: errandType,
      vehicle_type: vehicleType,
      pickup_label: pickupLabel,
      pickup_lat: pickupCoords.lat,
      pickup_lng: pickupCoords.lng,
      dropoff_label: dropoffLabel,
      dropoff_lat: dropoffCoords.lat,
      dropoff_lng: dropoffCoords.lng,
      description: description.trim(),
      instructions: instructions.trim() || null,
      recipient_name: recipientName.trim() || null,
      recipient_phone: recipientPhone.trim() || null,
      fare: finalFare,
      original_fare: fareBreakdown.total,
      fare_breakdown: fareBreakdown,
      voucher_id: selectedVoucher?.voucher_id ?? null,
      user_voucher_id: selectedVoucher?.id ?? null,
      voucher_discount: voucherDiscount,
      status: 'pending',
      request_data: payload,
    });
    if (insertErr) { Alert.alert('Error', insertErr.message); setBooking(false); return; }

    // Notify via Telegram (non-blocking)
    sendErrandRequestToTelegram({
      userName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'User',
      errandType: errandType!,
      vehicleType,
      pickup: pickupLabel,
      dropoff: dropoffLabel,
      description: description.trim(),
      fare: finalFare,
      errandId,
    });

    if (selectedVoucher) await markVoucherUsed(selectedVoucher.id, errandId);

    // Save full state for resume on reconnect
    const saveState = {
      errandId, step: 'searching',
      pickupLabel, dropoffLabel, pickupCoords, dropoffCoords,
      description: description.trim(), recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(),
      finalFare,
    };
    AsyncStorage.setItem(ERRAND_KEY, JSON.stringify(saveState));

    // Connect channel + start broadcast (store full payload so interval can re-send it)
    broadcastPayloadRef.current = payload;
    connectToChannel(errandId, 'searching');
    channelRef.current?.send({ type: 'broadcast', event: 'REQUEST_ERRAND', payload });

    currentErrandIdRef.current = errandId;
    setCurrentErrandId(errandId);
    setRestoredFare(finalFare);
    setBooking(false);
    setStep('searching');
  };

  const finalFare = fareBreakdown ? Math.max(0, fareBreakdown.total - voucherDiscount) : restoredFare;

  // ─── STEP: TYPE ───────────────────────────────────────────────────────────────
  if (step === 'type') return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose}><Text style={s.back}>←</Text></TouchableOpacity>
        <Text style={s.title}>Sugo / Errand</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.sectionLabel}>WHAT DO YOU NEED?</Text>
        {ERRAND_TYPES.map(t => (
          <TouchableOpacity key={t.id} style={[s.typeCard, errandType === t.id && s.typeCardActive]} onPress={() => setErrandType(t.id)}>
            <Text style={s.typeEmoji}>{t.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, errandType === t.id && s.typeLabelActive]}>{t.label}</Text>
              <Text style={s.typeDesc}>{t.desc}</Text>
              {(t.id === 'buy' || t.id === 'other') && (
                <Text style={s.typeConvNote}>+ convenience fee applies</Text>
              )}
            </View>
            {errandType === t.id && <Text style={{ color: '#10b981', fontSize: 18 }}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.nextBtn, !errandType && s.nextBtnDisabled]} disabled={!errandType} onPress={() => setStep('location')}>
          <Text style={s.nextBtnText}>Next →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ─── STEP: LOCATION ────────────────────────────────────────────────────────────
  if (step === 'location') return (
    <View style={{ flex: 1 }}>
      {/* Map + bottom panel — absoluteFill so the top bar sibling can sit on top */}
      <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <OsmMap
          ref={errandMapRef}
          style={{ flex: 1 }}
          onMapReady={() => {
            setMapReady(true);
            errandMapRef.current?.flyTo(6.1106, 125.1741, 14);
            if (pickupCoords) {
              errandMapRef.current?.setUserLocation(pickupCoords.lat, pickupCoords.lng);
              if (dropoffCoords) {
                errandMapRef.current?.setDestination(dropoffCoords.lat, dropoffCoords.lng, '🏁 Dropoff');
                fetchRoute(pickupCoords, dropoffCoords);
              }
            }
          }}
          onLocationTap={async (lat, lng) => {
            if (activeField) return;
            await setLocation(lat, lng, activeLocType);
            errandMapRef.current?.flyTo(lat, lng, 16);
          }}
          onPickupDragged={async (lat, lng) => {
            const label = await reverseGeocode(lat, lng);
            setPickupLabel(label); setPickupCoords({ lat, lng });
            if (dropoffCoords) fetchRoute({ lat, lng }, dropoffCoords);
          }}
          onDestDragged={async (lat, lng) => {
            const label = await reverseGeocode(lat, lng);
            setDropoffLabel(label); setDropoffCoords({ lat, lng });
            if (pickupCoords) fetchRoute(pickupCoords, { lat, lng });
          }}
        />

      {/* Bottom search panel */}
      <View style={s.mapBottomPanel}>
        {/* Pickup field */}
        <View style={[s.searchRow, activeField === 'pickup' && s.searchRowActive]}>
          <Text style={s.searchDot}>📍</Text>
          <TextInput
            style={s.searchFieldInput}
            placeholder="Pickup location"
            placeholderTextColor="#9ca3af"
            value={pickupLabel}
            onFocus={() => { setActiveField('pickup'); setActiveLocType('pickup'); }}
            onChangeText={v => {
              setPickupLabel(v);
              clearTimeout(searchTimer.current!);
              searchTimer.current = setTimeout(() => searchErrand(v, 'pickup'), 400);
            }}
          />
          <TouchableOpacity style={s.myLocBtn} onPress={useCurrentLocation} disabled={locatingMe}>
            {locatingMe
              ? <ActivityIndicator size="small" color="#3b82f6" />
              : <Text style={s.myLocBtnText}>Me</Text>
            }
          </TouchableOpacity>
        </View>
        {activeField === 'pickup' && pickupSugg.length > 0 && (
          <ScrollView style={s.suggestionList} keyboardShouldPersistTaps="handled">
            {pickupSugg.map((item, i) => (
              <TouchableOpacity key={i} style={s.suggItem} onPress={() => selectSugg(item, 'pickup')}>
                <Text style={s.suggItemText} numberOfLines={2}>{item.display_name.split(',').slice(0, 3).join(', ')}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Dropoff field */}
        <View style={[s.searchRow, activeField === 'dropoff' && s.searchRowActive, { marginTop: 8 }]}>
          <Text style={s.searchDot}>🏁</Text>
          <TextInput
            style={s.searchFieldInput}
            placeholder="Dropoff location"
            placeholderTextColor="#9ca3af"
            value={dropoffLabel}
            onFocus={() => { setActiveField('dropoff'); setActiveLocType('dropoff'); }}
            onChangeText={v => {
              setDropoffLabel(v);
              clearTimeout(searchTimer.current!);
              searchTimer.current = setTimeout(() => searchErrand(v, 'dropoff'), 400);
            }}
          />
        </View>
        {activeField === 'dropoff' && dropoffSugg.length > 0 && (
          <ScrollView style={s.suggestionList} keyboardShouldPersistTaps="handled">
            {dropoffSugg.map((item, i) => (
              <TouchableOpacity key={i} style={s.suggItem} onPress={() => selectSugg(item, 'dropoff')}>
                <Text style={s.suggItemText} numberOfLines={2}>{item.display_name.split(',').slice(0, 3).join(', ')}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Hint */}
        {!activeField && (
          <Text style={s.mapTapHint}>Or tap the map to pin {activeLocType === 'pickup' ? 'pickup 📍' : 'dropoff 🏁'}</Text>
        )}

        <TouchableOpacity
          style={[s.nextBtn, (!pickupCoords || !dropoffCoords) && s.nextBtnDisabled, { marginTop: 10 }]}
          disabled={!pickupCoords || !dropoffCoords}
          onPress={() => { setActiveField(null); setStep('details'); }}
        >
          <Text style={s.nextBtnText}>Confirm Locations →</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>

      {/* Top back button — sibling of KAV rendered after it, so it sits above the WebView
          and reliably receives touches even on Android where WebView captures all native touches */}
      <View style={s.mapTopBar} pointerEvents="box-none">
        <TouchableOpacity onPress={() => setStep('type')} style={s.mapBackBtn}>
          <Text style={s.mapBackText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {routeDistance > 0 && (
          <View style={s.distanceBadge}>
            <Text style={s.distanceBadgeText}>{(routeDistance / 1000).toFixed(1)} km</Text>
          </View>
        )}
      </View>
    </View>
  );

  // ─── STEP: DETAILS ─────────────────────────────────────────────────────────────
  if (step === 'details') return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep('location')}><Text style={s.back}>←</Text></TouchableOpacity>
        <Text style={s.title}>Errand Details</Text>
        <View style={{ width: 32 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.pad}>
          <Text style={s.sectionLabel}>DESCRIPTION *</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder={errandType === 'buy' ? 'e.g. Buy 1kg rice, 1 bottle cooking oil' : errandType === 'pickup_deliver' ? 'e.g. Pick up package from Ate Rose' : 'Describe the errand task'}
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={[s.sectionLabel, { marginTop: 14 }]}>SPECIAL INSTRUCTIONS (optional)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="e.g. Ask for the red label brand, knock 3 times"
            placeholderTextColor="#9ca3af"
            value={instructions}
            onChangeText={setInstructions}
            multiline
            numberOfLines={2}
          />

          <Text style={[s.sectionLabel, { marginTop: 14 }]}>RECIPIENT (optional)</Text>
          <TextInput
            style={[s.input, { marginBottom: 8 }]}
            placeholder="Recipient name"
            placeholderTextColor="#9ca3af"
            value={recipientName}
            onChangeText={setRecipientName}
          />
          <TextInput
            style={s.input}
            placeholder="Recipient phone number"
            placeholderTextColor="#9ca3af"
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={[s.nextBtn, !description.trim() && s.nextBtnDisabled]}
            disabled={!description.trim()}
            onPress={() => setStep('vehicle')}
          >
            <Text style={s.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // ─── STEP: VEHICLE ─────────────────────────────────────────────────────────────
  if (step === 'vehicle') return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep('details')}><Text style={s.back}>←</Text></TouchableOpacity>
        <Text style={s.title}>Choose Vehicle</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={s.pad}>
        {VEHICLES.map(v => {
          const bd = errandType ? calculateErrandFare(errandType, v.id, routeDistance, pricingConfig) : null;
          const disabled = pricingConfig.errand[v.id].disabled;
          return (
            <TouchableOpacity
              key={v.id}
              style={[s.vehicleCard, vehicleType === v.id && s.vehicleCardActive, disabled && s.vehicleCardDisabled]}
              onPress={() => !disabled && setVehicleType(v.id)}
              disabled={disabled}
            >
              <Text style={s.vehicleEmoji}>{v.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.vehicleLabel}>{v.label}</Text>
                <Text style={s.vehicleCapacity}>{v.capacity}</Text>
              </View>
              {disabled
                ? <Text style={s.disabledText}>Not Available</Text>
                : <Text style={s.vehicleFare}>₱{bd?.total ?? 0}</Text>
              }
              {vehicleType === v.id && !disabled && <View style={s.selectedDot}><View style={s.selectedDotInner} /></View>}
            </TouchableOpacity>
          );
        })}

        {fareBreakdown && (
          <View style={s.breakdownCard}>
            <Text style={s.sectionLabel}>FARE BREAKDOWN</Text>
            {[
              ['Base Fare', fareBreakdown.baseFare],
              [`Distance (${fareBreakdown.distanceKm.toFixed(1)} km)`, fareBreakdown.distanceFee],
              ...(fareBreakdown.convenienceFee > 0 ? [['Convenience Fee', fareBreakdown.convenienceFee]] : []),
            ].map(([label, val]) => (
              <View key={label as string} style={s.bdRow}>
                <Text style={s.bdLabel}>{label as string}</Text>
                <Text style={s.bdVal}>₱{val as number}</Text>
              </View>
            ))}
            <View style={[s.bdRow, { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 8, paddingTop: 8 }]}>
              <Text style={[s.bdLabel, { fontWeight: '700', color: '#030712' }]}>Total</Text>
              <Text style={[s.bdVal, { fontWeight: '800', fontSize: 18, color: '#030712' }]}>₱{fareBreakdown.total}</Text>
            </View>
          </View>
        )}

        {/* Voucher */}
        <View style={s.voucherRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Voucher code"
            placeholderTextColor="#9ca3af"
            value={voucherCode}
            onChangeText={v => { setVoucherCode(v); setVoucherError(''); }}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={s.applyBtn} onPress={applyVoucher}>
            <Text style={s.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
        {voucherError ? <Text style={s.voucherError}>{voucherError}</Text> : null}
        {selectedVoucher && <Text style={s.voucherApplied}>✓ {selectedVoucher.code} — ₱{voucherDiscount} off</Text>}

        <TouchableOpacity style={s.nextBtn} onPress={() => setStep('confirm')}>
          <Text style={s.nextBtnText}>Review Booking →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ─── STEP: CONFIRM ─────────────────────────────────────────────────────────────
  if (step === 'confirm') return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep('vehicle')}><Text style={s.back}>←</Text></TouchableOpacity>
        <Text style={s.title}>Confirm Errand</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={s.pad}>
        <View style={s.confirmCard}>
          <View style={s.confirmRow}><Text style={s.confirmLabel}>Type</Text><Text style={s.confirmVal}>{ERRAND_TYPES.find(t => t.id === errandType)?.label}</Text></View>
          <View style={s.confirmRow}><Text style={s.confirmLabel}>Vehicle</Text><Text style={s.confirmVal}>{VEHICLES.find(v => v.id === vehicleType)?.label}</Text></View>
          <View style={s.confirmRow}><Text style={s.confirmLabel}>Pickup</Text><Text style={[s.confirmVal, { maxWidth: '60%', textAlign: 'right' }]} numberOfLines={2}>{pickupLabel}</Text></View>
          <View style={s.confirmRow}><Text style={s.confirmLabel}>Dropoff</Text><Text style={[s.confirmVal, { maxWidth: '60%', textAlign: 'right' }]} numberOfLines={2}>{dropoffLabel}</Text></View>
          <View style={s.confirmRow}><Text style={s.confirmLabel}>Description</Text><Text style={[s.confirmVal, { maxWidth: '60%', textAlign: 'right' }]} numberOfLines={3}>{description}</Text></View>
          {instructions ? <View style={s.confirmRow}><Text style={s.confirmLabel}>Instructions</Text><Text style={[s.confirmVal, { maxWidth: '60%', textAlign: 'right' }]} numberOfLines={2}>{instructions}</Text></View> : null}
          {recipientName ? <View style={s.confirmRow}><Text style={s.confirmLabel}>Recipient</Text><Text style={s.confirmVal}>{recipientName}</Text></View> : null}
          {recipientPhone ? <View style={s.confirmRow}><Text style={s.confirmLabel}>Phone</Text><Text style={s.confirmVal}>{recipientPhone}</Text></View> : null}
        </View>

        {fareBreakdown && (
          <View style={s.breakdownCard}>
            <Text style={s.sectionLabel}>FARE</Text>
            {[
              ['Base Fare', fareBreakdown.baseFare],
              [`Distance (${fareBreakdown.distanceKm.toFixed(1)} km)`, fareBreakdown.distanceFee],
              ...(fareBreakdown.convenienceFee > 0 ? [['Convenience Fee', fareBreakdown.convenienceFee]] : []),
              ...(voucherDiscount > 0 ? [['Voucher Discount', -voucherDiscount]] : []),
            ].map(([label, val]) => (
              <View key={label as string} style={s.bdRow}>
                <Text style={s.bdLabel}>{label as string}</Text>
                <Text style={[s.bdVal, (val as number) < 0 && { color: '#10b981' }]}>{(val as number) < 0 ? '-' : ''}₱{Math.abs(val as number)}</Text>
              </View>
            ))}
            <View style={[s.bdRow, { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 8, paddingTop: 8 }]}>
              <Text style={[s.bdLabel, { fontWeight: '700', color: '#030712' }]}>Total</Text>
              <Text style={[s.bdVal, { fontWeight: '800', fontSize: 20, color: '#030712' }]}>₱{finalFare}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={[s.bookBtn, booking && s.bookBtnDisabled]} onPress={handleBook} disabled={booking}>
          {booking ? <ActivityIndicator color="#fff" /> : <Text style={s.bookBtnText}>Book Errand</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ─── STEP: SEARCHING ────────────────────────────────────────────────────────────
  if (step === 'searching') return (
    <SafeAreaView style={s.safe}>
      <View style={s.centeredContent}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={s.searchingTitle}>Looking for a rider...</Text>
        <Text style={s.searchingDesc}>Connecting you with a nearby rider</Text>
        <Text style={s.searchingFare}>₱{finalFare || '—'}</Text>
        {cancelConfirming ? (
          <View style={s.confirmRow2}>
            <Text style={s.confirmMsg}>Cancel this errand?</Text>
            <View style={s.confirmBtns}>
              <TouchableOpacity style={s.confirmNo} onPress={() => setCancelConfirming(false)}>
                <Text style={s.confirmNoText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmYes} onPress={handleCancelErrand}>
                <Text style={s.confirmYesText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.cancelBtn} onPress={() => setCancelConfirming(true)}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );

  // ─── STEP: MATCHED / PICKED UP ─────────────────────────────────────────────────
  if (step === 'matched' || step === 'picked_up') return (
    <View style={{ flex: 1 }}>
      {!showChat && <OsmMap
        ref={matchedMapRef}
        style={{ flex: 1 }}
        onMapReady={() => {
          matchedMapReadyRef.current = true;
          setMatchedMapReady(true);
          if (pickupCoords) matchedMapRef.current?.setUserLocation(pickupCoords.lat, pickupCoords.lng);
          if (dropoffCoords) {
            matchedMapRef.current?.setDestination(dropoffCoords.lat, dropoffCoords.lng, '🏁 Dropoff');
            matchedMapRef.current?.setDestDraggable(false);
          }
          matchedMapRef.current?.setPickupDraggable(false);
          if (lastRiderPosRef.current) {
            // Rider location already received — show rider + draw live route
            matchedMapRef.current?.setRiderLocation(lastRiderPosRef.current.lat, lastRiderPosRef.current.lng);
            matchedMapRef.current?.flyTo(lastRiderPosRef.current.lat, lastRiderPosRef.current.lng, 14);
            lastRiderRouteTimeRef.current = 0;
            drawRiderRoute(lastRiderPosRef.current.lat, lastRiderPosRef.current.lng, true);
          } else {
            // No rider yet — zoom to show both pickup & dropoff markers and draw static route
            if (pickupCoords && dropoffCoords) {
              const midLat = (pickupCoords.lat + dropoffCoords.lat) / 2;
              const midLng = (pickupCoords.lng + dropoffCoords.lng) / 2;
              matchedMapRef.current?.flyTo(midLat, midLng, 13);
              // Draw pickup→dropoff route immediately so user sees the path right away
              fetch(`https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${dropoffCoords.lng},${dropoffCoords.lat}?overview=full&geometries=geojson`)
                .then(r => r.json())
                .then(data => {
                  if (!data.routes?.[0]) return;
                  const routeCoords: [number, number][] = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                  matchedMapRef.current?.drawRoute(routeCoords);
                })
                .catch(() => {});
            } else if (pickupCoords) {
              matchedMapRef.current?.flyTo(pickupCoords.lat, pickupCoords.lng, 14);
            }
          }
        }}
      />}

      {/* Status badge */}
      <View style={s.matchedTopBadge}>
        <Text style={s.matchedTopBadgeText}>
          {step === 'matched' ? '🏍️ Rider on the way to pickup' : '📦 Item picked up · On the way to dropoff'}
        </Text>
      </View>

      {/* Bottom panel — draggable sheet */}
      {(() => { sheetSnapRef.current = SCREEN_HEIGHT * 0.48; return null; })()}
      <Animated.View style={[s.matchedBottomPanel, { transform: [{ translateY: sheetY }] }]}>
        <View {...sheetPan.panHandlers}>
          <View style={s.sheetHandle} />
        </View>
      <ScrollView contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 20 : 8 }} showsVerticalScrollIndicator={false}>

        {/* Rider card */}
        {matchedRider && (
          <View style={s.matchedRiderCard}>
            <View style={s.matchedRiderAvatar}>
              {matchedRider.avatar_url ? (
                <Image source={{ uri: matchedRider.avatar_url }} style={s.matchedRiderAvatarImg} />
              ) : (
                <Text style={s.matchedRiderAvatarText}>
                  {(matchedRider.first_name?.[0] ?? 'R').toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.matchedRiderLabel}>YOUR RIDER</Text>
              <Text style={s.riderName}>{matchedRider.first_name} {matchedRider.last_name}</Text>
              <Text style={s.riderMeta}>
                {[matchedRider.vehicle_make, matchedRider.vehicle_model].filter(Boolean).join(' ')}
                {matchedRider.vehicle_plate ? ` · ${matchedRider.vehicle_plate}` : ''}
              </Text>
              {matchedRider.phone ? (
                <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {matchedRider.phone}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={s.fareChip}><Text style={s.fareChipText}>₱{finalFare}</Text></View>
              <TouchableOpacity style={s.chatBtn} onPress={() => setShowChat(true)}>
                <Text style={s.chatBtnText}>💬{chatUnread > 0 ? ` ${chatUnread}` : ''}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Errand type + status */}
        <View style={s.matchedErrandTypeRow}>
          {errandType && (
            <View style={s.matchedTypePill}>
              <Text style={s.matchedTypePillText}>
                {errandType === 'buy' ? '🛍️ Buy Something' : errandType === 'pickup_deliver' ? '📦 Pickup & Deliver' : '📋 Other'}
              </Text>
            </View>
          )}
          <View style={[s.matchedTypePill, { backgroundColor: step === 'picked_up' ? '#f0fdf4' : '#fffbeb', borderColor: step === 'picked_up' ? '#d1fae5' : '#fde68a' }]}>
            <Text style={[s.matchedTypePillText, { color: step === 'picked_up' ? '#10b981' : '#d97706' }]}>
              {step === 'picked_up' ? '✓ Item Picked Up' : '🏍️ On the way'}
            </Text>
          </View>
        </View>

        {/* Route card */}
        <View style={s.matchedRouteCard}>
          <View style={s.matchedRouteRow}>
            <View style={s.matchedDotBlack} />
            <View style={{ flex: 1 }}>
              <Text style={s.matchedRouteLabel}>PICKUP</Text>
              <Text style={s.matchedRouteVal} numberOfLines={2}>{pickupLabel}</Text>
            </View>
          </View>
          <View style={s.matchedRouteConnector} />
          <View style={s.matchedRouteRow}>
            <View style={s.matchedDotGreen} />
            <View style={{ flex: 1 }}>
              <Text style={s.matchedRouteLabel}>DROPOFF</Text>
              <Text style={s.matchedRouteVal} numberOfLines={2}>{dropoffLabel}</Text>
            </View>
          </View>
        </View>

        {/* Task description */}
        {description ? (
          <View style={s.matchedTaskCard}>
            <Text style={s.matchedTaskLabel}>TASK</Text>
            <Text style={s.matchedTaskText} numberOfLines={3}>{description}</Text>
          </View>
        ) : null}

        {/* Recipient */}
        {recipientName ? (
          <View style={s.matchedRecipientCard}>
            <Text style={s.matchedRecipientLabel}>RECIPIENT</Text>
            <Text style={s.matchedRecipientName}>👤 {recipientName}</Text>
            {recipientPhone ? <Text style={s.matchedRecipientPhone}>{recipientPhone}</Text> : null}
          </View>
        ) : null}

        {/* Cancel */}
        {step === 'matched' && (
          cancelConfirming ? (
            <View style={s.confirmRow2}>
              <Text style={s.confirmMsg}>Cancel this errand?</Text>
              <View style={s.confirmBtns}>
                <TouchableOpacity style={s.confirmNo} onPress={() => setCancelConfirming(false)}>
                  <Text style={s.confirmNoText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.confirmYes} onPress={handleCancelErrand}>
                  <Text style={s.confirmYesText}>Yes, Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.errandCancelInline} onPress={() => setCancelConfirming(true)}>
              <Text style={s.errandCancelInlineText}>Cancel Errand</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
      </Animated.View>

      {/* Chat overlay */}
      {showChat && (
        <View style={s.chatOverlay}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.chatHeader}>
            <TouchableOpacity onPress={() => setShowChat(false)} style={s.chatBackBtn}>
              <Text style={s.chatBackText}>←</Text>
            </TouchableOpacity>
            <View style={s.chatAvatarCircle}>
              <Text style={s.chatAvatarText}>{(matchedRider?.first_name?.[0] ?? 'R').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.chatName}>{matchedRider?.first_name} {matchedRider?.last_name}</Text>
              <Text style={s.chatRole}>RIDER</Text>
            </View>
          </View>
          <ScrollView
            ref={chatScrollRef}
            style={s.chatMessages}
            contentContainerStyle={s.chatMsgContent}
            keyboardShouldPersistTaps="handled"
          >
            {chatMessages.length === 0 && (
              <Text style={s.chatEmpty}>No messages yet. Say hi! 👋</Text>
            )}
            {chatMessages.map(m => {
              const isMe = m.sender_id === profile.id;
              return (
                <View key={m.id} style={[s.msgRow, isMe ? s.msgRowMe : s.msgRowThem]}>
                  <View style={[s.msgBubble, isMe ? s.msgBubbleMe : s.msgBubbleThem]}>
                    <Text style={[s.msgText, isMe ? s.msgTextMe : s.msgTextThem]}>{m.content}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={s.chatInputRow}>
            <TextInput
              style={s.chatInput}
              placeholder="Type a message..."
              placeholderTextColor="#9ca3af"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={handleSendErrandChat}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[s.sendBtn, !chatInput.trim() && { opacity: 0.4 }]}
              onPress={handleSendErrandChat}
              disabled={!chatInput.trim()}
            >
              <Text style={s.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );

  return null;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  back: { fontSize: 22, color: '#030712', width: 32 },
  title: { fontSize: 17, fontWeight: '700', color: '#030712' },
  pad: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 10 },

  typeCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 14 },
  typeCardActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  typeEmoji: { fontSize: 28 },
  typeLabel: { fontSize: 15, fontWeight: '600', color: '#030712' },
  typeLabelActive: { color: '#10b981' },
  typeDesc: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  typeConvNote: { fontSize: 10, color: '#f59e0b', marginTop: 3, fontWeight: '600' },

  input: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#030712', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  // Map location step
  mapTopBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 54 : 12, paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  mapBackBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  mapBackText: { fontSize: 20, color: '#030712' },
  distanceBadge: { backgroundColor: '#10b981', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  distanceBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  mapBottomPanel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#f3f4f6', gap: 8 },
  searchRowActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  searchDot: { fontSize: 16 },
  searchFieldInput: { flex: 1, fontSize: 13, color: '#030712', paddingVertical: 11 },
  myLocBtn: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  myLocBtnText: { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
  suggestionList: { maxHeight: 140, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 12, backgroundColor: '#fff', marginTop: 2 },
  suggItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  suggItemText: { fontSize: 12, color: '#374151' },
  mapTapHint: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 },

  vehicleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 14 },
  vehicleCardActive: { borderColor: '#030712', backgroundColor: '#f9fafb' },
  vehicleCardDisabled: { opacity: 0.45 },
  vehicleEmoji: { fontSize: 28 },
  vehicleLabel: { fontSize: 15, fontWeight: '600', color: '#030712' },
  vehicleCapacity: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  vehicleFare: { fontSize: 16, fontWeight: '700', color: '#030712' },
  disabledText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  selectedDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#030712', alignItems: 'center', justifyContent: 'center' },
  selectedDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#030712' },

  breakdownCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  bdLabel: { fontSize: 13, color: '#9ca3af' },
  bdVal: { fontSize: 13, fontWeight: '600', color: '#030712' },

  voucherRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  applyBtn: { backgroundColor: '#030712', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  voucherError: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  voucherApplied: { fontSize: 12, color: '#10b981', fontWeight: '600', marginTop: 4 },

  nextBtn: { backgroundColor: '#030712', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  confirmCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  confirmLabel: { fontSize: 13, color: '#9ca3af' },
  confirmVal: { fontSize: 13, fontWeight: '600', color: '#030712' },

  bookBtn: { backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  searchingTitle: { fontSize: 20, fontWeight: '700', color: '#030712', marginTop: 20 },
  searchingDesc: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
  searchingFare: { fontSize: 28, fontWeight: '800', color: '#10b981', marginTop: 20 },
  cancelBtn: { marginTop: 32, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: '#f3f4f6' },
  confirmRow2: { marginTop: 24, alignItems: 'center' },
  confirmMsg: { fontSize: 14, fontWeight: '600', color: '#030712', marginBottom: 12 },
  confirmBtns: { flexDirection: 'row', gap: 10 },
  confirmNo: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  confirmNoText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  confirmYes: { backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  confirmYesText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  // Matched step with map
  matchedTopBadge: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 12, left: 16, right: 16, backgroundColor: '#f0fdf4', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center' },
  matchedTopBadgeText: { fontSize: 13, fontWeight: '700', color: '#10b981' },
  matchedBottomPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '55%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, elevation: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginBottom: 10 },

  // Rider card
  matchedRiderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  matchedRiderAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  matchedRiderAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  matchedRiderAvatarText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  matchedRiderLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.2, marginBottom: 2 },
  riderName: { fontSize: 14, fontWeight: '700', color: '#030712' },
  riderMeta: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  fareChip: { backgroundColor: '#030712', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  fareChipText: { fontSize: 15, fontWeight: '800', color: '#10b981' },

  // Type + status pills
  matchedErrandTypeRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  matchedTypePill: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb' },
  matchedTypePillText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  // Route card
  matchedRouteCard: { backgroundColor: '#f9fafb', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  matchedRouteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  matchedDotBlack: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#030712', marginTop: 4 },
  matchedDotGreen: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#10b981', marginTop: 4 },
  matchedRouteConnector: { width: 1, height: 14, backgroundColor: '#e5e7eb', marginLeft: 3, marginVertical: 3 },
  matchedRouteLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1 },
  matchedRouteVal: { fontSize: 13, fontWeight: '600', color: '#030712', marginTop: 1, lineHeight: 18 },

  // Task card
  matchedTaskCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#d1fae5' },
  matchedTaskLabel: { fontSize: 9, fontWeight: '700', color: '#10b981', letterSpacing: 1.2, marginBottom: 3 },
  matchedTaskText: { fontSize: 12, color: '#374151', lineHeight: 18 },

  // Recipient card
  matchedRecipientCard: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  matchedRecipientLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.2, marginBottom: 3 },
  matchedRecipientName: { fontSize: 13, fontWeight: '600', color: '#030712' },
  matchedRecipientPhone: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  // Legacy kept
  matchedRiderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  matchedLocRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  matchedLocDot: { fontSize: 14 },
  matchedLocText: { flex: 1, fontSize: 12, color: '#374151', fontWeight: '500' },
  matchedDesc: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 4 },
  matchedRecipient: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  errandCancelInline: { marginTop: 10, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  errandCancelInlineText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  // Chat button on rider card
  chatBtn: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#d1fae5' },
  chatBtnText: { fontSize: 13, fontWeight: '700', color: '#10b981' },

  // Chat overlay
  chatOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#fff', zIndex: 100, elevation: 20 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingTop: Platform.OS === 'ios' ? 54 : 14 },
  chatBackBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chatBackText: { fontSize: 22, color: '#030712' },
  chatAvatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  chatName: { fontSize: 14, fontWeight: '700', color: '#030712' },
  chatRole: { fontSize: 9, color: '#9ca3af', fontWeight: '700', letterSpacing: 1 },
  chatMessages: { flex: 1, backgroundColor: '#f6f7f9' },
  chatMsgContent: { padding: 16, gap: 8 },
  chatEmpty: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 40 },
  msgRow: { flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  msgBubbleMe: { backgroundColor: '#030712', borderBottomRightRadius: 4 },
  msgBubbleThem: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextThem: { color: '#111827' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  chatInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 99, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
