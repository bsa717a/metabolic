import { useState } from 'react';
import { FileText, LayoutTemplate, Mail, Send, Users } from 'lucide-react';
import ComposeMessage from './ComposeMessage';
import DraftsTab from './DraftsTab';
import TemplateManager from './TemplateManager';
import SentTab from './SentTab';
import UsersTab from './UsersTab';
import type { DraftRecord } from '../../services/communicationsApi';
import type { RecipientInput } from '../../lib/communications/types';

type TabId = 'compose' | 'drafts' | 'templates' | 'sent' | 'users';

const TABS: { id: TabId; label: string; icon: typeof Mail }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'compose', label: 'Compose', icon: Mail },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'sent', label: 'Sent', icon: Send }
];

export default function MessageCenter() {
  const [activeTab, setActiveTab] = useState<TabId>('compose');
  const [editingDraft, setEditingDraft] = useState<DraftRecord | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<RecipientInput[]>([]);
  const [preselected, setPreselected] = useState<RecipientInput[] | null>(null);
  const [composeKey, setComposeKey] = useState(0);
  const [draftsRefresh, setDraftsRefresh] = useState(0);

  const startNewCompose = () => {
    setEditingDraft(null);
    setPreselected(null);
    setComposeKey((k) => k + 1);
    setActiveTab('compose');
  };

  const handleEditDraft = (draft: DraftRecord) => {
    setEditingDraft(draft);
    setPreselected(null);
    setComposeKey((k) => k + 1);
    setActiveTab('compose');
  };

  const handleComposeToSelected = () => {
    if (!selectedUsers.length) return;
    setEditingDraft(null);
    setPreselected(selectedUsers);
    setComposeKey((k) => k + 1);
    setActiveTab('compose');
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'compose' ? (
        <div>
          {(editingDraft || preselected) && (
            <button type="button" onClick={startNewCompose} className="mb-4 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
              + Start a new message
            </button>
          )}
          <ComposeMessage
            key={composeKey}
            initialData={editingDraft}
            draftId={editingDraft?.id ?? null}
            preselectedRecipients={preselected}
            onSent={() => {
              setDraftsRefresh((k) => k + 1);
              setSelectedUsers([]);
              setPreselected(null);
            }}
            onDraftSaved={() => setDraftsRefresh((k) => k + 1)}
          />
        </div>
      ) : null}

      {activeTab === 'drafts' ? <DraftsTab onEdit={handleEditDraft} refreshKey={draftsRefresh} /> : null}

      {activeTab === 'templates' ? <TemplateManager /> : null}

      {activeTab === 'sent' ? <SentTab /> : null}

      {activeTab === 'users' ? (
        <div>
          {selectedUsers.length > 0 ? (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-200">
                {selectedUsers.length} user{selectedUsers.length === 1 ? '' : 's'} selected
              </span>
              <button
                type="button"
                onClick={handleComposeToSelected}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <Mail className="h-4 w-4" />
                Compose to selected
              </button>
            </div>
          ) : null}
          <UsersTab selectedUsers={selectedUsers} onSelectionChange={setSelectedUsers} />
        </div>
      ) : null}
    </div>
  );
}
