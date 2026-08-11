import { Link } from 'react-router-dom';
import { ExercisePlansTable } from '../components/admin/ExercisePlansTable';

export function AdminExercisePlansPage() {
  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin
      </Link>
      <ExercisePlansTable />
    </div>
  );
}
