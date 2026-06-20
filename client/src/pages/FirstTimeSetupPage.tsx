import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { BrandLogo } from '../components/brand/BrandLogo';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { BirthDateInput } from '../components/ui/BirthDateInput';
import { detectedTimezone, timezoneOptions } from '../utils/timezoneOptions';
import { normalizeBirthDateKey, normalizeSetupGender } from '../utils/setupDraft';
import type { AppUser, UserAccountDetails } from '../types';

const inputClass =
  'w-full rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-app-text placeholder:text-app-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-green/40';

const setupFieldClass = `${inputClass} h-12`;

type SetupDraft = {
  weight: string;
  goalWeight: string;
  bodyFat: string;
  goalBodyFat: string;
  gender: string;
  birthDate: string;
  timezone: string;
  wantsCoach: boolean;
};

type FirstTimeSetupPageProps = {
  user?: AppUser | null;
  onComplete: () => void;
};

export function FirstTimeSetupPage({ user, onComplete }: FirstTimeSetupPageProps) {
  const navigate = useNavigate();
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [goalBodyFat, setGoalBodyFat] = useState('');
  const [coachCode, setCoachCode] = useState('');
  const [wantsCoach, setWantsCoach] = useState(false);
  const [gender, setGender] = useState<'m' | 'f' | ''>(() => normalizeSetupGender(user?.gender));
  const [birthDate, setBirthDate] = useState(() => normalizeBirthDateKey(user?.birthDate));
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) {
      setLoadingDraft(false);
      return;
    }

    let active = true;

    Promise.all([
      api<SetupDraft>('/api/onboarding/setup-draft').catch(() => ({} as SetupDraft)),
      api<UserAccountDetails>(`/api/users/${user.id}/profile`).catch(() => null)
    ])
      .then(([draft, profile]) => {
        if (!active) return;

        if (draft.weight) setWeight(draft.weight);
        if (draft.goalWeight) setGoalWeight(draft.goalWeight);
        if (draft.bodyFat) setBodyFat(draft.bodyFat);
        if (draft.goalBodyFat) setGoalBodyFat(draft.goalBodyFat);

        const genderValue = normalizeSetupGender(
          draft.gender || profile?.gender || user.gender
        );
        if (genderValue) setGender(genderValue);

        const birthDateValue = normalizeBirthDateKey(
          draft.birthDate || profile?.birthDate || user.birthDate
        );
        if (birthDateValue) setBirthDate(birthDateValue);

        if (draft.timezone || profile?.timezone || user.timezone) {
          setTimezone(draft.timezone || profile?.timezone || user.timezone || detectedTimezone());
        }
        if (draft.wantsCoach) setWantsCoach(true);
      })
      .finally(() => {
        if (active) setLoadingDraft(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id, user?.gender, user?.birthDate, user?.timezone]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const currentWeight = Number(weight);
    const targetWeight = Number(goalWeight);
    const currentBodyFat = bodyFat.trim() ? Number(bodyFat) : undefined;
    const targetBodyFat = goalBodyFat.trim() ? Number(goalBodyFat) : undefined;
    if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
      setError('Enter your current weight.');
      return;
    }
    if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
      setError('Enter your goal weight.');
      return;
    }
    if (currentBodyFat !== undefined && (!Number.isFinite(currentBodyFat) || currentBodyFat <= 0)) {
      setError('Enter a valid current body fat percentage.');
      return;
    }
    if (targetBodyFat !== undefined && (!Number.isFinite(targetBodyFat) || targetBodyFat <= 0)) {
      setError('Enter a valid goal body fat percentage.');
      return;
    }
    if (!timezone.trim()) {
      setError('Select your timezone.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/onboarding/setup', {
        method: 'POST',
        body: JSON.stringify({
          weight: currentWeight,
          goalWeight: targetWeight,
          ...(currentBodyFat !== undefined ? { bodyFat: currentBodyFat } : {}),
          ...(targetBodyFat !== undefined ? { goalBodyFat: targetBodyFat } : {}),
          ...(coachCode.trim() ? { coachCode: coachCode.trim() } : {}),
          ...(wantsCoach ? { wantsCoach: true } : {}),
          ...(gender ? { gender } : {}),
          ...(birthDate ? { birthDate } : {}),
          timezone: timezone.trim()
        })
      });
      onComplete();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  const firstName = user?.firstName?.trim() || 'there';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <BrandLogo showTagline markSize={44} />

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">
            Welcome, {firstName}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-app-text-muted">
            A few quick details help us personalize your plan, track progress from your starting point, and send reminders at the right times.
          </p>
        </div>

        <form className="space-y-5" onSubmit={submit}>
          {loadingDraft ? (
            <p className="text-sm text-app-text-muted">Loading your saved details…</p>
          ) : null}

          <div>
            <label htmlFor="timezone" className="mb-2 block text-sm font-medium text-app-text">
              Timezone
            </label>
            <select
              id="timezone"
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
            >
              <option value="">Select timezone</option>
              {timezoneOptions(timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-app-text-muted">
              Used for daily logs, meal reminders, and your evening check-in.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="current-weight" className="mb-2 block text-sm font-medium text-app-text">
                Current weight (lbs)
              </label>
              <input
                id="current-weight"
                className={inputClass}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="180"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.1"
                required
              />
            </div>
            <div>
              <label htmlFor="goal-weight" className="mb-2 block text-sm font-medium text-app-text">
                Goal weight (lbs)
              </label>
              <input
                id="goal-weight"
                className={inputClass}
                value={goalWeight}
                onChange={(e) => setGoalWeight(e.target.value)}
                placeholder="165"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.1"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="current-body-fat" className="mb-2 block text-sm font-medium text-app-text">
                Current body fat (%)
              </label>
              <input
                id="current-body-fat"
                className={inputClass}
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                placeholder="35"
                inputMode="decimal"
                type="number"
                min="1"
                max="75"
                step="0.1"
              />
            </div>
            <div>
              <label htmlFor="goal-body-fat" className="mb-2 block text-sm font-medium text-app-text">
                Goal body fat (%)
              </label>
              <input
                id="goal-body-fat"
                className={inputClass}
                value={goalBodyFat}
                onChange={(e) => setGoalBodyFat(e.target.value)}
                placeholder="18"
                inputMode="decimal"
                type="number"
                min="1"
                max="75"
                step="0.1"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-app-border bg-app-muted/40 p-4">
            <p className="text-sm font-semibold text-app-text">Personal details</p>
            <p className="mt-1 text-sm text-app-text-muted">
              Optional for now. Together with your weight above, age and profile details help us tailor your starting
              nutrition and exercise plan.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-start">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-app-text">Gender</span>
                <select
                  id="gender"
                  className={setupFieldClass}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'm' | 'f' | '')}
                >
                  <option value="">Prefer not to say yet</option>
                  <option value="f">Female</option>
                  <option value="m">Male</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-app-text">Birth date</span>
                <BirthDateInput
                  key={birthDate || 'empty'}
                  id="birth-date"
                  value={birthDate}
                  onChange={setBirthDate}
                  fieldClass={setupFieldClass}
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-app-border bg-app-muted/40 p-4">
            <p className="text-sm font-semibold text-app-text">Coach support</p>
            <p className="mt-1 text-sm text-app-text-muted">
              Optional. We&apos;ll start you with a balanced plan either way, and a coach can personalize it later.
            </p>
            <label htmlFor="coach-code" className="mt-3 block text-sm font-medium text-app-text">
              Coach initials or code
            </label>
            <input
              id="coach-code"
              className={`${inputClass} mt-2 uppercase`}
              value={coachCode}
              onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
              placeholder="DF"
              maxLength={20}
            />
            <label className="mt-3 flex items-start gap-3 text-sm text-app-text">
              <input
                className="mt-1"
                type="checkbox"
                checked={wantsCoach}
                onChange={(e) => setWantsCoach(e.target.checked)}
              />
              <span>I&apos;d like to work with a real coach.</span>
            </label>
          </div>

          <p className="text-sm text-app-text-muted">
            We&apos;ll start you with a full metric profile, a starter nutrition plan, and an exercise checklist.
            Leave body fat blank to use sensible defaults, or fine-tune everything later.
          </p>

          <button
            type="submit"
            disabled={submitting || loadingDraft}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            {submitting ? 'Creating your program…' : 'Kickstart my Metabolism'}
            {!submitting && <ArrowRight size={16} aria-hidden />}
          </button>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>
      </div>

      <p className="mt-8 max-w-md text-center text-sm text-app-text-muted">
        One quick setup, then you&apos;re ready to use your dashboard.
      </p>
    </main>
  );
}
