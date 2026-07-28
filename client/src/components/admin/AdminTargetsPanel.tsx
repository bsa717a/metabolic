import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NumberInput } from '../ui/NumberInput';

type FormulaConfig = {
  activityMultipliers: Record<'1' | '2' | '3' | '4' | '5', number>;
  deficitPct: number;
  proteinPerLb: number;
  proteinMinGrams: number;
  proteinMaxGrams: number;
  calorieFloor: number;
  carbShareOfRemaining: number;
};

type Targets = { calories: number; protein: number; carbs: number; fat: number };

type OverrideBand = {
  id: string;
  gender: 'm' | 'f';
  heightMinInches: number;
  heightMaxInches: number;
  weightMinLbs: number;
  weightMaxLbs: number;
  activityLevelMin: number;
  activityLevelMax: number;
  calorieTarget: number;
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
  notes: string | null;
};

type PopulationRow = {
  gender: 'm' | 'f';
  heightRange: string;
  weightRange: string;
  clients: number;
  formula: Targets;
  override: { id: string; calorieTarget: number; proteinTarget: number } | null;
};

const EMPTY_BAND = {
  gender: 'f' as 'm' | 'f',
  heightMinInches: 60,
  heightMaxInches: 66,
  weightMinLbs: 120,
  weightMaxLbs: 180,
  activityLevelMin: 1,
  activityLevelMax: 5,
  calorieTarget: 1500,
  proteinTarget: 110,
  carbTarget: 150,
  fatTarget: 50,
  notes: ''
};

