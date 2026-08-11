import { Link, useParams } from 'react-router-dom';
import { ExercisePlansTable } from '../components/admin/ExercisePlansTable';

export function AdminExercisePlanEditorPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin
      </Link>
      <ExercisePlansTable initialPlanId={id} />
    </div>
  );
}
