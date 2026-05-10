import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Shield, Lock, Eye, Users, Mail, Database, MapPin } from "lucide-react";

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
  onShowTerms?: () => void;
}

export default function PrivacyPolicy({ isOpen, onClose, onShowTerms }: PrivacyPolicyProps) {
  const lastUpdated = "May 10, 2026";

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="relative w-full max-w-2xl my-8 mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 p-6 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Privacy Policy
                  </h2>
                  <p className="text-emerald-100 text-xs">Biyahero Online</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 text-sm text-gray-700 dark:text-gray-300 max-h-[70vh] overflow-y-auto">
            <p className="text-gray-500 dark:text-gray-400 text-xs">
              Last updated: {lastUpdated}
            </p>

            {/* Introduction */}
            <section>
              <p className="leading-relaxed">
                Biyahero Online ("we," "our," or "us") is committed to protecting your privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your
                information when you use our ride-booking application and services in
                General Santos City, Philippines.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Information We Collect
                </h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>
                  • <strong>Google Account Data:</strong> Name, email address, and profile photo
                  obtained via Google Sign-In (OAuth 2.0). This is the only sign-in method supported.
                </li>
                <li>
                  • <strong>Profile Information:</strong> Phone number, date of birth, and
                  additional details you provide during profile setup
                </li>
                <li>
                  • <strong>Location Data:</strong> GPS coordinates used for ride matching,
                  routing, and map display. Device location is used only during active app sessions.
                </li>
                <li>
                  • <strong>Trip Data:</strong> Pickup/dropoff labels, ride type, fare breakdown,
                  ride status, voucher usage, and driver ratings
                </li>
                <li>
                  • <strong>Driver Documents:</strong> For riders, uploaded files including
                  license photos, vehicle registration, and profile/cover photos stored securely
                </li>
                <li>
                  • <strong>Remittance Records:</strong> Daily booking fee amounts, receipt
                  photos, and submission timestamps for driver accounts
                </li>
                <li>
                  • <strong>Chat Messages:</strong> In-app messages exchanged between users
                  and drivers during active rides
                </li>
              </ul>
            </section>

            {/* How We Use Information */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  How We Use Your Information
                </h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• To authenticate your identity via Google Sign-In</li>
                <li>• To match you with nearby available drivers</li>
                <li>• To calculate and display ride fares accurately</li>
                <li>• To facilitate real-time in-app chat between users and drivers</li>
                <li>• To process and review driver remittance submissions</li>
                <li>• To verify driver eligibility through document review</li>
                <li>• To send browser notifications about ride status updates</li>
                <li>• To analyze usage patterns and improve the platform</li>
                <li>• To comply with legal obligations</li>
              </ul>
            </section>

            {/* Third-Party Services */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Third-Party Services We Use
                </h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>
                  • <strong>Google (OAuth):</strong> Handles account authentication. Your Google
                  account data is subject to Google's Privacy Policy.
                </li>
                <li>
                  • <strong>Supabase:</strong> Our backend provider. Stores your profile, ride
                  history, messages, documents, and remittance data in secure cloud databases
                  and file storage.
                </li>
                <li>
                  • <strong>OpenStreetMap / Nominatim:</strong> Provides location search
                  autocomplete. Search queries (location text) are sent to their servers.
                </li>
                <li>
                  • <strong>OSRM (Open Source Routing Machine):</strong> Calculates route
                  geometry, distance, and estimated duration between pickup and dropoff coordinates.
                </li>
              </ul>
            </section>

            {/* Location & Notifications */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Location & Notifications
                </h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Location access is requested to show your position on the map and assist with pickup selection</li>
                <li>• Driver locations are shared with users only during an active ride match</li>
                <li>• Browser notification permission may be requested to alert you of ride updates</li>
                <li>• Notifications can be disabled at any time through your browser settings</li>
              </ul>
            </section>

            {/* Data Sharing */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Data Sharing
                </h3>
              </div>
              <p className="text-xs mb-3">
                We may share your information with:
              </p>
              <ul className="space-y-2 text-xs">
                <li>
                  • <strong>Drivers:</strong> Your pickup location and display name for active ride coordination
                </li>
                <li>
                  • <strong>Team Leaders:</strong> Remittance records and ride stats for riders under their team
                </li>
                <li>
                  • <strong>Platform Administrators:</strong> Account info, ride history, and documents for operational management
                </li>
                <li>
                  • <strong>Legal Authorities:</strong> When required by law or for safety purposes
                </li>
              </ul>
              <p className="text-xs mt-3 text-gray-600 dark:text-gray-400">
                We do NOT sell your personal information to third parties.
              </p>
            </section>

            {/* Data Security */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Data Security
                </h3>
              </div>
              <p className="text-xs leading-relaxed">
                We use secure cloud databases with access controls to ensure your data is
                accessible only to authorized users. File uploads (documents, receipts, avatars)
                are stored in access-controlled cloud storage. We use secure authentication
                and do not store passwords. While we implement industry-standard security
                measures, no electronic system is 100% secure.
              </p>
            </section>

            {/* Your Rights */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Your Rights
                </h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Access and review your personal data through your profile</li>
                <li>• Request correction of inaccurate information</li>
                <li>• Request deletion of your account and associated data</li>
                <li>• Revoke Google account permissions at any time via your Google account settings</li>
                <li>• Lodge complaints with data protection authorities</li>
              </ul>
            </section>

            {/* Contact Us */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Contact Us
                </h3>
              </div>
              <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                <p>
                  If you have questions about this Privacy Policy, please contact us:
                </p>
                <p>• Email: support@biyahero.online</p>
                <p>• Phone: +63 945 110 6077</p>
                <p>• Address: General Santos City, Philippines</p>
                {onShowTerms && (
                  <p className="mt-2">
                    View our{" "}
                    <button
                      onClick={onShowTerms}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      Terms & Conditions
                    </button>
                  </p>
                )}
              </div>
            </section>

            {/* Changes to Policy */}
            <section className="border-t border-gray-200 dark:border-zinc-700 pt-4">
              <p className="text-xs text-gray-500">
                We may update this Privacy Policy from time to time. We will notify you of
                material changes via the app. Your continued use after changes constitutes
                acceptance of the updated policy.
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-zinc-800 p-4 border-t border-gray-200 dark:border-zinc-700">
            <button
              onClick={onClose}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors"
            >
              I Understand
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
