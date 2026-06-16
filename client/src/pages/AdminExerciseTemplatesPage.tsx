import { Link } from 'react-router-dom';
import { ExerciseTemplatesTable } from '../components/admin/ExerciseTemplatesTable';

export function AdminExerciseTemplatesPage() {
  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin
      </Link>
      <ExerciseTemplatesTable />
    </div>
  );
}
