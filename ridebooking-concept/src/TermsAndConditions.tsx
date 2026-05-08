import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText, Shield, AlertTriangle, Users, Car, CreditCard, Clock, Ban } from "lucide-react";

interface TermsAndConditionsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsAndConditions({ isOpen, onClose }: TermsAndConditionsProps) {
  const lastUpdated = "May 8, 2026";

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
                Welcome to Biyahero Online. By accessing or using our mobile application and services, 
                you agree to be bound by these Terms & Conditions. If you do not agree to these terms, 
                please do not use our services.
              </p>
            </section>

            {/* User Responsibilities */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">User Responsibilities</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Provide accurate and complete information during registration</li>
                <li>• Maintain the security of your account credentials</li>
                <li>• Ensure your pickup and dropoff locations are safe and accessible</li>
                <li>• Treat drivers with respect and courtesy</li>
                <li>• Pay for rides promptly through the app</li>
                <li>• Not use the service for any illegal or unauthorized purpose</li>
              </ul>
            </section>

            {/* Driver Terms */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Car className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Driver Terms</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Must possess a valid driver's license and vehicle registration</li>
                <li>• Maintain required insurance coverage for ride-hailing</li>
                <li>• Accept rides only when legally permitted to drive</li>
                <li>• Provide safe, comfortable, and timely transportation</li>
                <li>• Follow all traffic laws and regulations</li>
                <li>• Maintain vehicle cleanliness and good condition</li>
                <li>• Accept booking fees as outlined in the platform</li>
              </ul>
            </section>

            {/* Payments */}
            <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Payments & Fees</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• All payments are processed through the app's secure system</li>
                <li>• Base fare, distance, and time-based charges apply per ride</li>
                <li>• A booking fee is added to each completed ride</li>
                <li>• Drivers receive their earnings minus the booking fee</li>
                <li>• Refunds are processed according to our refund policy</li>
                <li>• Pricing may vary based on demand and distance</li>
              </ul>
            </section>

            {/* Cancellation Policy */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Cancellation Policy</h3>
              </div>
              <ul className="space-y-2 text-xs">
                <li>• Users may cancel a ride before driver arrival without penalty</li>
                <li>• Cancellation after driver arrival may incur a fee</li>
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
                <li>• Attempting to bypass the app for cash transactions</li>
                <li>• Using the service under the influence of alcohol or drugs</li>
                <li>• Transporting illegal items or substances</li>
                <li>• Soliciting drivers for personal or commercial purposes outside the platform</li>
                <li>• Impersonating another user or driver</li>
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
              <p className="text-xs text-gray-600 dark:text-gray-400">
                For questions about these terms, contact: support@biyahero.online
              </p>
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