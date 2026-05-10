import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText, Shield, AlertTriangle, Users, Car, CreditCard, Clock, Ban, MessageSquare, Bike } from "lucide-react";

interface TermsAndConditionsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsAndConditions({ isOpen, onClose }: TermsAndConditionsProps) {
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
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 p-6 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Terms & Conditions</h2>
                  <p className="text-blue-100 text-xs">Biyahero Online</p>
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

            {/* Acceptance */}
            <section>
              <p className="leading-relaxed">
                Welcome to Biyahero Online. By accessing or using our ride-booking application and
                services, you agree to be bound by these Terms & Conditions. If you do not agree,
                please do not use our services. Access requires a valid Google account for sign-in.
              </p>
            </section>

            {/* Ride Tiers */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bike className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Available Ride Tiers</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• <strong>Motorcycle</strong> — 1 passenger, lowest base fare</li>
                <li>• <strong>Economy Car</strong> — up to 4 passengers, mid-range fare</li>
                <li>• <strong>Premium Car</strong> — up to 4 passengers, premium fare</li>
                <li>• Fares are calculated using base fare + per-km rate + per-minute rate + booking fee</li>
                <li>• Specific tiers may be enabled or disabled by the platform at any time</li>
                <li>• Voucher codes may be applied for eligible discounts on the total fare</li>
              </ul>
            </section>

            {/* User Responsibilities */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">User Responsibilities</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Provide accurate pickup and dropoff locations</li>
                <li>• Treat drivers with respect and courtesy</li>
                <li>• Pay for rides in cash directly to the driver upon completion</li>
                <li>• Do not misuse voucher codes or attempt to exploit discount systems</li>
                <li>• Not use the service for any illegal or unauthorized purpose</li>
                <li>• Maintain the security of your Google account used to sign in</li>
              </ul>
            </section>

            {/* Driver Terms */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Car className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Driver (Rider) Terms</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Must complete the platform's onboarding and document verification process</li>
                <li>• Account activation requires admin approval; status may be <em>pending</em>, <em>approved</em>, or <em>rejected</em></li>
                <li>• Must possess a valid driver's license and current vehicle registration</li>
                <li>• Maintain required insurance coverage for ride-hailing operations</li>
                <li>• Accept rides only when legally permitted to drive</li>
                <li>• Provide safe, comfortable, and timely transportation</li>
                <li>• Follow all traffic laws and regulations</li>
                <li>• Submit daily booking fee remittances through the platform with valid receipt proof</li>
                <li>• Riders assigned to a team are subject to team leader oversight and schedules</li>
              </ul>
            </section>

            {/* Payments & Booking Fees */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Payments & Booking Fees</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Ride fares are paid in <strong>cash</strong> directly to the driver upon ride completion</li>
                <li>• The app calculates the fare based on distance, duration, and selected tier</li>
                <li>• A booking fee is deducted from the driver's earnings per ride</li>
                <li>• Drivers are required to remit collected booking fees to the platform daily</li>
                <li>• Remittances must be submitted with a receipt photo via the app</li>
                <li>• Remittances are subject to admin review and approval</li>
                <li>• Pricing rates are set by the platform and may be updated by administrators</li>
              </ul>
            </section>

            {/* In-App Chat */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">In-App Messaging</h3>
              </div>
              <p className="text-xs leading-relaxed">
                Real-time in-app chat is available between users and drivers during an active ride.
                Messages are stored and may be reviewed for safety or dispute resolution.
                Messaging is limited to ride coordination. Misuse, harassment, or inappropriate
                communication is grounds for account suspension.
              </p>
            </section>

            {/* Cancellation Policy */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Cancellation Policy</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Users may cancel a ride before driver arrival</li>
                <li>• Cancellation after driver arrival may be subject to a fee</li>
                <li>• Drivers may cancel only for valid safety reasons</li>
                <li>• Repeated cancellations may result in account restrictions</li>
              </ul>
            </section>

            {/* Limitations */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Limitation of Liability</h3>
              </div>
              <p className="text-xs leading-relaxed">
                Biyahero Online acts as a platform connecting users with independent drivers.
                We are not responsible for the actions, negligence, or conduct of any driver or user.
                Users and drivers use the platform at their own risk. We do not guarantee the
                availability, safety, or quality of any ride.
              </p>
            </section>

            {/* Prohibited Activities */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Prohibited Activities</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Harassment, discrimination, or abusive behavior toward drivers or users</li>
                <li>• Bypassing the app to arrange rides outside the platform</li>
                <li>• Falsifying remittance receipts or booking fee records</li>
                <li>• Using the service under the influence of alcohol or drugs</li>
                <li>• Transporting illegal items or substances</li>
                <li>• Soliciting drivers for personal or commercial purposes outside the platform</li>
                <li>• Impersonating another user, driver, or administrator</li>
                <li>• Submitting fraudulent documents during driver verification</li>
              </ul>
            </section>

            {/* Account Termination */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Account Termination</h3>
              </div>
              <p className="text-xs leading-relaxed">
                We reserve the right to suspend or terminate your account at any time for
                violations of these terms, suspicious activity, or at our sole discretion.
                Driver accounts may be rejected or revoked based on document review or conduct.
                Users may request account deletion by contacting support.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Changes to Terms</h3>
              </div>
              <p className="text-xs leading-relaxed">
                We may update these Terms & Conditions from time to time. We will notify you
                of material changes through the app. Your continued use after changes constitutes
                acceptance of the updated terms.
              </p>
            </section>

            {/* Contact */}
            <section className="border-t border-gray-200 dark:border-zinc-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Contact Us</h3>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p>• Email: support@biyahero.online</p>
                <p>• Phone: +63 945 110 6077</p>
                <p>• Address: General Santos City, Philippines</p>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-zinc-800 p-4 border-t border-gray-200 dark:border-zinc-700">
            <button
              onClick={onClose}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
            >
              I Agree
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
