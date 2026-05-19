import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform, Image,
  Modal, ScrollView, SafeAreaView,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const LAST_UPDATED = 'May 10, 2026';

function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <View style={modal.headerIcon}><Text style={modal.headerIconText}>📄</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={modal.headerTitle}>Terms & Conditions</Text>
            <Text style={modal.headerSub}>Biyahero Online</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={modal.body} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={modal.lastUpdated}>Last updated: {LAST_UPDATED}</Text>

          <Text style={modal.para}>
            Welcome to Biyahero Online. By accessing or using our ride-booking application and
            services, you agree to be bound by these Terms & Conditions. If you do not agree,
            please do not use our services. Access requires a valid Google account for sign-in.
          </Text>

          <Section title="🏍️ Available Ride Tiers">
            <Bullet>Motorcycle — 1 passenger, lowest base fare</Bullet>
            <Bullet>Economy Car — up to 4 passengers, mid-range fare</Bullet>
            <Bullet>Premium Car — up to 4 passengers, premium fare</Bullet>
            <Bullet>Fares are calculated using base fare + per-km rate + per-minute rate + booking fee</Bullet>
            <Bullet>Voucher codes may be applied for eligible discounts on the total fare</Bullet>
          </Section>

          <Section title="👥 User Responsibilities">
            <Bullet>Provide accurate pickup and dropoff locations</Bullet>
            <Bullet>Treat drivers with respect and courtesy</Bullet>
            <Bullet>Pay for rides in cash directly to the driver upon completion</Bullet>
            <Bullet>Do not misuse voucher codes or attempt to exploit discount systems</Bullet>
            <Bullet>Not use the service for any illegal or unauthorized purpose</Bullet>
            <Bullet>Maintain the security of your Google account used to sign in</Bullet>
          </Section>

          <Section title="🚗 Driver (Rider) Terms">
            <Bullet>Must complete the platform's onboarding and document verification process</Bullet>
            <Bullet>Account activation requires admin approval; status may be pending, approved, or rejected</Bullet>
            <Bullet>Must possess a valid driver's license and current vehicle registration</Bullet>
            <Bullet>Maintain required insurance coverage for ride-hailing operations</Bullet>
            <Bullet>Accept rides only when legally permitted to drive</Bullet>
            <Bullet>Follow all traffic laws and regulations</Bullet>
            <Bullet>Submit daily booking fee remittances through the platform with valid receipt proof</Bullet>
          </Section>

          <Section title="💳 Payments & Booking Fees">
            <Bullet>Ride fares are paid in cash directly to the driver upon ride completion</Bullet>
            <Bullet>The app calculates the fare based on distance, duration, and selected tier</Bullet>
            <Bullet>A booking fee is deducted from the driver's earnings per ride</Bullet>
            <Bullet>Drivers are required to remit collected booking fees to the platform daily</Bullet>
            <Bullet>Remittances must be submitted with a receipt photo via the app</Bullet>
            <Bullet>Pricing rates are set by the platform and may be updated by administrators</Bullet>
          </Section>

          <Section title="💬 In-App Messaging">
            <Text style={modal.para}>
              Real-time in-app chat is available between users and drivers during an active ride.
              Messages are stored and may be reviewed for safety or dispute resolution.
              Misuse, harassment, or inappropriate communication is grounds for account suspension.
            </Text>
          </Section>

          <Section title="🚫 Cancellation Policy">
            <Bullet>Users may cancel a ride before driver arrival</Bullet>
            <Bullet>Cancellation after driver arrival may be subject to a fee</Bullet>
            <Bullet>Drivers may cancel only for valid safety reasons</Bullet>
            <Bullet>Repeated cancellations may result in account restrictions</Bullet>
          </Section>

          <Section title="⚠️ Limitation of Liability">
            <Text style={modal.para}>
              Biyahero Online acts as a platform connecting users with independent drivers.
              We are not responsible for the actions, negligence, or conduct of any driver or user.
              Users and drivers use the platform at their own risk.
            </Text>
          </Section>

          <Section title="🚫 Prohibited Activities">
            <Bullet>Harassment, discrimination, or abusive behavior toward drivers or users</Bullet>
            <Bullet>Bypassing the app to arrange rides outside the platform</Bullet>
            <Bullet>Falsifying remittance receipts or booking fee records</Bullet>
            <Bullet>Using the service under the influence of alcohol or drugs</Bullet>
            <Bullet>Transporting illegal items or substances</Bullet>
            <Bullet>Submitting fraudulent documents during driver verification</Bullet>
          </Section>

          <Section title="📞 Contact Us">
            <Bullet>Email: support@biyahero.online</Bullet>
            <Bullet>Phone: +63 945 110 6077</Bullet>
            <Bullet>Address: General Santos City, Philippines</Bullet>
          </Section>
        </ScrollView>
        <View style={modal.footer}>
          <TouchableOpacity style={modal.agreeBtn} onPress={onClose}>
            <Text style={modal.agreeBtnText}>I Agree</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PrivacyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[modal.container, { backgroundColor: '#fff' }]}>
        <View style={[modal.header, { backgroundColor: '#059669' }]}>
          <View style={modal.headerIcon}><Text style={modal.headerIconText}>🔒</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={modal.headerTitle}>Privacy Policy</Text>
            <Text style={modal.headerSub}>Biyahero Online</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={modal.body} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={modal.lastUpdated}>Last updated: {LAST_UPDATED}</Text>

          <Text style={modal.para}>
            Biyahero Online is committed to protecting your privacy. This Privacy Policy explains
            how we collect, use, disclose, and safeguard your information when you use our
            ride-booking application in General Santos City, Philippines.
          </Text>

          <Section title="👥 Information We Collect">
            <Bullet>Google Account Data: Name, email address, and profile photo via Google Sign-In</Bullet>
            <Bullet>Profile Information: Phone number, date of birth, and details you provide</Bullet>
            <Bullet>Location Data: GPS coordinates for ride matching, routing, and map display</Bullet>
            <Bullet>Trip Data: Pickup/dropoff labels, ride type, fare breakdown, and driver ratings</Bullet>
            <Bullet>Driver Documents: License photos, vehicle registration, and profile photos</Bullet>
            <Bullet>Chat Messages: In-app messages exchanged during active rides</Bullet>
          </Section>

          <Section title="👁️ How We Use Your Information">
            <Bullet>To authenticate your identity via Google Sign-In</Bullet>
            <Bullet>To match you with nearby available drivers</Bullet>
            <Bullet>To calculate and display ride fares accurately</Bullet>
            <Bullet>To facilitate real-time in-app chat between users and drivers</Bullet>
            <Bullet>To process and review driver remittance submissions</Bullet>
            <Bullet>To verify driver eligibility through document review</Bullet>
            <Bullet>To send notifications about ride status updates</Bullet>
          </Section>

          <Section title="🗄️ Third-Party Services We Use">
            <Bullet>Google (OAuth): Handles account authentication</Bullet>
            <Bullet>Supabase: Stores your profile, ride history, messages, and documents</Bullet>
            <Bullet>OpenStreetMap / Nominatim: Provides location search autocomplete</Bullet>
            <Bullet>OSRM: Calculates route geometry, distance, and estimated duration</Bullet>
          </Section>

          <Section title="📍 Location & Notifications">
            <Bullet>Location access is requested to show your position and assist with pickup selection</Bullet>
            <Bullet>Driver locations are shared with users only during an active ride match</Bullet>
            <Bullet>Notifications can be disabled at any time through your device settings</Bullet>
          </Section>

          <Section title="👥 Data Sharing">
            <Bullet>Drivers: Your pickup location and display name for active ride coordination</Bullet>
            <Bullet>Platform Administrators: Account info and ride history for operational management</Bullet>
            <Bullet>Legal Authorities: When required by law or for safety purposes</Bullet>
            <Text style={[modal.para, { color: '#059669', fontWeight: '600', marginTop: 8 }]}>
              We do NOT sell your personal information to third parties.
            </Text>
          </Section>

          <Section title="🔐 Data Security">
            <Text style={modal.para}>
              We use secure cloud databases with access controls. File uploads are stored in
              access-controlled cloud storage. We use secure authentication and do not store passwords.
            </Text>
          </Section>

          <Section title="✅ Your Rights">
            <Bullet>Access and review your personal data through your profile</Bullet>
            <Bullet>Request correction of inaccurate information</Bullet>
            <Bullet>Request deletion of your account and associated data</Bullet>
            <Bullet>Revoke Google account permissions via your Google account settings</Bullet>
          </Section>

          <Section title="📞 Contact Us">
            <Bullet>Email: support@biyahero.online</Bullet>
            <Bullet>Phone: +63 945 110 6077</Bullet>
            <Bullet>Address: General Santos City, Philippines</Bullet>
          </Section>
        </ScrollView>
        <View style={modal.footer}>
          <TouchableOpacity style={[modal.agreeBtn, { backgroundColor: '#059669' }]} onPress={onClose}>
            <Text style={modal.agreeBtnText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={modal.section}>
      <Text style={modal.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <Text style={modal.bullet}>• {children}</Text>;
}

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const redirectTo = Linking.createURL('auth');
        await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      } else {
        const redirectTo = Linking.createURL('auth');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) throw error ?? new Error('No OAuth URL');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          const url = result.url;
          const fragment = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
          const params = new URLSearchParams(fragment);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) Alert.alert('Login failed', error.message);
          } else {
            Alert.alert('Login failed', 'Could not retrieve tokens from redirect URL.');
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <Image
            source={require('../../../assets/biyahero1.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>BiyaHero</Text>
          <Text style={styles.tagline}>Your ride, Your Hero!</Text>
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.btnDisabled]}
          onPress={signInWithGoogle}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <>
              <View style={styles.googleIconBox}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>Terms & Conditions</Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>
        </Text>
      </View>

      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

      <Text style={styles.buildLabel}>Build: v1</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 300,
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderBottomLeftRadius: 999, borderBottomRightRadius: 999,
  },
  content: { width: '100%', maxWidth: 320, alignItems: 'center', paddingHorizontal: 32 },
  buildLabel: { position: 'absolute', bottom: 16, fontSize: 11, color: '#4b5563', fontWeight: '500' },
  logoWrap: { alignItems: 'center', marginBottom: 56 },
  logoImage: { width: 220, height: 110, marginBottom: 4 },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5, marginBottom: 4 },
  tagline: { fontSize: 13, color: '#4b5563', fontWeight: '500', marginTop: 2 },
  googleBtn: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 15, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, minHeight: 52,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  btnDisabled: { opacity: 0.5 },
  googleIconBox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  googleG: { fontSize: 16, fontWeight: '700', color: '#ea4335' },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#030712' },
  terms: { fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 24, lineHeight: 18 },
  termsLink: { color: '#10b981', fontWeight: '600' },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: '#1d4ed8', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 12,
  },
  headerIcon: {
    width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  headerIconText: { fontSize: 18 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  lastUpdated: { fontSize: 11, color: '#9ca3af', marginBottom: 12 },
  para: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 4 },
  section: {
    backgroundColor: '#f9fafb', borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 },
  bullet: { fontSize: 12, color: '#4b5563', lineHeight: 20, marginBottom: 2 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  agreeBtn: {
    backgroundColor: '#1d4ed8', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  agreeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
