import { Link } from 'react-router-dom';
import MessageCenter from '../components/communications/MessageCenter';

export function AdminCommunicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-700">
          ← Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-app-text">Email</h1>
      </div>
      <MessageCenter />
    </div>
  );
}
