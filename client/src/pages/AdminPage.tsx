import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminCard } from '../components/admin/AdminCard';
import { FoodReviewQueue } from '../components/admin/FoodReviewQueue';
import { ExerciseTable } from '../components/admin/ExerciseTable';
import { FoodTable } from '../components/admin/FoodTable';
import { UserTable } from '../components/admin/UserTable';
import { AdminGamificationPanel } from '../components/admin/AdminGamificationPanel';

const cards = [
  'Users',
  'Programs',
  'Nutrition Templates',
  'Exercise Templates',
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
  'Nutrition Templates',
  'Exercise Templates',
  'Gamification'
]);

export function AdminPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSection | null>('Users');

  function toggleSection(section: AdminSection) {
    if (section === 'Nutrition Templates') {
      navigate('/admin/nutrition-templates');
      return;
    }
    if (section === 'Exercise Templates') {
      navigate('/admin/exercise-templates');
      return;
    }
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
      {activeSection === 'Gamification' && <AdminGamificationPanel />}
    </div>
  );
}
