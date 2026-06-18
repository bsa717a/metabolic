import { Link } from 'react-router-dom';
import { NutritionTemplatesTable } from '../components/admin/NutritionTemplatesTable';

export function AdminNutritionTemplatesPage() {
  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin
      </Link>
      <NutritionTemplatesTable />
    </div>
  );
}
