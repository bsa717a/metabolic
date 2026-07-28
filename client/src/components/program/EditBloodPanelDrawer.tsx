import { useEffect, useState } from 'react';
import type { BloodPanelSummary, UserDemographics } from '../../types';
import { api, parseDateKey, todayKey } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import {
  BLOOD_PANEL_FORM_FIELDS,
  bloodPanelToFormValues,
  emptyBloodPanelFormValues,
  formValuesToPayload,
  type BloodPanelFormValues
} from './bloodPanelForm';

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600 dark:text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-app-border dark:bg-app-surface dark:text-app-text';
}

function formatLabDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function demographicsComplete(demographics: UserDemographics) {
  return Boolean(demographics.gender && demographics.birthDate);
}

export function EditBloodPanelDrawer({
  open,
  userId,
  panel,
  onClose,
  onSaved
}: {
  open: boolean;
  userId: string;
  panel?: BloodPanelSummary;
  onClose: () => void;
  onSaved: (panel: BloodPanelSummary) => void;
}) {
  return (
    <Drawer open={open} title={panel ? 'Edit blood panel' : 'Add blood panel'} onClose={onClose}>
      {open && (
        <EditBloodPanelDrawerContent
          key={panel?.id ?? 'new'}
          userId={userId}
          panel={panel}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditBloodPanelDrawerContent({
  userId,
  panel,
  onClose,
  onSaved
}: {
  userId: string;
  panel?: BloodPanelSummary;
  onClose: () => void;
  onSaved: (panel: BloodPanelSummary) => void;
}) {
  const [values, setValues] = useState<BloodPanelFormValues>(() =>
    panel ? bloodPanelToFormValues(panel) : emptyBloodPanelFormValues(todayKey())
  );
  const [gender, setGender] = useState<'m' | 'f' | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingProfile(true);
    api<UserDemographics>(`/api/users/${userId}/demographics`)
      .then((profile) => {
        setGender(profile.gender === 'm' || profile.gender === 'f' ? profile.gender : '');
        setBirthDate(profile.birthDate ?? '');
      })
      .catch(() => {
        setGender('');
        setBirthDate('');
      })
      .finally(() => setLoadingProfile(false));
  }, [userId]);

  function updateMetric(apiKey: keyof BloodPanelFormValues['metrics'], next: string) {
    setValues((current) => ({
      ...current,
      metrics: { ...current.metrics, [apiKey]: next }
    }));
  }

  async function saveDemographicsIfNeeded() {
    if (!gender || !birthDate) {
      throw new Error('Select gender and birth date so lab results can use the correct reference ranges.');
    }
    await api<UserDemographics>(`/api/users/${userId}/demographics`, {
      method: 'PATCH',
      body: JSON.stringify({ gender, birthDate })
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await saveDemographicsIfNeeded();
      const payload = formValuesToPayload(values);
      const saved = panel
        ? await api<BloodPanelSummary>(`/api/blood-panels/${userId}/${panel.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        : await api<BloodPanelSummary>(`/api/blood-panels/${userId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save blood panel');
    } finally {
      setSaving(false);
    }
  }

  const profileReady = demographicsComplete({ gender: gender || null, birthDate: birthDate || null });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-app-text-muted">
        {panel
          ? `Editing panel from ${formatLabDate(panel.labDate)}. Enter the values tested on this lab date.`
          : 'Log lab results from your blood draw. At least one metric is required.'}
      </p>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-app-border dark:bg-app-muted">
        <p className="text-sm font-semibold text-slate-900 dark:text-app-text">Reference range profile</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-app-text-muted">
          Used to classify results against age- and gender-specific lab ranges.
        </p>
        {loadingProfile ? (
          <p className="mt-3 text-sm text-slate-500">Loading profile…</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClassName()}>Gender</span>
              <select
                className={inputClassName()}
                value={gender}
                onChange={(event) => setGender(event.target.value as 'm' | 'f' | '')}
              >
                <option value="">Select gender</option>
                <option value="f">Female</option>
                <option value="m">Male</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClassName()}>Birth date</span>
              <input
                className={inputClassName()}
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
          </div>
        )}
        {!loadingProfile && !profileReady ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">
            Add gender and birth date before saving a blood panel.
          </p>
        ) : null}
      </div>

      <label className="block">
        <span className={labelClassName()}>Lab date</span>
        <input
          className={inputClassName()}
          type="date"
          value={values.labDate}
          onChange={(event) => setValues((current) => ({ ...current, labDate: event.target.value }))}
        />
      </label>

      <label className="block">
        <span className={labelClassName()}>Lab provider</span>
        <input
          className={inputClassName()}
          type="text"
          placeholder="Quest Diagnostics, LabCorp, etc."
          value={values.labProvider}
          onChange={(event) => setValues((current) => ({ ...current, labProvider: event.target.value }))}
        />
      </label>

      <div>
        <p className={labelClassName()}>Lab results</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {BLOOD_PANEL_FORM_FIELDS.map((field) => (
            <label key={field.apiKey} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-app-text-muted">
                {field.label} ({field.unit})
              </span>
              <NumberInput
                className={inputClassName()}
                step="0.01"
                placeholder={field.placeholder}
                value={values.metrics[field.apiKey]}
                onChange={(value) => updateMetric(field.apiKey, value)}
              />
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={labelClassName()}>Notes</span>
        <textarea
          className={`${inputClassName()} min-h-[5rem] resize-y`}
          placeholder="Fasting, post-meal, etc."
          value={values.notes}
          onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving || loadingProfile} onClick={save}>
          {saving ? 'Saving…' : panel ? 'Save changes' : 'Save blood panel'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
