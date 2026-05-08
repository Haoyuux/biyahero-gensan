import React from "react";
import { Shield, Lock, Eye, Users, Mail, ArrowLeft } from "lucide-react";

interface PrivacyPolicyPageProps {
  onClose: () => void;
}

export default function PrivacyPolicyPage({ onClose }: PrivacyPolicyPageProps) {
  const lastUpdated = "May 8, 2026";

  return (
    <div className="w-full min-h-[100dvh] bg-white dark:bg-zinc-900 font-sans">
      {/* Header */}
      <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 p-4 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-white" />
            <h1 className="text-lg font-bold text-white">Privacy Policy</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6 text-sm text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
        <p className="text-gray-500 dark:text-gray-400 text-xs">
          Last updated: {lastUpdated}
        </p>

        {/* Introduction */}
        <section>
          <p className="leading-relaxed">
            Biyahero Online ("we," "our," or "us") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your 
            information when you use our ride-booking mobile application and services.
          </p>
        </section>

        {/* Information We Collect */}
        <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Information We Collect</h3>
          </div>
          <ul className="space-y-2 text-xs">
            <li>• <strong>Personal Information:</strong> Name, email, phone number, profile photo</li>
            <li>• <strong>Location Data:</strong> GPS coordinates for ride matching and tracking</li>
            <li>• <strong>Device Information:</strong> Device ID, OS version, app version</li>
            <li>• <strong>Trip Data:</strong> Pickup/dropoff locations, trip history, ratings</li>
            <li>• <strong>Payment Information:</strong> Processed through secure payment partners</li>
          </ul>
        </section>

        {/* How We Use Information */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">How We Use Your Information</h3>
          </div>
          <ul className="space-y-2 text-xs">
            <li>• To provide and improve our ride-booking services</li>
            <li>• To match you with nearby drivers</li>
            <li>• To process payments and generate receipts</li>
            <li>• To communicate with you about trips and updates</li>
            <li>• To analyze usage patterns and enhance user experience</li>
            <li>• To comply with legal obligations</li>
          </ul>
        </section>

        {/* Data Sharing */}
        <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Data Sharing</h3>
          </div>
          <p className="text-xs mb-3">
            We may share your information with:
          </p>
          <ul className="space-y-2 text-xs">
            <li>• <strong>Drivers:</strong> Your pickup location and contact details for trip coordination</li>
            <li>• <strong>Service Providers:</strong> Payment processors, cloud storage, analytics</li>
            <li>• <strong>Legal Authorities:</strong> When required by law or for safety purposes</li>
          </ul>
          <p className="text-xs mt-3 text-gray-600 dark:text-gray-400">
            We do NOT sell your personal information to third parties.
          </p>
        </section>

        {/* Data Security */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Data Security</h3>
          </div>
          <p className="text-xs leading-relaxed">
            We implement industry-standard security measures including encryption (SSL/TLS), 
            secure data storage, and access controls. While we strive to protect your information, 
            no method of electronic transmission is 100% secure.
          </p>
        </section>

        {/* Your Rights */}
        <section className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Your Rights</h3>
          </div>
          <ul className="space-y-2 text-xs">
            <li>• Access and review your personal data</li>
            <li>• Request correction of inaccurate information</li>
            <li>• Request deletion of your account and data</li>
            <li>• Opt-out of non-essential data collection</li>
            <li>• Lodge complaints with data protection authorities</li>
          </ul>
        </section>

        {/* Contact Us */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Contact Us</h3>
          </div>
          <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
            <p>If you have questions about this Privacy Policy, please contact us:</p>
            <p>• Email: support@biyahero.online</p>
            <p>• Phone: +63 912 345 6789</p>
            <p>• Address: General Santos City, Philippines</p>
            <button
              onClick={() => window.location.hash = "termsandcondition"}
              className="mt-2 text-emerald-600 hover:underline font-medium text-xs"
            >
              View Terms & Conditions →
            </button>
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
    </div>
  );
}