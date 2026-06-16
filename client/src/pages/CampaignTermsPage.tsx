import { Link } from 'react-router-dom';
import { LegalPageLayout } from '../components/layout/LegalPageLayout';
import { SMS_PHONE_DISPLAY } from '../config/sms';

const SUPPORT_EMAIL = 'support@master-metabolic.com';

export function CampaignTermsPage() {
  return (
    <LegalPageLayout title="SMS Campaign Terms and Conditions" lastUpdated="June 16, 2026">
      <section>
        <h2 className="text-lg font-semibold">Agreement</h2>
        <p className="mt-2 text-app-text-muted">
          These SMS Campaign Terms and Conditions (&quot;SMS Terms&quot;) govern your participation in text
          messaging offered by Master Metabolic through the Metabolic application. By opting in to our SMS
          program, you agree to these SMS Terms and our SMS Campaign Privacy Policy.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Program description</h2>
        <p className="mt-2 text-app-text-muted">
          Master Metabolic provides an SMS-based AI coaching service that lets enrolled users text questions
          about their active Metabolic program. Responses may include information about planned meals,
          nutrition targets, exercise schedules, progress summaries, and general coaching guidance based on data
          in your Metabolic account.
        </p>
        <p className="mt-2 text-app-text-muted">
          SMS messaging is a convenience feature. It does not replace professional medical, nutritional, or
          fitness advice. Always consult qualified professionals for health decisions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Eligibility</h2>
        <p className="mt-2 text-app-text-muted">
          To use SMS messaging, you must have an active Metabolic account, be at least 13 years old (or the age
          required in your jurisdiction), and use a mobile phone number that you own or are authorized to use.
          Your phone number must be linked to your Metabolic profile before or during enrollment in the SMS
          program.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Opt-in</h2>
        <p className="mt-2 text-app-text-muted">
          You opt in by texting <strong>START</strong> to {SMS_PHONE_DISPLAY} after viewing the public{' '}
          <Link to="/sms-opt-in" className="font-medium text-app-text underline-offset-2 hover:underline">
            SMS opt-in disclosure
          </Link>
          . By opting in, you authorize Master Metabolic to send conversational SMS replies related to your
          Metabolic account, including meals, workouts, program status, progress, and support. Coaches may send
          account-related messages with links to your Metabolic progress, nutrition, or exercise pages when your
          results are ready.
        </p>
        <p className="mt-2 text-app-text-muted">
          Message frequency varies based on how often you text us or when a coach sends a results notification
          through your program. Message and data rates may apply as determined by your wireless carrier.
        </p>
        <p className="mt-2 text-app-text-muted">
          Consent to receive SMS messages is not a condition of purchasing any goods or services. The SMS
          feature is available only to users who choose to start an SMS conversation with Master Metabolic.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Message types and frequency</h2>
        <p className="mt-2 text-app-text-muted">
          Messages are conversational and sent in response to texts you initiate, or when a coach sends a
          results notification through your program. Message frequency varies based on how often you text us.
          Master Metabolic does not send marketing messages, promotional blasts, or unsolicited reminders under
          this SMS program.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Supported carriers</h2>
        <p className="mt-2 text-app-text-muted">
          Wireless carriers are not liable for delayed or undelivered messages. SMS delivery is subject to
          effective transmission by your mobile network operator and our messaging providers.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Opt-out and help keywords</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>
            Text <strong>START</strong> to {SMS_PHONE_DISPLAY} to opt in or resubscribe to the Master Metabolic
            SMS program.
          </li>
          <li>
            Reply <strong>STOP</strong> to cancel SMS messages from Master Metabolic at any time. You will
            receive a one-time confirmation that you have been unsubscribed.
          </li>
          <li>
            Reply <strong>HELP</strong> for customer support information.
          </li>
          <li>
            For additional assistance, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-app-text underline-offset-2 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
        </ul>
        <p className="mt-2 text-app-text-muted">
          After opting out via STOP, you may re-enroll by linking your phone number again in Metabolic and
          sending a new message to our SMS number.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Acceptable use</h2>
        <p className="mt-2 text-app-text-muted">You agree not to use the SMS program to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Send unlawful, abusive, harassing, or fraudulent content</li>
          <li>Attempt to disrupt or reverse engineer the service</li>
          <li>Share access to a phone number linked to another person&apos;s account without authorization</li>
        </ul>
        <p className="mt-2 text-app-text-muted">
          We may suspend or terminate SMS access if we reasonably believe these terms have been violated or if
          required by carriers or messaging compliance rules.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Disclaimer</h2>
        <p className="mt-2 text-app-text-muted">
          SMS responses are generated using automated systems and may occasionally be incomplete or inaccurate.
          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties
          of any kind, whether express or implied, to the fullest extent permitted by law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Limitation of liability</h2>
        <p className="mt-2 text-app-text-muted">
          To the maximum extent permitted by applicable law, Master Metabolic will not be liable for any
          indirect, incidental, special, consequential, or punitive damages arising from your use of the SMS
          program, including message delays, failures, or reliance on coaching content received by text.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Changes</h2>
        <p className="mt-2 text-app-text-muted">
          We may modify these SMS Terms or discontinue the SMS program at any time. Material changes will be
          reflected by updating the &quot;Last updated&quot; date on this page. Your continued use of the SMS
          program after changes take effect constitutes acceptance of the revised terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="mt-2 text-app-text-muted">
          For questions about these SMS Terms, contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-app-text underline-offset-2 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
