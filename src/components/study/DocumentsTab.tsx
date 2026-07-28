'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { FileText, Image as ImageIcon, HelpCircle, Eye, Trash2, FileType, Search } from 'lucide-react';
import { useStore } from '@/lib/store';
import { getAllFiles, logRecentDocument, getRecentDocuments, deleteWorkspaceFile } from '@/lib/tauri-commands';
import type { StudyFile } from '@/lib/tauri-commands';

const typeMeta: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  Pdf: { label: 'PDF', color: '#DC2626', bg: '#FEF2F2', icon: <FileText size={40} style={{ color: '#DC2626' }} /> },
  Markdown: { label: 'MD', color: '#2563EB', bg: '#EFF6FF', icon: <FileType size={40} style={{ color: '#2563EB' }} /> },
  Image: { label: 'IMG', color: '#059669', bg: '#ECFDF5', icon: <ImageIcon size={40} style={{ color: '#059669' }} /> },
  Unknown: { label: '?', color: '#6B7280', bg: '#F3F4F6', icon: <HelpCircle size={40} style={{ color: '#6B7280' }} /> },
};

function toResourceType(ft: string): 'pdf' | 'note' | 'image' {
  if (ft === 'Pdf') return 'pdf';
  if (ft === 'Image') return 'image';
  return 'note';
}

export default function DocumentsTab() {
  const { documents, setDocuments, addResource, resources } = useStore();
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAllFiles(), getRecentDocuments()])
      .then(([all, recent]) => {
        const sorted = all.map((d) => ({
          ...d,
          lastOpened: recent.find((r) => r.path === d.path)?.lastOpened || d.created_at,
        })).sort((a, b) => {
          if (!a.lastOpened && !b.lastOpened) return 0;
          if (!a.lastOpened) return 1;
          if (!b.lastOpened) return -1;
          return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
        });
        setDocuments(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setDocuments]);

  // Track which resources reference each document path
  const fileRefs = useMemo(() => {
    const refs: Record<string, number> = {};
    resources.forEach((r) => {
      if (r.filePath) {
        refs[r.filePath] = (refs[r.filePath] || 0) + 1;
      }
      if (r.content && r.type === 'note') {
        documents.forEach((d) => {
          if (r.content?.includes(d.name)) {
            refs[d.path] = (refs[d.path] || 0) + 1;
          }
        });
      }
    });
    return refs;
  }, [resources, documents]);

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, search]);

  const handleOpen = (doc: StudyFile) => {
    addResource({
      id: crypto.randomUUID(),
      type: toResourceType(doc.file_type),
      title: doc.name,
      filePath: doc.path,
      state: 'maximized',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: Date.now(),
    });
    logRecentDocument(doc).catch(() => {});
  };

  const confirmDelete = async (doc: StudyFile) => {
    try { await deleteWorkspaceFile(doc.path); } catch {}
    setDocuments(documents.filter((d) => d.id !== doc.id));
    setDeleteConfirm(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Documents</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {documents.length} file{documents.length !== 1 ? 's' : ''} in workspace
          </p>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..." 
            style={{ width: 220, padding: '6px 12px 6px 30px', fontSize: 13 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)' }}>
            <FileText size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {search ? 'No matching files' : 'No documents yet'}
            </div>
            <div style={{ fontSize: 12 }}>{search ? 'Try a different search' : 'Drop files on the Canvas to add them'}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', padding: '8px 4px 16px', height: '100%', alignItems: 'flex-start' }}
            >
              {filtered.map((doc) => {
                const meta = typeMeta[doc.file_type] || typeMeta.Unknown;
                const isHovered = hoveredId === doc.id;
                const refCount = fileRefs[doc.path] || 0;

                return (
                  <div key={doc.id} onMouseEnter={() => setHoveredId(doc.id)} onMouseLeave={() => { setHoveredId(null); setDeleteConfirm(null); }}
                    className="card"
                    style={{ flexShrink: 0, width: 180, padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', transition: 'transform 0.2s', transform: isHovered ? 'translateY(-2px)' : 'none', cursor: 'pointer', position: 'relative' }}
                  >
                    <div style={{ height: 130, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, position: 'relative' }}>
                      {meta.icon}
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: meta.color, opacity: 0.6 }}>{meta.label}</span>
                      {deleteConfirm === doc.id ? (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <button onClick={(e) => { e.stopPropagation(); confirmDelete(doc); }}
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--danger)', color: 'var(--primary-text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                            Delete
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: isHovered ? 'auto' : 'none', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                          <button onClick={(e) => { e.stopPropagation(); handleOpen(doc); }}
                            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}
                            title="Open on canvas">
                            <Eye size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(doc.id); }}
                            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}
                            title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                        {doc.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown'}
                        {refCount > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--primary)' }}>
                            · <Eye size={10} /> {refCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
