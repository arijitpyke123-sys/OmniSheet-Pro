import React, { useState } from 'react';
import { X, Users, Shield, UserPlus, Globe, Lock } from 'lucide-react';

interface Collaborator {
  email: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  onAddCollaborator: (email: string, role: 'editor' | 'commenter' | 'viewer') => void;
  isPublic: boolean;
  setIsPublic: (isPublic: boolean) => void;
  theme?: 'dark' | 'light';
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  collaborators,
  onAddCollaborator,
  isPublic,
  setIsPublic,
  theme = 'dark',
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      onAddCollaborator(email.trim(), role);
      setEmail('');
    }
  };

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`flex flex-col w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-colors ${modalBg}`}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-500" />
            <h2 className="text-base font-bold">Share Spreadsheet & RBAC</h2>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Public Link toggle */}
          <div className={`flex items-center justify-between rounded-xl p-4 border ${cardBg}`}>
            <div className="flex items-center gap-3">
              {isPublic ? <Globe className="h-5 w-5 text-emerald-500" /> : <Lock className="h-5 w-5 text-slate-400" />}
              <div>
                <h4 className="text-sm font-semibold">{isPublic ? 'Public Access' : 'Private Access'}</h4>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isPublic ? 'Anyone with the link can view and collaborate' : 'Only invited collaborators can access'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                isPublic ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {isPublic ? 'Make Private' : 'Make Public'}
            </button>
          </div>

          {/* Add Collaborator Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Invite Collaborator</h3>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`flex-1 rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className={`rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
              >
                <option value="editor">Editor</option>
                <option value="commenter">Commenter</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            </div>
          </form>

          {/* Collaborator List */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Collaborators</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {collaborators.map((c, i) => (
                <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-2.5 border ${cardBg}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 font-bold text-xs border border-emerald-800">
                      {c.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{c.email}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{c.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="capitalize">{c.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
