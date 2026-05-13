import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, ScrollView, Animated,
  KeyboardAvoidingView, Platform, Modal, Image, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import OsmMap, { OsmMapHandle } from '../../components/OsmMap';
import { supabase, Profile } from '../../lib/supabase';
import { calculateFare, FareBreakdown, DEFAULT_PRICING, PricingConfig, loadPricingConfigFromDB } from '../../lib/fareService';
import { ChatMessage, fetchMessages, sendMessage, subscribeToMessages } from '../../lib/chatService';
import {
  fetchUserVouchers,
  addVoucherToUser,
  markVoucherUsed,
  quoteVoucher,
  UserVoucher,
} from '../../lib/voucherService';

type Step = 'home' | 'select' | 'searching' | 'matched' | 'review';
type TierId = 'moto' | 'eco' | 'premium';
type ActiveField = 'pickup' | 'dropoff' | null;

interface Favorite {
  id: string;
  name: string;
  label: string;
  coords: [number, number];
}

const TIERS = [
  { id: 'moto' as TierId, name: 'Motorcycle', emoji: '🏍️', time: '2-3 min', capacity: '1 passenger' },
  { id: 'eco' as TierId, name: 'Standard Car', emoji: '🚕', time: '4-5 min', capacity: '3 passengers' },
  { id: 'premium' as TierId, name: 'Premium', emoji: '🚙', time: '5-7 min', capacity: '4 passengers' },
];

const QUICK_PLACES = [
  { name: 'SM City GenSan', subtitle: 'General Santos City', emoji: '🏬', coords: [6.107, 125.164] as [number, number] },
  { name: 'GenSan Airport', subtitle: 'Fatima, General Santos', emoji: '✈️', coords: [6.058, 125.095] as [number, number] },
  { name: 'Gaisano Mall', subtitle: 'National Highway, GenSan', emoji: '🛍️', coords: [6.108, 125.168] as [number, number] },
];

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];
const QUICK_TAGS = ['Friendly', 'Safe Driver', 'On Time', 'Clean Vehicle', 'Professional'];

const isInMindanao = (lat: number, lon: number) =>
  lat >= 4.5 && lat <= 10.2 && lon >= 118.3 && lon <= 127.5;

