import type { NutritionPlanOptionGroup } from '../../utils/nutritionPlanGroups';

export function NutritionPlanSelect({
  groups,
  value,
  onChange,
  disabled,
  className,
  emptyLabel = 'Choose a plan'
}: {
  groups: NutritionPlanOptionGroup[];
  value: string;
  onChange: (planId: string) => void;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id} title={option.name}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
