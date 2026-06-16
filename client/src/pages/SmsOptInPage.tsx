import { Link } from 'react-router-dom';
import { LegalPageLayout } from '../components/layout/LegalPageLayout';
import { SMS_OPT_IN_DISCLOSURE, SMS_PHONE_DISPLAY } from '../config/sms';

const SUPPORT_EMAIL = 'support@master-metabolic.com';

export function SmsOptInPage() {
  return (
    <LegalPageLayout title="Master Metabolic SMS Opt-In" lastUpdated="June 16, 2026">
      <section>
        <h2 className="text-lg font-semibold">How to opt in</h2>
        <p className="mt-2 text-app-text-muted">
          Existing Metabolic users opt in to the Master Metabolic SMS program by texting{' '}
          <strong>START</strong> to:
        </p>
        <p className="mt-3 text-center text-2xl font-semibold tracking-wide">{SMS_PHONE_DISPLAY}</p>
        <p className="mt-3 text-app-text-muted">
          You must have an active Metabolic account with your mobile number linked to your profile before
          texting <strong>START</strong>. View this page before opting in so you understand how the program
          works.
        </p>
        <p className="mt-2 rounded-2xl border border-app-border bg-app-surface p-4 text-app-text-muted">
          {SMS_OPT_IN_DISCLOSURE}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Coach-assisted enrollment</h2>
        <p className="mt-2 text-app-text-muted">
          A Master Metabolic coach or administrator may share the SMS number above with an enrolled client
          during onboarding. The client must still text <strong>START</strong> from their own mobile phone to
          opt in. Coaches do not opt clients in on their behalf.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Consent</h2>
        <p className="mt-2 text-app-text-muted">
          SMS consent is optional and is not required to purchase goods or services. The SMS feature is available
          only to users who have a Metabolic account and choose to start an SMS conversation with Master
          Metabolic by texting <strong>START</strong>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Message types and frequency</h2>
        <p className="mt-2 text-app-text-muted">
          Master Metabolic sends conversational coaching and support replies related to your account, meals,
          workouts, program status, and progress. Coaches may also send account-related messages that include
          links back to your Metabolic progress, nutrition, or exercise pages when your results are ready. We do
          not send marketing messages, promotional blasts, or unsolicited reminders under this SMS program.
          Message frequency varies based on how often you text us or when a coach sends a results notification
          you requested through your program.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Help and opt-out</h2>
        <p className="mt-2 text-app-text-muted">
          Reply <strong>HELP</strong> for assistance. Reply <strong>STOP</strong> to opt out at any time. You
          can also contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-app-text underline-offset-2 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Policy links</h2>
        <p className="mt-2 text-app-text-muted">
          Review the{' '}
          <Link to="/campaign-policy" className="font-medium text-app-text underline-offset-2 hover:underline">
            SMS Campaign Privacy Policy
          </Link>{' '}
          and{' '}
          <Link to="/campaign-terms" className="font-medium text-app-text underline-offset-2 hover:underline">
            SMS Campaign Terms and Conditions
          </Link>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