const genId = () => `ride_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FAVORITES_KEY = 'biyahero_favorites';
const USER_RIDE_KEY = 'biyahero_user_ride';

interface Props { profile: Profile; onSignOut: () => void; }

export default function HomeScreen({ profile, onSignOut }: Props) {
  const mapRef = useRef<OsmMapHandle>(null);
  const navigation = useNavigation<any>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ridesChannel = useRef<any>(null);
  const dotAnims = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;
  const ringAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  // Map
  const [mapReady, setMapReady] = useState(false);

  // Location
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLabel, setPickupLabel] = useState('Current Location');

  // Home step UI
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Destination
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Route
  const [routeDistance, setRouteDistance] = useState(0);
  const [routeDuration, setRouteDuration] = useState(0);

  // Booking flow
  const [step, setStep] = useState<Step>('home');
  const [selectedTier, setSelectedTier] = useState<TierId>('moto');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Matched
  const [activeRider, setActiveRider] = useState<Profile | null>(null);
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Voucher
  const [showVoucherPicker, setShowVoucherPicker] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState<string | null>(null);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [userVouchers, setUserVouchers] = useState<UserVoucher[]>([]);
  const [selectedVoucherUv, setSelectedVoucherUv] = useState<UserVoucher | null>(null);

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  // Drawer
  const [showDrawer, setShowDrawer] = useState(false);

  // Rider confirm + reviews + vehicle photo
  const [pendingRider, setPendingRider] = useState<Profile | null>(null);
  const [riderReviews, setRiderReviews] = useState<{ rating: number; comment: string | null; user_name: string; completed_at: string | null }[]>([]);
  const [showVehiclePhoto, setShowVehiclePhoto] = useState(false);
  const [lastRiderCoords, setLastRiderCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Review
  const [completedRider, setCompletedRider] = useState<Profile | null>(null);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const saveRideState = async (overrides?: Record<string, any>) => {
    if (!currentRideId) return;
    try {
      await AsyncStorage.setItem(USER_RIDE_KEY, JSON.stringify({
        currentRideId,
        step,
        pickup: pickupLabel,
        pickupCoords,
        dropoff: destination,
        destinationCoords,
        selectedTier,
        fareBreakdown,
        selectedVoucherUv,
        voucherDiscount,
        activeRider,
        ...overrides,
      }));
    } catch { /* silent */ }
  };

  const clearRideState = async () => {
    try { await AsyncStorage.removeItem(USER_RIDE_KEY); } catch { /* silent */ }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const d = await r.json();
      const a = d.address ?? {};
      return [a.road || a.suburb || a.neighbourhood, a.city || a.town || a.municipality || a.county]
        .filter(Boolean).join(', ') || d.display_name?.split(',')[0] || 'Selected location';
    } catch { return 'Selected location'; }
  };

  // Init
  useEffect(() => {
    loadPricingConfigFromDB(supabase).then(setPricingConfig);
    AsyncStorage.getItem(FAVORITES_KEY).then(val => {
      if (val) setFavorites(JSON.parse(val));
    });
    (async () => {
      const raw = await AsyncStorage.getItem(USER_RIDE_KEY);
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!saved.currentRideId) return;
        const { data } = await supabase.from('rides').select('status').eq('id', saved.currentRideId).single();
        if (!data || data.status === 'completed' || data.status === 'cancelled') {
          await AsyncStorage.removeItem(USER_RIDE_KEY);
          return;
        }
        setCurrentRideId(saved.currentRideId);
        setStep(saved.step ?? 'searching');
        if (saved.pickup) setPickupLabel(saved.pickup);
        if (saved.pickupCoords) setPickupCoords(saved.pickupCoords);
        if (saved.dropoff) setDestination(saved.dropoff);
        if (saved.destinationCoords) setDestinationCoords(saved.destinationCoords);
        if (saved.selectedTier) setSelectedTier(saved.selectedTier);
        if (saved.fareBreakdown) setFareBreakdown(saved.fareBreakdown);
        if (saved.activeRider) setActiveRider(saved.activeRider);
        if (saved.selectedVoucherUv) setSelectedVoucherUv(saved.selectedVoucherUv);
        if (saved.voucherDiscount) setVoucherDiscount(saved.voucherDiscount);
      } catch {
        await AsyncStorage.removeItem(USER_RIDE_KEY);
      }
    })();
  }, []);

  // GPS + reverse geocode — runs once, independent of mapReady
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location required', 'Enable location to use Biyahero.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setPickupCoords({ lat: latitude, lng: longitude });
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const d = await r.json();
        const a = d.address ?? {};
        const label = [a.road || a.suburb || a.neighbourhood, a.city || a.town || a.municipality || a.county]
          .filter(Boolean).join(', ') || d.display_name?.split(',')[0] || 'Current Location';
        setPickupLabel(label);
      } catch { /* keep default */ }
    })();
  }, []);

  // Push location to map once both GPS and map are ready
  useEffect(() => {
    if (!mapReady || !pickupCoords) return;
    mapRef.current?.setUserLocation(pickupCoords.lat, pickupCoords.lng);
    mapRef.current?.flyTo(pickupCoords.lat, pickupCoords.lng, 15);
  }, [mapReady, pickupCoords]);

  // Fallback: force mapReady if WebView never fires the event (edge case on some devices)
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Nominatim search
  const activeQuery = activeField === 'pickup' ? pickupQuery : activeField === 'dropoff' ? dropoffQuery : '';
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (activeQuery.length < 3) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(activeQuery)}&limit=5&countrycodes=ph&viewbox=118.3,10.2,127.5,4.5&bounded=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        setSuggestions(await res.json());
      } catch { /* ignore */ }
      finally { setSearchLoading(false); }
    }, 500);
  }, [activeQuery]);

  // Route
  const fetchRoute = useCallback(async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
      );
      const data = await res.json();
      if (!data.routes?.[0]) return;
      const route = data.routes[0];
      setRouteDistance(route.distance);
      setRouteDuration(route.duration);
      const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
      mapRef.current?.drawRoute(coords);
    } catch { /* ignore */ }
  }, []);

  // Toggle drag on step change
  useEffect(() => {
    const canDrag = step === 'home' || step === 'select';
    mapRef.current?.setPickupDraggable(canDrag);
    mapRef.current?.setDestDraggable(canDrag);
  }, [step]);

  // Searching animations
  useEffect(() => {
    if (step !== 'searching') return;
    const rings = ringAnims.map((anim, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 550),
        Animated.timing(anim, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]))
    );
    const dots = dotAnims.map((anim, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 300),
        Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
      ]))
    );
    rings.forEach(a => a.start());
    dots.forEach(d => d.start());
    return () => { rings.forEach(a => a.stop()); dots.forEach(d => d.stop()); };
  }, [step]);

  // Rides channel
  useEffect(() => {
    if (!currentRideId) return;
    const ch = supabase.channel('rides');
    ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
      if (payload.rideId !== currentRideId) return;
      setPendingRider(payload.rider as Profile);
    });
    ch.on('broadcast', { event: 'RIDER_LOCATION' }, ({ payload }) => {
      if (payload.rideId !== currentRideId) return;
      mapRef.current?.setRiderLocation(payload.lat, payload.lng);
      setLastRiderCoords({ lat: payload.lat, lng: payload.lng });
    });
    ch.on('broadcast', { event: 'RIDE_CANCELLED' }, ({ payload }) => {
      if (payload.rideId !== currentRideId) return;
      Alert.alert('Ride cancelled', 'The rider cancelled your booking.');
      setActiveRider(null);
      setStep('searching');
      supabase.from('rides').update({ status: 'pending', rider_id: null }).eq('id', currentRideId);
    });
    ch.on('broadcast', { event: 'RIDE_COMPLETED' }, ({ payload }) => {
      if (payload.rideId !== currentRideId) return;
      setCompletedRider(activeRider);
      setRating(0);
      setRatingComment('');
      setSelectedTags([]);
      setRatingSubmitted(false);
      setStep('review');
    });
    ch.subscribe();
    ridesChannel.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [currentRideId]);

  // Rider reviews
  useEffect(() => {
    if (!activeRider?.id) { setRiderReviews([]); return; }
    (async () => {
      const { data: rides } = await supabase
        .from('rides')
        .select('rating, comment, completed_at, user_id')
        .eq('rider_id', activeRider.id)
        .gte('rating', 4)
        .order('completed_at', { ascending: false })
        .limit(20);
      if (!rides?.length) return;
      const userIds = [...new Set(rides.map((r: any) => r.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('id, first_name').in('id', userIds)
        : { data: [] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const mapped = rides.map((r: any) => ({
        rating: r.rating,
        comment: r.comment,
        completed_at: r.completed_at,
        user_name: map.get(r.user_id)?.first_name ?? 'Passenger',
      }));
      const withComment = mapped.filter(r => r.comment);
      const withoutComment = mapped.filter(r => !r.comment);
      setRiderReviews([...withComment, ...withoutComment].slice(0, 3));
    })();
  }, [activeRider?.id]);

  // Chat
  useEffect(() => {
    if (step !== 'matched' || !currentRideId) return;
    fetchMessages(currentRideId).then(setMessages);
    const unsub = subscribeToMessages(currentRideId, (msg) => {
      if (msg.sender_id === profile.id) return;
      setMessages(prev => [...prev, msg]);
      if (!showChat) setUnreadCount(c => c + 1);
    });
    return unsub;
  }, [step, currentRideId, showChat]);

  useEffect(() => { if (showChat) setUnreadCount(0); }, [showChat]);
  useEffect(() => {
    if (showChat) setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, showChat]);

  // Favorites
  const saveFavorite = async (place: any) => {
    const fav: Favorite = { id: genId(), name: place.name || place.display_name.split(',')[0], label: place.display_name, coords: [parseFloat(place.lat), parseFloat(place.lon)] };
    const next = [fav, ...favorites.filter(f => f.label !== place.display_name)];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };
  const removeFavorite = async (id: string) => {
    const next = favorites.filter(f => f.id !== id);
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };

  // Place selection
  const handleSelectPlace = (place: any) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    if (!isInMindanao(lat, lng)) { Alert.alert('Outside Mindanao', 'Service available in Mindanao only.'); return; }
    const name = place.name || place.display_name.split(',')[0];
    if (activeField === 'pickup') {
      setPickupLabel(name);
      setPickupCoords({ lat, lng });
      setPickupQuery('');
      setActiveField('dropoff');
    } else {
      setDestination(name);
      setDestinationCoords({ lat, lng });
      setDropoffQuery('');
      setActiveField(null);
      mapRef.current?.setDestination(lat, lng, name);
      mapRef.current?.flyTo(lat, lng, 14);
      if (pickupCoords) fetchRoute(pickupCoords, { lat, lng });
      setIsExpanded(false);
    }
    setSuggestions([]);
  };

  const selectQuickPlace = (place: { name: string; coords: [number, number] }) => {
    const [lat, lng] = place.coords;
    setDestination(place.name);
    setDestinationCoords({ lat, lng });
    setActiveField(null);
    mapRef.current?.setDestination(lat, lng, place.name);
    mapRef.current?.flyTo(lat, lng, 14);
    if (pickupCoords) fetchRoute(pickupCoords, { lat, lng });
    setIsExpanded(false);
    setSuggestions([]);
  };

  // Booking
  const handleBook = async () => {
    if (!destinationCoords || !pickupCoords) return;
    setIsBooking(true);
    const rideId = genId();
    setCurrentRideId(rideId);
    const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
    const finalFare = Math.max(0, bd.totalFare - voucherDiscount);
    setFareBreakdown(bd);
    const payload = {
      rideId, user: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name, avatar_url: profile.avatar_url },
      pickup: { label: pickupLabel, coords: pickupCoords }, dropoff: { label: destination, coords: destinationCoords },
      fare: finalFare, fareBreakdown: bd, ride_type: selectedTier, routeDistance,
    };
    await supabase.from('rides').insert({
      id: rideId, user_id: profile.id,
      user_name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
      user_avatar: profile.avatar_url, status: 'pending',
      pickup_label: pickupLabel, dropoff_label: destination,
      fare: finalFare, fare_breakdown: bd, ride_type: selectedTier, request_data: payload,
      voucher_id: selectedVoucherUv?.voucher_id ?? null,
      voucher_discount: voucherDiscount,
    });
    supabase.channel('rides').send({ type: 'broadcast', event: 'REQUEST_RIDE', payload });
    setIsBooking(false);
    setStep('searching');
    saveRideState({ step: 'searching' });
  };

  const cancelBooking = async () => {
    if (currentRideId) {
      supabase.channel('rides').send({ type: 'broadcast', event: 'CANCEL_RIDE', payload: { rideId: currentRideId } });
      await supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRideId);
    }
    resetToHome();
    clearRideState();
  };

  const resetToHome = () => {
    setStep('home'); setCurrentRideId(null); setActiveRider(null); setFareBreakdown(null);
    setShowChat(false); setShowCancelConfirm(false); setMessages([]); setUnreadCount(0);
    setDestination(''); setDestinationCoords(null); setDropoffQuery('');
    setVoucherDiscount(0); setAppliedVoucher(null); setVoucherCode(''); setVoucherMsg('');
    setSelectedVoucherUv(null); setUserVouchers([]);
    setPendingRider(null); setRiderReviews([]); setShowVehiclePhoto(false); setLastRiderCoords(null);
    mapRef.current?.clearRider(); mapRef.current?.clearRoute(); mapRef.current?.clearDestination();
    clearRideState();
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !currentRideId) return;
    setChatInput('');
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, ride_id: currentRideId, sender_id: profile.id, sender_role: 'user', sender_name: profile.first_name ?? 'User', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, temp]);
    await sendMessage(currentRideId, profile.id, 'user', profile.first_name ?? 'User', text);
  };

  const handleSubmitRating = async () => {
    if (rating === 0) return;
    const fullComment = [selectedTags.join(', '), ratingComment.trim()].filter(Boolean).join('. ');
    if (currentRideId) await supabase.from('rides').update({ rating, comment: fullComment || null }).eq('id', currentRideId);
    if (selectedVoucherUv && voucherDiscount > 0 && currentRideId) {
      await markVoucherUsed(selectedVoucherUv.id, currentRideId);
    }
    setRatingSubmitted(true);
    clearRideState();
    setTimeout(resetToHome, 1800);
  };

  // ─── PANELS ────────────────────────────────────────────────────────────────

  const renderPanel = () => {
    // CHAT overlay
    if (showChat && step === 'matched') {
      return (
        <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setShowChat(false)} style={styles.chatBackBtn}>
              <Text style={styles.chatBackText}>←</Text>
            </TouchableOpacity>
            <View style={styles.chatAvatar}>
              <Text style={styles.chatAvatarText}>{(activeRider?.first_name?.[0] ?? 'R').toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.chatName}>{activeRider?.first_name} {activeRider?.last_name}</Text>
              <Text style={styles.chatRole}>RIDER</Text>
            </View>
          </View>
          <ScrollView ref={chatScrollRef} style={styles.chatMessages} contentContainerStyle={styles.chatMsgContent}>
            {messages.length === 0 && <Text style={styles.chatEmpty}>No messages yet. Say hi!</Text>}
            {messages.map(m => {
              const isMe = m.sender_id === profile.id;
              return (
                <View key={m.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                  <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem]}>
                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>{m.content}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput style={styles.chatInput} placeholder="Type a message..." placeholderTextColor="#9ca3af" value={chatInput} onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" />
            <TouchableOpacity style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.4 }]} onPress={handleSendChat} disabled={!chatInput.trim()}>
              <Text style={styles.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      );
    }

    // ── HOME ──────────────────────────────────────────────────────────────────
    if (step === 'home') {
      const hasSuggestions = suggestions.length > 0;
      const showExpanded = isExpanded || hasSuggestions;
      return (
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Handle */}
          <TouchableOpacity style={styles.handleWrap} onPress={() => { setIsExpanded(e => !e); setSuggestions([]); }} activeOpacity={1}>
            <View style={styles.handle} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.homeHeaderRow}>
            <View>
              <Text style={styles.heading}>Where to?</Text>
              <Text style={styles.hint}>📍 Service available in Mindanao only</Text>
            </View>
            <TouchableOpacity onPress={() => { setIsExpanded(e => !e); setSuggestions([]); }} style={styles.chevronBtn}>
              <Text style={styles.chevronText}>{showExpanded ? '∧' : '∨'}</Text>
            </TouchableOpacity>
          </View>

          {/* Expanded: suggestions / favorites / quick places */}
          {showExpanded && (
            <ScrollView style={styles.expandedArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {hasSuggestions ? (
                <View style={styles.suggestionBox}>
                  {searchLoading && <Text style={styles.searchingText}>Searching...</Text>}
                  {suggestions.map((place, i) => (
                    <View key={i} style={[styles.suggRow, i < suggestions.length - 1 && styles.suggBorder]}>
                      <TouchableOpacity style={styles.suggLeft} onPress={() => handleSelectPlace(place)}>
                        <Text style={styles.suggPin}>📍</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggName} numberOfLines={1}>{place.name || place.display_name.split(',')[0]}</Text>
                          <Text style={styles.suggSub} numberOfLines={1}>{place.display_name}</Text>
                        </View>
                      </TouchableOpacity>
                      {activeField === 'dropoff' && (
                        <TouchableOpacity onPress={() => saveFavorite(place)} style={styles.starBtn}>
                          <Text style={[styles.starIcon, favorites.some(f => f.label === place.display_name) && styles.starIconFilled]}>
                            {favorites.some(f => f.label === place.display_name) ? '★' : '☆'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ) : activeQuery.length >= 3 && !searchLoading ? (
                <Text style={styles.noResults}>No locations found in Mindanao for "{activeQuery}"</Text>
              ) : activeField === 'pickup' ? (
                <TouchableOpacity style={styles.quickItem} onPress={() => { setPickupLabel('Current Location'); setActiveField('dropoff'); setIsExpanded(false); }}>
                  <View style={styles.quickIcon}><Text>📍</Text></View>
                  <View><Text style={styles.quickName}>Current Location</Text><Text style={styles.quickSub}>Use GPS location</Text></View>
                </TouchableOpacity>
              ) : (
                <>
                  {favorites.length > 0 && (
                    <>
                      <Text style={styles.sectionLbl}>SAVED PLACES</Text>
                      {favorites.map(fav => (
                        <View key={fav.id} style={styles.quickItem}>
                          <TouchableOpacity style={styles.quickItemLeft} onPress={() => {
                            setDestination(fav.name); setDestinationCoords({ lat: fav.coords[0], lng: fav.coords[1] });
                            setActiveField(null);
                            mapRef.current?.setDestination(fav.coords[0], fav.coords[1], fav.name);
                            mapRef.current?.flyTo(fav.coords[0], fav.coords[1], 14);
                            if (pickupCoords) fetchRoute(pickupCoords, { lat: fav.coords[0], lng: fav.coords[1] });
                            setIsExpanded(false);
                          }}>
                            <View style={[styles.quickIcon, { backgroundColor: '#fef3c7' }]}><Text>⭐</Text></View>
                            <View style={{ flex: 1 }}><Text style={styles.quickName}>{fav.name}</Text><Text style={styles.quickSub} numberOfLines={1}>{fav.label.split(',').slice(0, 2).join(',')}</Text></View>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeFavorite(fav.id)} style={styles.removeBtn}>
                            <Text style={styles.removeBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      <View style={styles.divider} />
                    </>
                  )}
                  <Text style={styles.sectionLbl}>QUICK DESTINATIONS</Text>
                  {QUICK_PLACES.map(place => (
                    <TouchableOpacity key={place.name} style={styles.quickItem} onPress={() => selectQuickPlace(place)}>
                      <View style={styles.quickIcon}><Text>{place.emoji}</Text></View>
                      <View><Text style={styles.quickName}>{place.name}</Text><Text style={styles.quickSub}>{place.subtitle}</Text></View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          )}

          {/* Dual input */}
          <View style={styles.inputBox}>
            <TouchableOpacity
              style={[styles.inputRow, activeField === 'pickup' ? styles.inputRowActive : styles.inputRowInactive]}
              onPress={() => { setActiveField('pickup'); setIsExpanded(true); setSuggestions([]); }}
              activeOpacity={1}
            >
              <View style={styles.dotBlack} />
              {activeField === 'pickup' ? (
                <TextInput style={styles.inputField} placeholder="Search pickup..." placeholderTextColor="#9ca3af" value={pickupQuery} onChangeText={setPickupQuery} autoFocus />
              ) : (
                <Text style={[styles.inputStaticText, { color: '#111827' }]} numberOfLines={1}>{pickupLabel}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.connector}>
              <View style={styles.connDot} />
              <View style={styles.connDot} />
              <View style={styles.connLine} />
            </View>

            <TouchableOpacity
              style={[styles.inputRow, activeField === 'dropoff' ? styles.inputRowActive : styles.inputRowInactive]}
              onPress={() => { setActiveField('dropoff'); setIsExpanded(true); setSuggestions([]); }}
              activeOpacity={1}
            >
              <View style={styles.dotGreen} />
              {activeField === 'dropoff' ? (
                <TextInput style={styles.inputField} placeholder="Where to?" placeholderTextColor="#9ca3af" value={dropoffQuery} onChangeText={setDropoffQuery} autoFocus />
              ) : (
                <Text style={[styles.inputStaticText, !destination && { color: '#9ca3af' }]} numberOfLines={1}>
                  {destination || 'Choose destination'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !destinationCoords && styles.primaryBtnInactive]}
            onPress={() => {
              if (destinationCoords) {
                setStep('select');
                fetchUserVouchers(profile.id).then(setUserVouchers);
              } else {
                setActiveField('dropoff');
                setIsExpanded(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, !destinationCoords && styles.primaryBtnTextInactive]}>
              {destinationCoords ? 'Find a Rider' : 'Where are you going?'}
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      );
    }

    // ── SELECT ────────────────────────────────────────────────────────────────
    if (step === 'select') {
      const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
      const finalFare = Math.max(0, bd.totalFare - voucherDiscount);
      return (
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.selectInner}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => setStep('home')} style={styles.backRow}>
                <Text style={styles.backArrow}>←</Text>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.heading}>Choose a ride</Text>
              {routeDistance > 0 && (
                <Text style={styles.routeInfo}>{(routeDistance / 1000).toFixed(1)} km · {Math.round(routeDuration / 60)} min</Text>
              )}

              <View style={styles.tiersWrap}>
                {TIERS.map(tier => {
                  const tierBd = calculateFare(tier.id, routeDistance, routeDuration, pricingConfig);
                  const disabled = pricingConfig[tier.id]?.disabled;
                  const selected = selectedTier === tier.id && !disabled;
                  return (
                    <TouchableOpacity
                      key={tier.id}
                      style={[styles.tierCard, selected && styles.tierCardSelected, disabled && styles.tierCardDisabled]}
                      onPress={() => !disabled && setSelectedTier(tier.id)}
                      activeOpacity={disabled ? 1 : 0.8}
                    >
                      <View style={[styles.tierIcon, selected && styles.tierIconSelected]}>
                        <Text style={styles.tierEmoji}>{tier.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.tierRow}>
                          <Text style={[styles.tierName, disabled && styles.disabledText]}>{tier.name}</Text>
                          {disabled ? (
                            <View style={styles.unavailBadge}><Text style={styles.unavailText}>Not Available</Text></View>
                          ) : (
                            <Text style={styles.tierFare}>₱{tierBd.totalFare}</Text>
                          )}
                        </View>
                        <Text style={[styles.tierMeta, disabled && styles.disabledText]}>{tier.time} away · {tier.capacity}</Text>
                      </View>
                      {selected && <View style={styles.selDot}><View style={styles.selDotInner} /></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Fare breakdown */}
              <View style={styles.breakdownCard}>
                <Text style={styles.sectionLabel}>FARE BREAKDOWN</Text>
                {[
                  ['Base Fare', bd.baseFare],
                  [`Distance (${(routeDistance / 1000).toFixed(1)} km)`, bd.distanceFee],
                  [`Time (${Math.round(routeDuration / 60)} min)`, bd.timeFee],
                  ['Booking Fee', bd.bookingFee],
                  ...(voucherDiscount > 0 ? [[`Voucher (${appliedVoucher})`, -voucherDiscount]] : []),
                ].map(([label, val]) => (
                  <View key={label as string} style={styles.bdRow}>
                    <Text style={styles.bdLabel}>{label as string}</Text>
                    <Text style={[styles.bdVal, (val as number) < 0 && { color: '#10b981', fontWeight: '600' }]}>
                      {(val as number) < 0 ? '-' : ''}₱{Math.abs(val as number)}
                    </Text>
                  </View>
                ))}
                <View style={styles.bdDivider} />
                <View style={styles.bdRow}>
                  <Text style={styles.bdTotal}>Total Fare</Text>
                  <Text style={styles.bdTotal}>₱{finalFare}</Text>
                </View>
              </View>

              {/* Voucher */}
              <TouchableOpacity style={styles.voucherCard} onPress={() => setShowVoucherPicker(true)}>
                <View style={styles.voucherIconWrap}><Text style={{ fontSize: 16 }}>🏷️</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.voucherTitle}>{appliedVoucher ? `${appliedVoucher} applied` : 'Voucher'}</Text>
                  <Text style={styles.voucherSub}>{voucherDiscount > 0 ? `Saves ₱${voucherDiscount}` : 'Add or enter a voucher code'}</Text>
                </View>
                <View style={styles.voucherBtn}><Text style={styles.voucherBtnText}>{appliedVoucher ? 'Change' : 'Add'}</Text></View>
              </TouchableOpacity>

              {/* Payment */}
              <View style={styles.paymentRow}>
                <Text style={styles.paymentIcon}>💵</Text>
                <Text style={styles.paymentText}>Cash</Text>
              </View>
              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Sticky book button */}
            <View style={styles.bookBtnWrap}>
              <TouchableOpacity style={[styles.primaryBtn, isBooking && { opacity: 0.6 }]} onPress={handleBook} disabled={isBooking}>
                {isBooking ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Book Ride</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // ── SEARCHING ─────────────────────────────────────────────────────────────
    if (step === 'searching') {
      return (
        <View style={[styles.sheet, styles.centerSheet]}>
          <View style={styles.handle} />
          <View style={styles.ringWrap}>
            {[0, 1, 2].map(i => (
              <Animated.View
                key={i}
                style={[styles.ring, {
                  top: -i * 14, bottom: -i * 14, left: -i * 14, right: -i * 14,
                  opacity: ringAnims[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 0.1, 0] }),
                  transform: [{ scale: ringAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] }) }],
                }]}
              />
            ))}
            <View style={styles.searchCircle}>
              <Text style={styles.searchIcon}>🔍</Text>
            </View>
          </View>
          <Text style={styles.searchingTitle}>Finding your driver</Text>
          <Text style={styles.searchingSub}>Connecting to nearby drivers</Text>
          <View style={styles.dotsRow}>
            {dotAnims.map((anim, i) => (
              <Animated.View key={i} style={[styles.dot, { opacity: anim }]} />
            ))}
          </View>
          <TouchableOpacity style={styles.cancelPill} onPress={cancelBooking}>
            <Text style={styles.cancelPillText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── MATCHED ───────────────────────────────────────────────────────────────
    if (step === 'matched' && activeRider) {
      const etaMin = routeDuration ? Math.max(1, Math.round(routeDuration / 60)) : null;
      const distKm = routeDistance ? (routeDistance / 1000).toFixed(1) : null;
      const finalFare = fareBreakdown ? Math.max(0, fareBreakdown.totalFare - voucherDiscount) : 0;
      return (
        <View style={styles.matchedSheet}>
          <View style={styles.matchedHandle} />
          <View style={styles.matchedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchedStatusLbl}>ON THE WAY</Text>
              <Text style={styles.matchedEta}>{etaMin ? `Arriving in ${etaMin} min` : 'On the way to pickup'}</Text>
              {(distKm || destination) && <Text style={styles.matchedSub}>{[distKm && `${distKm} km`, destination].filter(Boolean).join(' · ')}</Text>}
            </View>
            <View style={styles.farePill}><Text style={styles.farePillText}>₱{finalFare}</Text></View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
            {/* Driver card */}
            <View style={styles.driverCard}>
              <View style={styles.driverLeft}>
                <View style={styles.driverAvatar}>
                  {activeRider.avatar_url
                    ? <Image source={{ uri: activeRider.avatar_url }} style={{ width: 48, height: 48, borderRadius: 99 }} />
                    : <Text style={styles.driverAvatarText}>{(activeRider.first_name?.[0] ?? 'R').toUpperCase()}</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{activeRider.first_name} {activeRider.last_name}</Text>
                  <View style={styles.ratingRow}>
                    <Text style={styles.star}>★</Text>
                    <Text style={styles.ratingText}>4.9 · 1.2k rides</Text>
                  </View>
                  {(activeRider.vehicle_make || activeRider.vehicle_plate) && (
                    <Text style={styles.vehiclePlate}>
                      {[activeRider.vehicle_make, activeRider.vehicle_model].filter(Boolean).join(' ')}
                      {activeRider.vehicle_plate ? ` · ${activeRider.vehicle_plate}` : ''}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={styles.chatBtn} onPress={() => { setShowChat(true); setUnreadCount(0); }}>
                  <Text style={styles.chatBtnIcon}>💬</Text>
                  {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chatBtn, !activeRider.phone && { opacity: 0.4 }]}
                  onPress={() => activeRider.phone && Linking.openURL(`tel:${activeRider.phone}`)}
                  disabled={!activeRider.phone}
                >
                  <Text style={styles.chatBtnIcon}>📞</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Vehicle photo */}
            {activeRider.vehicle_image_url && (
              <TouchableOpacity style={styles.vehiclePhotoCard} onPress={() => setShowVehiclePhoto(true)}>
                <Image source={{ uri: activeRider.vehicle_image_url }} style={styles.vehiclePhotoThumb} />
                <Text style={styles.vehiclePhotoLabel}>VEHICLE PHOTO</Text>
              </TouchableOpacity>
            )}

            {/* Fare breakdown */}
            {fareBreakdown && (
              <View style={styles.breakdownCard}>
                <Text style={styles.sectionLabel}>FARE BREAKDOWN</Text>
                {[
                  ['Base Fare', fareBreakdown.baseFare],
                  ['Distance Fee', fareBreakdown.distanceFee],
                  ['Time Fee', fareBreakdown.timeFee],
                  ['Booking Fee', fareBreakdown.bookingFee],
                  ...(voucherDiscount > 0 ? [[`Voucher (${appliedVoucher})`, -voucherDiscount]] : []),
                ].map(([label, val]) => (
                  <View key={label as string} style={styles.bdRow}>
                    <Text style={styles.bdLabel}>{label as string}</Text>
                    <Text style={[styles.bdVal, (val as number) < 0 && { color: '#10b981', fontWeight: '600' }]}>
                      {(val as number) < 0 ? '-' : ''}₱{Math.abs(val as number)}
                    </Text>
                  </View>
                ))}
                <View style={styles.bdDivider} />
                <View style={styles.bdRow}>
                  <Text style={styles.bdTotal}>Total</Text>
                  <Text style={styles.bdTotal}>₱{finalFare}</Text>
                </View>
              </View>
            )}

            {/* Payment */}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentIcon}>💵</Text>
              <Text style={styles.paymentText}>Cash · Prepare exact amount</Text>
            </View>

            {/* Driver reviews */}
            {riderReviews.length > 0 && (
              <View style={[styles.breakdownCard, { marginHorizontal: 20, marginBottom: 10 }]}>
                <Text style={styles.sectionLabel}>RECENT REVIEWS</Text>
                {riderReviews.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: i < riderReviews.length - 1 ? 12 : 0 }}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>{(r.user_name[0] ?? 'P').toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                        {[1,2,3,4,5].map(s => <Text key={s} style={{ fontSize: 10, color: s <= r.rating ? '#f59e0b' : '#e5e7eb' }}>★</Text>)}
                      </View>
                      {r.comment ? <Text style={styles.reviewComment}>"{r.comment}"</Text> : null}
                      <Text style={styles.reviewMeta}>{r.user_name} · {r.completed_at ? new Date(r.completed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Cancel */}
            {showCancelConfirm ? (
              <View style={styles.cancelConfirmCard}>
                <Text style={styles.cancelConfirmTitle}>Cancel this ride?</Text>
                <Text style={styles.cancelConfirmText}>You may be charged a small cancellation fee if the driver is already on the way.</Text>
                <View style={styles.cancelConfirmBtns}>
                  <TouchableOpacity style={styles.keepBtn} onPress={() => setShowCancelConfirm(false)}>
                    <Text style={styles.keepBtnText}>Keep Ride</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmCancelBtn} onPress={cancelBooking}>
                    <Text style={styles.confirmCancelText}>Yes, Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.cancelRideBtn} onPress={() => setShowCancelConfirm(true)}>
                <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      );
    }

    // ── REVIEW ────────────────────────────────────────────────────────────────
    if (step === 'review') {
      if (ratingSubmitted) {
        return (
          <View style={[styles.sheet, styles.centerSheet, { gap: 12 }]}>
            <View style={styles.checkCircle}><Text style={styles.checkIcon}>✓</Text></View>
            <Text style={styles.thankTitle}>Thanks for rating!</Text>
            <Text style={styles.thankSub}>Your feedback helps improve the community.</Text>
          </View>
        );
      }
      const riderName = completedRider ? `${completedRider.first_name || ''} ${completedRider.last_name || ''}`.trim() : 'Your Rider';
      return (
        <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={styles.handle} />
          <View style={styles.ratingHeader}>
            <View style={styles.ratingAvatar}>
              <Text style={styles.ratingAvatarText}>{(completedRider?.first_name?.[0] ?? 'R').toUpperCase()}</Text>
            </View>
            <Text style={styles.ratingTitle}>Rate your ride</Text>
            <Text style={styles.ratingSub}>How was your trip with <Text style={{ color: '#111827', fontWeight: '600' }}>{riderName}</Text>?</Text>
          </View>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} style={styles.starBtnLg}>
                <Text style={[styles.starLg, star <= rating ? styles.starLgActive : styles.starLgInactive]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && <Text style={styles.ratingLabelText}>{RATING_LABELS[rating]}</Text>}

          {rating >= 4 && (
            <View style={styles.tagsWrap}>
              {QUICK_TAGS.map(tag => {
                const active = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tag, active && styles.tagActive]}
                    onPress={() => setSelectedTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment (optional)..."
            placeholderTextColor="#d1d5db"
            value={ratingComment}
            onChangeText={setRatingComment}
            multiline
            numberOfLines={3}
          />

          <View style={styles.ratingActions}>
            <TouchableOpacity style={styles.skipBtn} onPress={resetToHome}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, rating === 0 && { opacity: 0.3 }]} onPress={handleSubmitRating} disabled={rating === 0}>
              <Text style={styles.submitBtnText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    return null;
  };

  const DRAWER_ITEMS = [
    { icon: '📋', label: 'News & Updates', onPress: () => Alert.alert('Coming soon') },
    { icon: '🔔', label: 'Notifications', onPress: () => Alert.alert('Coming soon') },
    { icon: '💬', label: 'Messages', onPress: () => Alert.alert('Coming soon') },
    { icon: '🕐', label: 'Trip History', onPress: () => { setShowDrawer(false); navigation.navigate('Profile'); } },
    { icon: '🏷️', label: 'My Vouchers', onPress: () => { setShowDrawer(false); setShowVoucherPicker(true); } },
    { icon: '👤', label: 'Profile', onPress: () => { setShowDrawer(false); navigation.navigate('Profile'); } },
  ];

  return (
    <View style={styles.container}>
      <OsmMap
        ref={mapRef}
        style={styles.map}
        onMapReady={() => setMapReady(true)}
        onPickupDragged={async (lat, lng) => {
          setPickupCoords({ lat, lng });
          const name = await reverseGeocode(lat, lng);
          setPickupLabel(name);
          if (destinationCoords) fetchRoute({ lat, lng }, destinationCoords);
        }}
        onDestDragged={async (lat, lng) => {
          setDestinationCoords({ lat, lng });
          const name = await reverseGeocode(lat, lng);
          setDestination(name);
          if (pickupCoords) fetchRoute(pickupCoords, { lat, lng });
        }}
      />

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarMapBtn} onPress={() => setShowDrawer(true)} activeOpacity={0.85}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarMapImg} />
        ) : (
          <View style={styles.avatarMapFallback}>
            <Text style={styles.avatarMapText}>{(profile.first_name?.[0] ?? '?').toUpperCase()}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Drag pin tooltip */}
      {(step === 'home' || step === 'select') && (
        <View style={styles.dragPinPill} pointerEvents="none">
          <Text style={styles.dragPinText}>
            {(step === 'select' || (step === 'home' && destinationCoords))
              ? 'Drag pin to adjust pickup or destination'
              : 'Drag pin to adjust pickup location'}
          </Text>
        </View>
      )}

      {/* Re-center on rider */}
      {step === 'matched' && lastRiderCoords && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() => lastRiderCoords && mapRef.current?.flyTo(lastRiderCoords.lat, lastRiderCoords.lng, 16)}
        >
          <Text style={styles.recenterIcon}>⊕</Text>
        </TouchableOpacity>
      )}

      {/* Map legend — matched step only */}
      {step === 'matched' && (
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>Your location</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>Destination</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>Rider</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendLine} />
            <Text style={styles.legendText}>Route</Text>
          </View>
        </View>
      )}

      {renderPanel()}

      {/* Drawer */}
      <Modal visible={showDrawer} transparent animationType="fade" onRequestClose={() => setShowDrawer(false)}>
        <View style={styles.drawerOverlay}>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} activeOpacity={1} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerAvatar}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.drawerAvatarImg} />
                ) : (
                  <Text style={styles.drawerAvatarText}>{(profile.first_name?.[0] ?? '?').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.drawerName}>{profile.first_name} {profile.last_name}</Text>
                <Text style={styles.drawerEmail}>{profile.email}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDrawer(false)} style={styles.drawerCloseBtn}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {DRAWER_ITEMS.map((item) => (
              <TouchableOpacity key={item.label} style={styles.drawerItem} onPress={item.onPress} activeOpacity={0.7}>
                <View style={styles.drawerItemIcon}>
                  <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                </View>
                <Text style={styles.drawerItemLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}

            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.drawerSignOut} onPress={() => { setShowDrawer(false); onSignOut(); }}>
              <Text style={styles.drawerSignOutText}>↗  Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rider confirm modal */}
      <Modal visible={!!pendingRider} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.handle} />
            <Text style={styles.confirmLabel}>DRIVER FOUND</Text>

            <View style={styles.confirmRiderRow}>
              <View style={styles.confirmAvatar}>
                {pendingRider?.avatar_url
                  ? <Image source={{ uri: pendingRider.avatar_url }} style={styles.confirmAvatarImg} />
                  : <Text style={styles.confirmAvatarText}>{(pendingRider?.first_name?.[0] ?? 'R').toUpperCase()}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmName}>{pendingRider?.first_name} {pendingRider?.last_name}</Text>
                <View style={styles.confirmBadgeRow}>
                  {pendingRider?.sex && <View style={styles.confirmBadge}><Text style={styles.confirmBadgeText}>{pendingRider.sex}</Text></View>}
                </View>
              </View>
            </View>

            {(pendingRider?.vehicle_make || pendingRider?.vehicle_plate) && (
              <View style={styles.confirmVehicleCard}>
                {pendingRider?.vehicle_type && (
                  <View style={styles.confirmVehicleRow}>
                    <Text style={styles.confirmVehicleLabel}>Type</Text>
                    <Text style={styles.confirmVehicleVal}>{pendingRider.vehicle_type}</Text>
                  </View>
                )}
                {(pendingRider?.vehicle_make || pendingRider?.vehicle_model) && (
                  <View style={styles.confirmVehicleRow}>
                    <Text style={styles.confirmVehicleLabel}>Vehicle</Text>
                    <Text style={styles.confirmVehicleVal}>{[pendingRider?.vehicle_make, pendingRider?.vehicle_model].filter(Boolean).join(' ')}</Text>
                  </View>
                )}
                {pendingRider?.vehicle_color && (
                  <View style={styles.confirmVehicleRow}>
                    <Text style={styles.confirmVehicleLabel}>Color</Text>
                    <Text style={styles.confirmVehicleVal}>{pendingRider.vehicle_color}</Text>
                  </View>
                )}
                {pendingRider?.vehicle_plate && (
                  <View style={styles.confirmVehicleRow}>
                    <Text style={styles.confirmVehicleLabel}>Plate</Text>
                    <Text style={[styles.confirmVehicleVal, { fontFamily: 'monospace', letterSpacing: 2 }]}>{pendingRider.vehicle_plate}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => {
                if (currentRideId) {
                  supabase.channel('rides').send({ type: 'broadcast', event: 'CANCEL_RIDE', payload: { rideId: currentRideId } });
                  supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRideId);
                }
                setPendingRider(null);
                resetToHome();
              }}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmAcceptBtn} onPress={() => {
                if (!pendingRider) return;
                const rider = pendingRider;
                setActiveRider(rider);
                setPendingRider(null);
                const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
                setFareBreakdown(bd);
                setStep('matched');
                saveRideState({ step: 'matched', activeRider: rider });
                if (rider.last_lat && rider.last_lng) {
                  mapRef.current?.setRiderLocation(rider.last_lat, rider.last_lng);
                  setLastRiderCoords({ lat: rider.last_lat, lng: rider.last_lng });
                }
                if (currentRideId) {
                  supabase.channel('rides').send({ type: 'broadcast', event: 'USER_CONFIRMED_RIDER', payload: { rideId: currentRideId } });
                }
              }}>
                <Text style={styles.confirmAcceptText}>Accept Rider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Vehicle photo modal */}
      <Modal visible={showVehiclePhoto} transparent animationType="fade" onRequestClose={() => setShowVehiclePhoto(false)}>
        <TouchableOpacity style={styles.vehiclePhotoOverlay} activeOpacity={1} onPress={() => setShowVehiclePhoto(false)}>
          {activeRider?.vehicle_image_url && (
            <Image source={{ uri: activeRider.vehicle_image_url }} style={styles.vehiclePhotoImg} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Voucher modal */}
      <Modal visible={showVoucherPicker} transparent animationType="slide" onRequestClose={() => setShowVoucherPicker(false)}>
        <View style={styles.voucherOverlay}>
          <TouchableOpacity style={styles.voucherBackdrop} onPress={() => setShowVoucherPicker(false)} />
          <View style={styles.voucherModal}>
            <View style={styles.voucherModalHeader}>
              <Text style={styles.voucherModalTitle}>Vouchers</Text>
              <TouchableOpacity onPress={() => setShowVoucherPicker(false)} style={styles.voucherCloseBtn}>
                <Text style={styles.voucherCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.voucherInputRow}>
              <TextInput
                style={styles.voucherInput}
                placeholder="Enter code"
                placeholderTextColor="#9ca3af"
                value={voucherCode}
                onChangeText={t => setVoucherCode(t.toUpperCase())}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.voucherAddBtn}
                onPress={async () => {
                  if (!voucherCode.trim()) return;
                  const { userVoucher, error } = await addVoucherToUser(profile.id, voucherCode);
                  if (error) { setVoucherMsg(error); return; }
                  if (userVoucher) {
                    setUserVouchers(prev => [userVoucher, ...prev.filter(v => v.id !== userVoucher.id)]);
                    setVoucherCode('');
                    setVoucherMsg('Voucher added to your list!');
                  }
                }}
              >
                <Text style={styles.voucherAddBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {!!voucherMsg && <Text style={styles.voucherMsgText}>{voucherMsg}</Text>}

            {userVouchers.length > 0 && (
              <ScrollView style={{ maxHeight: 260, marginTop: 8 }} showsVerticalScrollIndicator={false}>
                {appliedVoucher && (
                  <TouchableOpacity
                    style={styles.voucherListItem}
                    onPress={() => {
                      setAppliedVoucher(null);
                      setVoucherDiscount(0);
                      setSelectedVoucherUv(null);
                      setVoucherMsg('');
                      setShowVoucherPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voucherListCode}>No voucher</Text>
                    </View>
                    {!appliedVoucher && <Text style={styles.voucherListCheck}>✓</Text>}
                  </TouchableOpacity>
                )}
                {userVouchers.map(uv => {
                  const bd = calculateFare(selectedTier, routeDistance, routeDuration, pricingConfig);
                  const q = uv.voucher ? quoteVoucher(uv.voucher, bd) : null;
                  const isSelected = selectedVoucherUv?.id === uv.id;
                  const isInvalid = !!q?.reason;
                  return (
                    <TouchableOpacity
                      key={uv.id}
                      style={[styles.voucherListItem, isSelected && styles.voucherListItemSelected, isInvalid && { opacity: 0.5 }]}
                      onPress={() => {
                        if (isInvalid || !q || !uv.voucher) return;
                        setSelectedVoucherUv(uv);
                        setAppliedVoucher(uv.code);
                        setVoucherDiscount(q.discount);
                        setShowVoucherPicker(false);
                      }}
                      disabled={isInvalid}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voucherListCode}>{uv.code}</Text>
                        <Text style={styles.voucherListDesc}>
                          {uv.voucher?.discount_type === 'percentage'
                            ? `${uv.voucher.discount_value}% off`
                            : `₱${uv.voucher?.discount_value} off`}
                          {q && !isInvalid ? ` · saves ₱${q.discount}` : ''}
                        </Text>
                        {isInvalid && <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 1 }}>{q?.reason}</Text>}
                      </View>
                      {isSelected && <Text style={styles.voucherListCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {appliedVoucher && (
              <TouchableOpacity
                style={styles.removeVoucherBtn}
                onPress={() => {
                  setAppliedVoucher(null);
                  setVoucherDiscount(0);
                  setSelectedVoucherUv(null);
                  setVoucherCode('');
                  setVoucherMsg('');
                  setShowVoucherPicker(false);
                }}
              >
                <Text style={styles.removeVoucherText}>Remove voucher</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  map: { flex: 1 },

  // Sheet base
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 0, paddingBottom: 36,
    maxHeight: '68%',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24,
    shadowOffset: { width: 0, height: -2 }, elevation: 20,
  },
  centerSheet: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },

  handleWrap: { paddingTop: 14, paddingBottom: 8, alignItems: 'center' },
  handle: { width: 40, height: 5, backgroundColor: '#e5e7eb', borderRadius: 99 },

  // Home header
  homeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  heading: { fontSize: 26, fontWeight: '700', color: '#030712', letterSpacing: -0.5, lineHeight: 32 },
  hint: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  chevronBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chevronText: { fontSize: 18, color: '#9ca3af', lineHeight: 24 },

  // Expanded area
  expandedArea: { maxHeight: 240, marginBottom: 8 },
  suggestionBox: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden', marginBottom: 4 },
  suggRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  suggBorder: { borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  suggLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  suggPin: { fontSize: 13 },
  suggName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  suggSub: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  starBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  starIcon: { fontSize: 16, color: '#d1d5db' },
  starIconFilled: { color: '#f59e0b' },
  searchingText: { textAlign: 'center', fontSize: 12, color: '#9ca3af', padding: 10 },
  noResults: { textAlign: 'center', fontSize: 12, color: '#9ca3af', paddingVertical: 12 },
  quickItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 10, gap: 12 },
  quickItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  quickName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  quickSub: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  removeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 13, color: '#d1d5db' },
  sectionLbl: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 4, marginTop: 8, paddingHorizontal: 4 },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 8 },

  // Dual input
  inputBox: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  inputRowActive: { backgroundColor: '#fff' },
  inputRowInactive: { backgroundColor: '#f9fafb' },
  dotBlack: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#030712' },
  dotGreen: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#10b981' },
  inputField: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827', paddingVertical: 0 },
  inputStaticText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  connector: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, backgroundColor: '#f9fafb', height: 12 },
  connDot: { width: 2, height: 2, borderRadius: 99, backgroundColor: '#d1d5db', marginRight: 2 },
  connLine: { flex: 1, height: 1, backgroundColor: '#f3f4f6', marginLeft: 4 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#030712', borderRadius: 16, paddingVertical: 17,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 4, marginBottom: 4,
  },
  primaryBtnInactive: { backgroundColor: '#f3f4f6', shadowOpacity: 0, elevation: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  primaryBtnTextInactive: { color: '#9ca3af' },
  // Map overlay buttons
  avatarMapBtn: {
    position: 'absolute', top: 52, right: 16,
    width: 46, height: 46, borderRadius: 99,
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  avatarMapImg: { width: '100%', height: '100%', borderRadius: 99 },
  avatarMapFallback: {
    width: '100%', height: '100%', borderRadius: 99,
    backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center',
  },
  avatarMapText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Drag pin tooltip
  dragPinPill: {
    position: 'absolute', bottom: 210, alignSelf: 'center',
    backgroundColor: 'rgba(3,7,18,0.82)', borderRadius: 99,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  dragPinText: { fontSize: 12, color: '#fff', fontWeight: '500' },

  // Re-center button
  recenterBtn: {
    position: 'absolute', bottom: '32%', right: 16,
    width: 44, height: 44, borderRadius: 99,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  recenterIcon: { fontSize: 22, color: '#2563eb' },

  legend: {
    position: 'absolute', top: 80, left: 12,
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 12, padding: 10, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 6,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 99, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  legendLine: { width: 18, height: 3, borderRadius: 99, backgroundColor: '#030712' },
  legendText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  // Rider confirm modal
  confirmOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  confirmSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
  },
  confirmLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 16 },
  confirmRiderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  confirmAvatar: {
    width: 64, height: 64, borderRadius: 99,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: 2, borderColor: '#e5e7eb',
  },
  confirmAvatarImg: { width: 64, height: 64, borderRadius: 99 },
  confirmAvatarText: { fontSize: 24, fontWeight: '700', color: '#374151' },
  confirmName: { fontSize: 17, fontWeight: '700', color: '#030712', marginBottom: 6 },
  confirmBadgeRow: { flexDirection: 'row', gap: 6 },
  confirmBadge: { backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  confirmBadgeText: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  confirmVehicleCard: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6', gap: 10 },
  confirmVehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confirmVehicleLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, textTransform: 'uppercase' },
  confirmVehicleVal: { fontSize: 13, fontWeight: '600', color: '#030712' },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmCancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  confirmAcceptBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, backgroundColor: '#030712', alignItems: 'center' },
  confirmAcceptText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Vehicle photo
  vehiclePhotoCard: { marginHorizontal: 20, marginBottom: 10, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f3f4f6', position: 'relative' },
  vehiclePhotoThumb: { width: '100%', height: 130 },
  vehiclePhotoLabel: { position: 'absolute', bottom: 8, left: 12, fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 2 },
  vehiclePhotoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  vehiclePhotoImg: { width: '90%', height: '60%' },

  // Reviews
  reviewAvatar: { width: 28, height: 28, borderRadius: 99, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  reviewComment: { fontSize: 13, color: '#374151', lineHeight: 18, marginBottom: 2 },
  reviewMeta: { fontSize: 11, color: '#9ca3af' },

  // Drawer
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  drawerBackdrop: { flex: 1 },
  drawer: {
    width: '78%', backgroundColor: '#fff',
    paddingTop: 56, paddingBottom: 36,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginBottom: 8,
  },
  drawerAvatar: {
    width: 48, height: 48, borderRadius: 99,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  drawerAvatarImg: { width: 48, height: 48, borderRadius: 99 },
  drawerAvatarText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  drawerName: { fontSize: 15, fontWeight: '700', color: '#030712' },
  drawerEmail: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  drawerCloseBtn: {
    width: 32, height: 32, borderRadius: 99,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
  drawerCloseText: { fontSize: 13, color: '#6b7280' },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  drawerItemIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  drawerItemLabel: { fontSize: 15, fontWeight: '500', color: '#030712' },
  drawerSignOut: { paddingHorizontal: 20, paddingVertical: 16 },
  drawerSignOutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  // Select step
  selectInner: { flex: 1, flexDirection: 'column' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backArrow: { fontSize: 20, color: '#6b7280' },
  backText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  routeInfo: { fontSize: 12, color: '#9ca3af', marginBottom: 2, marginTop: -4 },
  tiersWrap: { gap: 10, marginTop: 12, marginBottom: 16 },
  tierCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#f3f4f6', backgroundColor: '#f9fafb' },
  tierCardSelected: { borderColor: '#030712', backgroundColor: '#f9fafb' },
  tierCardDisabled: { opacity: 0.45 },
  tierIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
  tierIconSelected: { backgroundColor: '#030712' },
  tierEmoji: { fontSize: 22 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  tierName: { fontSize: 15, fontWeight: '500', color: '#030712' },
  tierFare: { fontSize: 16, fontWeight: '700', color: '#030712' },
  tierMeta: { fontSize: 12, color: '#9ca3af' },
  disabledText: { color: '#d1d5db' },
  unavailBadge: { backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  unavailText: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  selDot: { width: 16, height: 16, borderRadius: 99, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  selDotInner: { width: 6, height: 6, borderRadius: 99, backgroundColor: '#fff' },

  // Fare breakdown (shared)
  breakdownCard: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6', marginHorizontal: 0 },
  sectionLabel: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 10 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bdLabel: { fontSize: 13, color: '#6b7280' },
  bdVal: { fontSize: 13, color: '#6b7280' },
  bdDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  bdTotal: { fontSize: 14, fontWeight: '700', color: '#030712' },

  // Voucher card
  voucherCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  voucherIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  voucherTitle: { fontSize: 14, fontWeight: '500', color: '#030712' },
  voucherSub: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  voucherBtn: { backgroundColor: '#030712', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  voucherBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Payment
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, marginBottom: 4, borderWidth: 1, borderColor: '#f3f4f6', marginHorizontal: 0 },
  paymentIcon: { fontSize: 18 },
  paymentText: { fontSize: 14, fontWeight: '600', color: '#030712' },

  // Book button sticky
  bookBtnWrap: { paddingTop: 12, paddingBottom: 4 },
  signOutRow: { alignItems: 'center', marginTop: 10 },
  signOutText: { fontSize: 12, color: '#d1d5db' },

  // Searching
  ringWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 28, marginTop: 8 },
  ring: { position: 'absolute', borderRadius: 99, borderWidth: 1, borderColor: 'rgba(3,7,18,0.1)' },
  searchCircle: { width: 72, height: 72, borderRadius: 99, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8, zIndex: 10 },
  searchIcon: { fontSize: 26 },
  searchingTitle: { fontSize: 22, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  searchingSub: { fontSize: 14, color: '#9ca3af', marginTop: 6, marginBottom: 20 },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dot: { width: 6, height: 6, borderRadius: 99, backgroundColor: '#d1d5db' },
  cancelPill: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 99, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelPillText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  // Matched sheet
  matchedSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: -2 }, elevation: 20,
    maxHeight: '68%',
  },
  matchedHandle: { width: 40, height: 5, backgroundColor: '#e5e7eb', borderRadius: 99, alignSelf: 'center', marginTop: 12 },
  matchedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  matchedStatusLbl: { fontSize: 10, fontWeight: '700', color: '#10b981', letterSpacing: 1.5, marginBottom: 2 },
  matchedEta: { fontSize: 20, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  matchedSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  farePill: { backgroundColor: '#030712', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  farePillText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Driver card (inside matched)
  driverCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 16, marginBottom: 12, backgroundColor: '#f9fafb', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  driverLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  driverAvatar: { width: 48, height: 48, borderRadius: 99, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  driverAvatarText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  driverName: { fontSize: 15, fontWeight: '700', color: '#030712' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  star: { fontSize: 12, color: '#f59e0b' },
  ratingText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  vehiclePlate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  chatBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  chatBtnIcon: { fontSize: 18 },
  badge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 99, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  // Matched breakdown/payment - add horizontal margin
  cancelRideBtn: { marginHorizontal: 20, marginTop: 8, paddingVertical: 15, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  cancelRideBtnText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  cancelConfirmCard: { marginHorizontal: 20, marginTop: 8, backgroundColor: '#fff5f5', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#fee2e2' },
  cancelConfirmTitle: { fontSize: 15, fontWeight: '700', color: '#dc2626', marginBottom: 6 },
  cancelConfirmText: { fontSize: 12, color: '#6b7280', lineHeight: 18, marginBottom: 14 },
  cancelConfirmBtns: { flexDirection: 'row', gap: 10 },
  keepBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  keepBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  confirmCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' },
  confirmCancelText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Review
  ratingHeader: { alignItems: 'center', marginBottom: 20, paddingTop: 8 },
  ratingAvatar: { width: 56, height: 56, borderRadius: 99, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ratingAvatarText: { fontSize: 22, fontWeight: '700', color: '#374151' },
  ratingTitle: { fontSize: 22, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  ratingSub: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 8 },
  starBtnLg: { padding: 4 },
  starLg: { fontSize: 36 },
  starLgActive: { color: '#f59e0b' },
  starLgInactive: { color: '#e5e7eb' },
  ratingLabelText: { textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 16 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  tagActive: { backgroundColor: '#030712', borderColor: '#030712' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tagTextActive: { color: '#fff' },
  commentInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#111827', marginBottom: 16, textAlignVertical: 'top', minHeight: 80 },
  ratingActions: { flexDirection: 'row', gap: 10 },
  skipBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center' },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  submitBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#030712', alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  checkCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  checkIcon: { fontSize: 28, color: '#fff' },
  thankTitle: { fontSize: 22, fontWeight: '700', color: '#030712', letterSpacing: -0.3 },
  thankSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  // Chat
  chatContainer: { position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 50 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  chatBackBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chatBackText: { fontSize: 22, color: '#030712' },
  chatAvatar: { width: 36, height: 36, borderRadius: 99, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  chatName: { fontSize: 14, fontWeight: '700', color: '#030712' },
  chatRole: { fontSize: 9, color: '#9ca3af', fontWeight: '700', letterSpacing: 1 },
  chatMessages: { flex: 1, backgroundColor: '#f6f7f9' },
  chatMsgContent: { padding: 16, gap: 8 },
  chatEmpty: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 32 },
  msgRow: { flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  msgBubbleMe: { backgroundColor: '#10b981' },
  msgBubbleThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6' },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextThem: { color: '#111827' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  chatInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 99, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },

  // Voucher modal
  voucherOverlay: { flex: 1, justifyContent: 'flex-end' },
  voucherBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  voucherModal: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40 },
  voucherModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  voucherModalTitle: { fontSize: 18, fontWeight: '700', color: '#030712' },
  voucherCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  voucherCloseBtnText: { fontSize: 14, color: '#374151' },
  voucherInputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  voucherInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#030712' },
  voucherAddBtn: { backgroundColor: '#030712', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center' },
  voucherAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  voucherMsgText: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  removeVoucherBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' },
  removeVoucherText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  voucherListItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  voucherListItemSelected: { backgroundColor: '#ecfdf5' },
  voucherListCode: { fontSize: 13, fontWeight: '700', color: '#030712' },
  voucherListDesc: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  voucherListCheck: { fontSize: 16, color: '#10b981', marginLeft: 8 },
});
