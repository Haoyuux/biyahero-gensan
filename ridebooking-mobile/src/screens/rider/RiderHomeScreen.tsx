import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  ScrollView, Modal, KeyboardAvoidingView, Platform, TextInput,
  useWindowDimensions, Image, BackHandler,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OsmMap, { OsmMapHandle } from '../../components/OsmMap';
import { supabase, Profile } from '../../lib/supabase';
import { ChatMessage, fetchMessages, sendMessage, subscribeToMessages } from '../../lib/chatService';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

interface Props {
  profile: Profile;
  onSignOut: () => void;
}

const RIDER_RIDE_KEY = 'biyahero_rider_ride';

export default function RiderHomeScreen({ profile, onSignOut }: Props) {
  const { width } = useWindowDimensions();
  const fs = (base: number) => Math.round(base * (width / 390)); // responsive font scale
  const mapRef = useRef<OsmMapHandle>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const isOnlineRef = useRef(profile.is_online ?? false);
  const acceptedRideIdRef = useRef<string | null>(null);

  const [isOnline, setIsOnline] = useState(profile.is_online ?? false);
  const [mapReady, setMapReady] = useState(false);

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

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  const saveRiderRide = async (request: any, accepted: boolean) => {
    try {
      await AsyncStorage.setItem(RIDER_RIDE_KEY, JSON.stringify({ currentRequest: request, requestAccepted: accepted }));
    } catch { /* silent */ }
  };

  const clearRiderRide = async () => {
    try { await AsyncStorage.removeItem(RIDER_RIDE_KEY); } catch { /* silent */ }
  };

  const registerPushToken = async () => {
    try {
      if (Platform.OS === 'web') return; // Push not supported on web

      const { status: existing } = await Notifications.getPermissionsAsync();
      const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;
      if (finalStatus !== 'granted') {
        console.warn('registerPushToken: permission not granted');
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
      if (error) console.warn('registerPushToken save error:', error.message);
    } catch (e) {
      console.warn('registerPushToken:', e);
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

  // GPS
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        async (loc) => {
          const { latitude, longitude } = loc.coords;
          if (mapReady) mapRef.current?.setUserLocation(latitude, longitude);
          if (isOnlineRef.current) {
            await supabase.from('profiles')
              .update({ last_lat: latitude, last_lng: longitude })
              .eq('id', profile.id);
            if (acceptedRideIdRef.current) {
              supabase.channel('rides').send({
                type: 'broadcast', event: 'RIDER_LOCATION',
                payload: { rideId: acceptedRideIdRef.current, lat: latitude, lng: longitude },
              });
            }
          }
        },
      );

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mapReady) {
        mapRef.current?.setUserLocation(loc.coords.latitude, loc.coords.longitude);
        mapRef.current?.flyTo(loc.coords.latitude, loc.coords.longitude, 15);
      }
    })();
    return () => { try { locationSub.current?.remove(); } catch { /* web compat */ } };
  }, [mapReady]);

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
      } catch {
        await AsyncStorage.removeItem(RIDER_RIDE_KEY);
      }
    })();
  }, []);

  // Rides channel
  useEffect(() => {
    if (!isOnline) return;
    const ch = supabase.channel('rides');

    ch.on('broadcast', { event: 'REQUEST_RIDE' }, ({ payload }) => {
      setRequestQueue(prev => {
        if (prev.some(r => r.rideId === payload.rideId)) return prev;
        return [...prev, payload];
      });
    });

    ch.on('broadcast', { event: 'CANCEL_RIDE' }, ({ payload }) => {
      const { rideId } = payload;
      setRequestQueue(prev => prev.filter(r => r.rideId !== rideId));
      if (acceptedRideIdRef.current === rideId) {
        acceptedRideIdRef.current = null;
        setRequestAccepted(false);
        setCurrentRequest(null);
        setActiveRide(null);
        setHasRequest(false);
        setMessages([]);
      } else if (currentRequest?.rideId === rideId) {
        setHasRequest(false);
        setCurrentRequest(null);
      }
    });

    ch.on('broadcast', { event: 'RIDE_ACCEPTED' }, ({ payload }) => {
      if (acceptedRideIdRef.current !== payload.rideId) {
        setRequestQueue(prev => prev.filter(r => r.rideId !== payload.rideId));
      }
    });

    ch.on('broadcast', { event: 'USER_CONFIRMED_RIDER' }, ({ payload }) => {
      if (acceptedRideIdRef.current === payload.rideId) {
        setActiveRide(currentRequest);
        setRequestAccepted(true);
      }
    });

    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isOnline, currentRequest]);

  // Pop from queue
  useEffect(() => {
    if (requestQueue.length > 0 && !hasRequest && !requestAccepted) {
      setCurrentRequest(requestQueue[0]);
      setHasRequest(true);
      setRequestQueue(prev => prev.slice(1));
    }
  }, [requestQueue, hasRequest, requestAccepted]);

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

  const toggleOnline = async (value: boolean) => {
    isOnlineRef.current = value;
    setIsOnline(value);
    if (!value) {
      setHasRequest(false);
      setRequestQueue([]);
      await unregisterPushToken();
    } else {
      await registerPushToken();
    }
    await supabase.from('profiles').update({ is_online: value }).eq('id', profile.id);
  };

  const handleAccept = async () => {
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

    // Show pickup location on map
    const pickupCoords = currentRequest.pickup?.coords;
    if (pickupCoords) {
      mapRef.current?.setDestination(pickupCoords.lat, pickupCoords.lng, currentRequest.pickup?.label ?? 'Pickup');
      mapRef.current?.flyTo(pickupCoords.lat, pickupCoords.lng, 15);
    }

    supabase.channel('rides').send({
      type: 'broadcast', event: 'RIDE_ACCEPTED',
      payload: { rideId, rider: profile },
    });
  };

  const handleDecline = () => {
    setHasRequest(false);
    setCurrentRequest(null);
  };

  const handleCancelRide = async () => {
    if (!acceptedRideIdRef.current) return;
    const rideId = acceptedRideIdRef.current;
    supabase.channel('rides').send({
      type: 'broadcast', event: 'RIDE_CANCELLED',
      payload: { rideId, riderId: profile.id },
    });
    await supabase.from('rides')
      .update({ status: 'pending', rider_id: null })
      .eq('id', rideId);
    acceptedRideIdRef.current = null;
    clearRiderRide();
    setRequestAccepted(false);
    setActiveRide(null);
    setCurrentRequest(null);
    setMessages([]);
    setRideStatus('going_to_pickup');
    mapRef.current?.clearDestination();
    mapRef.current?.clearRoute();
  };

  const handleArrivedAtPickup = () => {
    if (!acceptedRideIdRef.current) return;
    supabase.channel('rides').send({
      type: 'broadcast', event: 'RIDER_ARRIVED',
      payload: { rideId: acceptedRideIdRef.current },
    });
    setRideStatus('picked_up');

    // Switch map to show dropoff location
    const dropoffCoords = activeRide?.dropoff?.coords;
    if (dropoffCoords) {
      mapRef.current?.clearDestination();
      mapRef.current?.setDestination(dropoffCoords.lat, dropoffCoords.lng, activeRide?.dropoff?.label ?? 'Dropoff');
      mapRef.current?.flyTo(dropoffCoords.lat, dropoffCoords.lng, 15);
    }
  };

  const handleCompleteRide = async () => {
    if (!acceptedRideIdRef.current) return;
    const rideId = acceptedRideIdRef.current;
    supabase.channel('rides').send({
      type: 'broadcast', event: 'RIDE_COMPLETED',
      payload: { rideId, rider: profile },
    });
    await supabase.from('rides')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', rideId);
    acceptedRideIdRef.current = null;
    clearRiderRide();
    setRequestAccepted(false);
    setActiveRide(null);
    setCurrentRequest(null);
    setMessages([]);
    setRideStatus('going_to_pickup');
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

  return (
    <View style={styles.container}>
      <OsmMap ref={mapRef} style={styles.map} onMapReady={() => setMapReady(true)} />

      {/* Active ride sheet */}
      {requestAccepted && activeRide ? (
        <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>
          <View style={styles.handle} />
          <Text style={styles.sectionLabel}>ACTIVE RIDE</Text>

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

          {rideStatus === 'going_to_pickup' ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleArrivedAtPickup}>
              <Text style={styles.primaryBtnText}>I Arrived at Pickup</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#10b981' }]} onPress={handleCompleteRide}>
              <Text style={styles.primaryBtnText}>Complete Ride ✓</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelRideBtn}
            onPress={() =>
              Alert.alert(
                'Cancel ride?',
                'The passenger will be notified and the ride will go back to searching.',
                [
                  { text: 'Keep Ride', style: 'cancel' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: handleCancelRide },
                ],
              )
            }
          >
            <Text style={styles.cancelRideBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        /* Default rider sheet */
        <View style={styles.sheet}>
          <View style={styles.handle} />
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

          <View style={styles.onlineCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.onlineDot, isOnline && styles.onlineDotActive]} />
              <View>
                <Text style={styles.onlineLabel}>{isOnline ? 'You are Online' : 'You are Offline'}</Text>
                <Text style={styles.onlineSub}>{isOnline ? 'Accepting ride requests' : 'Go online to accept rides'}</Text>
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

          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>Toggle online to start receiving ride requests.</Text>
            </View>
          )}

        </View>
      )}

      {/* Profile button — top right */}
      <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfileMenu(true)} activeOpacity={0.85}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.profileBtnImg} />
        ) : (
          <Text style={styles.profileBtnText}>{(profile.first_name?.[0] ?? 'R').toUpperCase()}</Text>
        )}
      </TouchableOpacity>

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
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
    maxHeight: '55%',
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
