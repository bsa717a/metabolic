import { Link } from 'react-router-dom';
import { LegalPageLayout } from '../components/layout/LegalPageLayout';
import { SMS_PHONE_DISPLAY } from '../config/sms';

const SUPPORT_EMAIL = 'support@master-metabolic.com';

export function CampaignPolicyPage() {
  return (
    <LegalPageLayout title="SMS Campaign Privacy Policy" lastUpdated="June 16, 2026">
      <section>
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="mt-2 text-app-text-muted">
          This SMS Campaign Privacy Policy describes how Master Metabolic (&quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;) collects, uses, and protects information when you participate in our SMS messaging
          program through the Metabolic application. This policy applies to text messages sent to and from our
          Twilio phone number as part of your Metabolic account.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Information we collect</h2>
        <p className="mt-2 text-app-text-muted">When you use our SMS program, we may collect:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Your mobile phone number</li>
          <li>The content of messages you send to us and our replies to you</li>
          <li>Message timestamps, delivery status, and related metadata provided by our messaging provider</li>
          <li>Your Metabolic account identifier when your phone number is linked to an existing user profile</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How we use your information</h2>
        <p className="mt-2 text-app-text-muted">We use SMS-related information to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-app-text-muted">
          <li>Deliver AI-powered coaching responses about your nutrition, exercise, and program data</li>
          <li>
            Send account-related results notifications with links to your progress, nutrition, or exercise pages
            when requested by your coach through your program
          </li>
          <li>Authenticate you by matching your phone number to your Metabolic account</li>
          <li>Maintain a message history so conversations can continue across multiple texts</li>
          <li>Improve reliability, security, and support for the messaging program</li>
          <li>Comply with legal obligations and carrier or messaging platform requirements</li>
        </ul>
        <p className="mt-2 text-app-text-muted">
          We do not sell, rent, or share your mobile phone number, SMS consent status, or SMS content with
          third parties or affiliates for their own marketing or promotional purposes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Opt-in and consent</h2>
        <p className="mt-2 text-app-text-muted">
          You opt in to receive SMS messages from Master Metabolic by texting <strong>START</strong> to{' '}
          {SMS_PHONE_DISPLAY} after viewing the public{' '}
          <Link to="/sms-opt-in" className="font-medium text-app-text underline-offset-2 hover:underline">
            SMS opt-in disclosure
          </Link>
          . By opting in, you confirm that you are the account holder or have permission to use the phone number
          provided and that you agree to receive conversational SMS replies related to your Metabolic account,
          including meals, workouts, program status, progress, and support.
        </p>
        <p className="mt-2 text-app-text-muted">
          Message frequency varies based on your interactions with the service. Message and data rates may apply
          depending on your mobile carrier and plan.
        </p>
        <p className="mt-2 text-app-text-muted">
          SMS consent is optional and is not required to purchase goods or services. We do not send marketing
          messages, promotional blasts, or unsolicited reminders under this SMS program.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Opt-out and help</h2>
        <p className="mt-2 text-app-text-muted">
          You may opt out at any time by replying <strong>STOP</strong> to any message from us. After you opt
          out, we will send a confirmation message and will no longer send SMS messages except where required
          by law. Reply <strong>HELP</strong> for assistance or contact us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-app-text underline-offset-2 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Message frequency and charges</h2>
        <p className="mt-2 text-app-text-muted">
          Message frequency varies based on your interactions with the service. We send messages in response to
          texts you initiate and do not send recurring promotional blasts as part of this program. Message and
          data rates may apply depending on your mobile carrier and plan.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Service providers</h2>
        <p className="mt-2 text-app-text-muted">
          We use Twilio and other infrastructure providers to transmit SMS messages. These providers process
          message content and phone numbers on our behalf under contractual obligations to protect your
          information. We may also use AI service providers to generate coaching responses based on your
          program data and message content.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Data retention and security</h2>
        <p className="mt-2 text-app-text-muted">
          SMS messages and related metadata are stored in our secure application database for as long as needed
          to operate the service, provide support, and meet legal or compliance requirements. We use reasonable
          administrative, technical, and organizational measures to protect your information.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Children</h2>
        <p className="mt-2 text-app-text-muted">
          Our SMS program is not intended for individuals under 13 years of age. We do not knowingly collect
          information from children under 13 through SMS.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Changes to this policy</h2>
        <p className="mt-2 text-app-text-muted">
          We may update this policy from time to time. The &quot;Last updated&quot; date at the top of this
          page indicates when changes were last made. Continued use of the SMS program after changes become
          effective constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Contact us</h2>
        <p className="mt-2 text-app-text-muted">
          Questions about this SMS Campaign Privacy Policy or your messaging data may be sent to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-app-text underline-offset-2 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