export function AdminTargetsPanel() {
  const [config, setConfig] = useState<FormulaConfig | null>(null);
  const [bands, setBands] = useState<OverrideBand[]>([]);
  const [population, setPopulation] = useState<{ rows: PopulationRow[]; incompleteProfiles: number; totalUsers: number } | null>(null);
  const [preview, setPreview] = useState<{ formula: Targets; override: { calorieTarget: number; proteinTarget: number; notes: string | null } | null } | null>(null);
  const [example, setExample] = useState({ gender: 'f' as 'm' | 'f', heightInches: 64, weightLbs: 150, activityLevel: 2 });
  const [draft, setDraft] = useState({ ...EMPTY_BAND });
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ config: FormulaConfig }>('/api/admin/targets/formula').then((r) => setConfig(r.config)).catch(() => undefined);
    api<OverrideBand[]>('/api/admin/targets/bands').then(setBands).catch(() => undefined);
    api<{ rows: PopulationRow[]; incompleteProfiles: number; totalUsers: number }>('/api/admin/targets/population')
      .then(setPopulation)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api<{ formula: Targets; override: { calorieTarget: number; proteinTarget: number; notes: string | null } | null }>(
        '/api/admin/targets/preview',
        { method: 'POST', body: JSON.stringify(example) }
      )
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [example, config, bands]);

  async function saveConfig() {
    if (!config) return;
    setStatus(null);
    try {
      await api('/api/admin/targets/formula', { method: 'PUT', body: JSON.stringify(config) });
      setStatus('Formula saved — applies to every plan minted from now on.');
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function addBand() {
    setStatus(null);
    try {
      await api('/api/admin/targets/bands', {
        method: 'POST',
        body: JSON.stringify({ ...draft, notes: draft.notes.trim() || null })
      });
      setDraft({ ...EMPTY_BAND });
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not add the band');
    }
  }

  async function deleteBand(band: OverrideBand) {
    if (!window.confirm('Delete this override band? Matching clients revert to the formula at their next plan week.')) return;
    await api(`/api/admin/targets/bands/${band.id}`, { method: 'DELETE' });
    load();
  }

  if (!config) return <Card><p className="text-app-text-muted">Loading targets…</p></Card>;

  const numField = (label: string, value: number, onChange: (v: number) => void, step = 1) => (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">{label}</span>
      <NumberInput
        step={step}
        value={value}
        onChange={onChange}
        className="w-24 rounded-xl border border-app-border bg-app-surface px-2 py-1.5 tabular-nums"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Target formula</h2>
          <p className="text-sm text-app-text-muted">
            Mifflin-St Jeor BMR × activity − deficit; protein by body weight; carbs/fat split the rest.
            Changes apply to plans minted from now on (weekly check-ins pick them up naturally).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {numField('Deficit %', config.deficitPct, (v) => setConfig({ ...config, deficitPct: v }))}
          {numField('Protein g/lb', config.proteinPerLb, (v) => setConfig({ ...config, proteinPerLb: v }), 0.05)}
          {numField('Protein min g', config.proteinMinGrams, (v) => setConfig({ ...config, proteinMinGrams: v }))}
          {numField('Protein max g', config.proteinMaxGrams, (v) => setConfig({ ...config, proteinMaxGrams: v }))}
          {numField('Calorie floor', config.calorieFloor, (v) => setConfig({ ...config, calorieFloor: v }), 50)}
          {numField('Carb share', config.carbShareOfRemaining, (v) => setConfig({ ...config, carbShareOfRemaining: v }), 0.05)}
          {(['1', '2', '3', '4', '5'] as const).map((level) =>
            numField(`Act ${level}×`, config.activityMultipliers[level], (v) =>
              setConfig({ ...config, activityMultipliers: { ...config.activityMultipliers, [level]: v } }), 0.025)
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4 border-t border-app-border pt-3">
          <span className="text-xs font-semibold uppercase text-app-text-muted">Live example:</span>
          <select value={example.gender} onChange={(e) => setExample({ ...example, gender: e.target.value as 'm' | 'f' })} className="rounded-xl border border-app-border bg-app-surface px-2 py-1.5 text-sm">
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
          {numField('Height in', example.heightInches, (v) => setExample({ ...example, heightInches: v }))}
          {numField('Weight lbs', example.weightLbs, (v) => setExample({ ...example, weightLbs: v }))}
          {numField('Activity', example.activityLevel, (v) => setExample({ ...example, activityLevel: v }))}
          {preview && (
            <p className="text-sm">
              → formula <span className="font-bold">{preview.formula.calories} kcal · {preview.formula.protein}p · {preview.formula.carbs}c · {preview.formula.fat}f</span>
              {preview.override && (
                <span className="ml-2 rounded-full bg-brand-gold/20 px-2 py-0.5 text-xs font-bold text-amber-800">
                  override in effect: {preview.override.calorieTarget} kcal
                </span>
              )}
            </p>
          )}
          <Button type="button" onClick={() => void saveConfig()}>Save formula</Button>
        </div>
        {status && <p className="text-sm text-brand-deep">{status}</p>}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Override bands</h2>
          <p className="text-sm text-app-text-muted">
            Your exceptions to the formula — the most specific matching band wins. Delete a band and its clients
            glide back to the formula at their next plan week.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-border text-left text-xs uppercase tracking-wide text-app-text-muted">
              <th className="py-1">Gender</th><th>Height</th><th>Weight</th><th>Activity</th><th>kcal</th><th>Protein</th><th>Notes</th><th />
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={band.id} className="border-b border-app-muted">
                <td className="py-1.5">{band.gender === 'f' ? 'Female' : 'Male'}</td>
                <td>{band.heightMinInches}–{band.heightMaxInches}"</td>
                <td className="tabular-nums">{Math.round(band.weightMinLbs)}–{Math.round(band.weightMaxLbs)} lbs</td>
                <td>{band.activityLevelMin}–{band.activityLevelMax}</td>
                <td className="font-semibold tabular-nums">{Math.round(band.calorieTarget)}</td>
                <td className="tabular-nums">{Math.round(band.proteinTarget)}g</td>
                <td className="max-w-56 truncate text-xs text-app-text-muted" title={band.notes ?? ''}>{band.notes}</td>
                <td className="text-right">
                  <button type="button" onClick={() => void deleteBand(band)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-end gap-2 border-t border-app-border pt-3">
          <select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as 'm' | 'f' })} className="rounded-xl border border-app-border bg-app-surface px-2 py-1.5 text-sm">
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
          {numField('H min', draft.heightMinInches, (v) => setDraft({ ...draft, heightMinInches: v }))}
          {numField('H max', draft.heightMaxInches, (v) => setDraft({ ...draft, heightMaxInches: v }))}
          {numField('W min', draft.weightMinLbs, (v) => setDraft({ ...draft, weightMinLbs: v }))}
          {numField('W max', draft.weightMaxLbs, (v) => setDraft({ ...draft, weightMaxLbs: v }))}
          {numField('Act min', draft.activityLevelMin, (v) => setDraft({ ...draft, activityLevelMin: v }))}
          {numField('Act max', draft.activityLevelMax, (v) => setDraft({ ...draft, activityLevelMax: v }))}
          {numField('kcal', draft.calorieTarget, (v) => setDraft({ ...draft, calorieTarget: v }), 10)}
          {numField('Protein', draft.proteinTarget, (v) => setDraft({ ...draft, proteinTarget: v }), 5)}
          {numField('Carbs', draft.carbTarget, (v) => setDraft({ ...draft, carbTarget: v }), 5)}
          {numField('Fat', draft.fatTarget, (v) => setDraft({ ...draft, fatTarget: v }), 5)}
          <input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="notes"
            className="w-40 rounded-xl border border-app-border bg-app-surface px-2 py-1.5 text-sm"
          />
          <Button type="button" onClick={() => void addBand()}>Add band</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Population</h2>
          <p className="text-sm text-app-text-muted">
            Every active client segment and what they'd get — formula vs. any override.{' '}
            {population && (
              <span>
                {population.totalUsers} active clients, {population.incompleteProfiles} with incomplete profiles
                (no gender/height/weight — they get no targets until completed).
              </span>
            )}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-border text-left text-xs uppercase tracking-wide text-app-text-muted">
              <th className="py-1">Segment</th><th>Clients</th><th>Formula</th><th>Override</th>
            </tr>
          </thead>
          <tbody>
            {population?.rows.map((row) => (
              <tr key={`${row.gender}-${row.heightRange}-${row.weightRange}`} className="border-b border-app-muted">
                <td className="py-1.5">{row.gender === 'f' ? 'F' : 'M'} · {row.heightRange} · {row.weightRange}</td>
                <td className="font-semibold tabular-nums">{row.clients}</td>
                <td className="tabular-nums">{row.formula.calories} kcal · {row.formula.protein}p</td>
                <td className="tabular-nums">
                  {row.override ? (
                    <span className="font-semibold text-amber-800">{row.override.calorieTarget} kcal · {row.override.proteinTarget}p</span>
                  ) : (
                    <span className="text-app-text-muted">— formula applies</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
