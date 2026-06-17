import { Link, useParams } from 'react-router-dom';
import { ExerciseTemplatesTable } from '../components/admin/ExerciseTemplatesTable';

export function AdminExerciseTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin
      </Link>
      <ExerciseTemplatesTable initialTemplateId={id} />
    </div>
  );
}
