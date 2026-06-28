import { useState } from 'react';
import { AdminCard } from '../components/admin/AdminCard';
import { FoodReviewQueue } from '../components/admin/FoodReviewQueue';
import { ExerciseTable } from '../components/admin/ExerciseTable';
import { ExerciseTemplatesTable } from '../components/admin/ExerciseTemplatesTable';
import { FoodTable } from '../components/admin/FoodTable';
import { NutritionTemplatesTable } from '../components/admin/NutritionTemplatesTable';
import { UserTable } from '../components/admin/UserTable';
import { AdminGamificationPanel } from '../components/admin/AdminGamificationPanel';
import { AdminSettingsPanel } from '../components/admin/AdminSettingsPanel';

const cards = [
  'Users',
  'Programs',
  'Nutrition Plans',
  'Exercise Plans',
  'Exercise Database',
  'Food Database',
  'AI Review Queue',
  'Reports',
  'Settings',
  'Gamification'
] as const;

type AdminSection = (typeof cards)[number];

const interactiveSections = new Set<AdminSection>([
  'Users',
  'Food Database',
  'Exercise Database',
  'AI Review Queue',
  'Nutrition Plans',
  'Exercise Plans',
  'Gamification',
  'Settings'
]);

export function AdminPage() {
  const [activeSection, setActiveSection] = useState<AdminSection | null>('Users');

  function toggleSection(section: AdminSection) {
    if (!interactiveSections.has(section)) return;
    setActiveSection((current) => (current === section ? null : section));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <AdminCard
            key={card}
            title={card}
            description={`Manage ${card.toLowerCase()} from this admin module.`}
            selected={activeSection === card}
            onClick={interactiveSections.has(card) ? () => toggleSection(card) : undefined}
          />
        ))}
      </div>
      {activeSection === 'Users' && <UserTable />}
      {activeSection === 'Food Database' && <FoodTable />}
      {activeSection === 'Exercise Database' && <ExerciseTable />}
      {activeSection === 'AI Review Queue' && <FoodReviewQueue />}
      {activeSection === 'Nutrition Plans' && <NutritionTemplatesTable />}
      {activeSection === 'Exercise Plans' && <ExerciseTemplatesTable />}
      {activeSection === 'Gamification' && <AdminGamificationPanel />}
      {activeSection === 'Settings' && <AdminSettingsPanel />}
    </div>
  );
}
