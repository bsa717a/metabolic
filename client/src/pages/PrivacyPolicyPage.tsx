import { LegalPageLayout } from '../components/layout/LegalPageLayout';

const PRIVACY_EMAIL = 'derek@clifsmama.com';
const EFFECTIVE_DATE = 'September 9, 2026';

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={EFFECTIVE_DATE}>
      <section>
        <h2 className="text-lg font-semibold">Who we are</h2>
        <p className="mt-2 text-app-text-muted">
          Master Metabolic (also known as MetabolicOS) is operated by Cliffs Mama, LLC (&quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;). We provide a coach-guided wellness application for nutrition
          tracking, fitness planning, and lifestyle improvement. This Privacy Policy explains how we collect,
          use, share, and protect your personal information when you use our mobile application and web
          services (collectively, the &quot;Service&quot;).
        </p>
        <p className="mt-2 text-app-text-muted">
          Master Metabolic is a wellness product designed to support healthy lifestyle choices through guided
          nutrition and fitness tracking. It is <strong>not</strong> intended to diagnose, treat, cure, or
          prevent any medical condition. Always consult with a qualified healthcare professional before making
          changes to your diet or exercise routine.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">What we collect</h2>
        <p className="mt-2 text-app-text-muted">
          We collect information you provide directly, as well as data generated through your use of the
          Service. This information is linked to your account for app functionality and is not sold for
          advertising or cross-app tracking purposes.
        </p>

        <h3 className="mt-4 text-base font-semibold">Account and contact information</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Name, email address, and phone number</li>
          <li>Optional address and emergency contact information</li>
          <li>Authentication credentials via Firebase (email/password, Apple Sign-In, or Google Sign-In)</li>
        </ul>

        <h3 className="mt-4 text-base font-semibold">Health and fitness data</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Weight, body fat percentage, and body measurements</li>
          <li>Meals, macronutrients, and hydration logs</li>
          <li>Workout routines and exercise tracking</li>
          <li>Height, birth date, and gender</li>
          <li>Optional lab values and medical/exercise/food condition notes</li>
        </ul>

        <h3 className="mt-4 text-base font-semibold">User-generated content</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Progress and meal photos</li>
          <li>Messages, feedback, and coach notes</li>
          <li>Virtual coach conversation transcripts</li>
        </ul>

        <h3 className="mt-4 text-base font-semibold">Identifiers and technical data</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>User account identifier</li>
          <li>Push notification device tokens</li>
          <li>Product interaction data (streaks, levels, badges)</li>
        </ul>

        <h3 className="mt-4 text-base font-semibold">Payment information</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Stripe subscription and customer identifiers</li>
          <li>
            We do <strong>not</strong> store or have access to your full credit card numbers—Stripe processes
            and secures all payment card data
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How we use your information</h2>
        <p className="mt-2 text-app-text-muted">We use the information we collect to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Provide, personalize, and improve the Service</li>
          <li>Deliver coach-guided nutrition and fitness recommendations</li>
          <li>Process your subscription and purchases</li>
          <li>Send transactional communications (account updates, reminders via SMS or email)</li>
          <li>Power AI-driven features such as food/exercise lookups and virtual coach conversations</li>
          <li>Track your progress, streaks, and gamification achievements</li>
          <li>Respond to support requests and feedback</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How we share your information</h2>
        <p className="mt-2 text-app-text-muted">
          We do not sell your personal information. We share data only with service providers who help us
          operate the Service:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>
            <strong>Firebase / Google Cloud</strong> — authentication, database hosting, analytics, and push
            notifications
          </li>
          <li>
            <strong>Stripe</strong> — payment processing
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery
          </li>
          <li>
            <strong>SMS vendor (e.g., Twilio)</strong> — text message reminders and notifications
          </li>
          <li>
            <strong>AI providers</strong> — food recognition, exercise lookups, and virtual coach
            conversations
          </li>
        </ul>
        <p className="mt-2 text-app-text-muted">
          These providers process data on our behalf under contracts that require them to protect your
          information. We may also share information when required by law or to protect rights and safety.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Data retention</h2>
        <p className="mt-2 text-app-text-muted">
          We retain your personal information for as long as your account is active or as needed to provide the
          Service, comply with legal obligations, resolve disputes, and enforce our agreements. If you delete
          your account, we will delete or anonymize your data within a reasonable time, unless we are required
          to retain it by law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="mt-2 text-app-text-muted">
          We implement industry-standard technical and organizational measures to protect your information,
          including encrypted data transmission (TLS), secure cloud infrastructure, and access controls.
          However, no system is completely secure, and we cannot guarantee the absolute security of your data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Your choices and rights</h2>
        <p className="mt-2 text-app-text-muted">
          Depending on your jurisdiction, you may have rights regarding your personal information, including:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>
            <strong>Access and portability</strong> — request a copy of the data we hold about you
          </li>
          <li>
            <strong>Correction</strong> — update inaccurate or incomplete information
          </li>
          <li>
            <strong>Deletion</strong> — request that we delete your account and associated data
          </li>
          <li>
            <strong>Opt-out of communications</strong> — unsubscribe from marketing emails or reply STOP to SMS
            messages
          </li>
        </ul>
        <p className="mt-2 text-app-text-muted">
          To exercise any of these rights, contact us at{' '}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-medium text-app-text underline-offset-2 hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
          . We will respond within a reasonable timeframe and in accordance with applicable law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Children&apos;s privacy</h2>
        <p className="mt-2 text-app-text-muted">
          The Service is not intended for individuals under 13 years of age. We do not knowingly collect
          personal information from children under 13. If you believe we have collected information from a
          child under 13, please contact us immediately so we can delete it.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Changes to this policy</h2>
        <p className="mt-2 text-app-text-muted">
          We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top of
          this page indicates when changes were last made. Continued use of the Service after changes become
          effective constitutes acceptance of the updated policy. We encourage you to review this policy
          periodically.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Contact us</h2>
        <p className="mt-2 text-app-text-muted">
          If you have questions or concerns about this Privacy Policy or our data practices, please contact us
          at:
        </p>
        <address className="mt-2 not-italic text-app-text-muted">
          Cliffs Mama, LLC
          <br />
          Email:{' '}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-medium text-app-text underline-offset-2 hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
        </address>
      </section>
    </LegalPageLayout>
  );
}
