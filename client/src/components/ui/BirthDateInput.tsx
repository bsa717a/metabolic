import { useEffect, useState } from 'react';

export function isoToDisplay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

export function displayToIso(display: string) {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return null;

  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;

  const currentYear = new Date().getFullYear();
  if (year < currentYear - 120 || year > currentYear) return null;

  return `${match[3]}-${match[1]}-${match[2]}`;
}

function formatAsTyping(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function BirthDateInput({
  id,
  value,
  onChange,
  fieldClass
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  fieldClass: string;
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [error, setError] = useState('');

  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = formatAsTyping(event.target.value);
    setDisplay(next);
    setError('');

    const iso = displayToIso(next);
    if (iso) {
      onChange(iso);
      return;
    }
    if (!next) onChange('');
  }

  function handleBlur() {
    if (!display.trim()) {
      setError('');
      onChange('');
      return;
    }

    const iso = displayToIso(display);
    if (!iso) {
      setError('Enter a valid date as MM/DD/YYYY.');
      return;
    }

    setError('');
    onChange(iso);
    setDisplay(isoToDisplay(iso));
  }

  return (
    <div>
      <input
        id={id}
        className={fieldClass}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="MM/DD/YYYY"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
