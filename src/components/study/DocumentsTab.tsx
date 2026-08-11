'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { FileText, Image as ImageIcon, HelpCircle, Trash2, FileType, Search, Clock, Calendar, ExternalLink } from 'lucide-react';
import { useStore } from '@/lib/store';
import { getAllFiles, logRecentDocument, getRecentDocuments, deleteWorkspaceFile } from '@/lib/tauri-commands';
import type { StudyFile } from '@/lib/tauri-commands';
import Dialog from '@/components/ui/Dialog';

const typeMeta: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  Pdf: { label: 'PDF', color: '#DC2626', bg: '#FEF2F2', icon: <FileText size={56} style={{ color: '#DC2626' }} /> },
  Markdown: { label: 'MD', color: '#2563EB', bg: '#EFF6FF', icon: <FileType size={56} style={{ color: '#2563EB' }} /> },
  Image: { label: 'IMG', color: '#059669', bg: '#ECFDF5', icon: <ImageIcon size={56} style={{ color: '#059669' }} /> },
  Unknown: { label: '?', color: '#6B7280', bg: '#F3F4F6', icon: <HelpCircle size={56} style={{ color: '#6B7280' }} /> },
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
  const [deleteTarget, setDeleteTarget] = useState<StudyFile | null>(null);
  const [previewDoc, setPreviewDoc] = useState<StudyFile | null>(null);

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
    setPreviewDoc(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteWorkspaceFile(deleteTarget.path); } catch {}
    setDocuments(documents.filter((d) => d.id !== deleteTarget.id));
    setDeleteTarget(null);
    setPreviewDoc(null);
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

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 10 }}>
            <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading documents...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <FileText size={28} style={{ opacity: 0.3 }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {search ? 'No matching files' : 'No documents yet'}
            </div>
            <div style={{ fontSize: 12 }}>{search ? 'Try a different search term' : 'Drop files on the Canvas to add them'}</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            alignContent: 'start',
          }}>
            {filtered.map((doc) => {
              const meta = typeMeta[doc.file_type] || typeMeta.Unknown;
              const isHovered = hoveredId === doc.id;

              return (
                <div
                  key={doc.id}
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setPreviewDoc(doc)}
                  className="card"
                  style={{
                    padding: 0, overflow: 'hidden',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    transform: isHovered ? 'translateY(-4px)' : 'none',
                    boxShadow: isHovered ? '0 10px 28px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{
                    height: 150, background: meta.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 8,
                  }}>
                    {meta.icon}
                    <span style={{
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                      color: meta.color, opacity: 0.5,
                    }}>
                      {meta.label}
                    </span>
                  </div>

                  <div style={{ padding: '12px 14px' }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 8,
                    }}>
                      {doc.name}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, fontSize: 11, color: 'var(--text-muted)',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                        <Calendar size={11} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown'}
                        </span>
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600, color: meta.color,
                        background: meta.bg, padding: '2px 6px', borderRadius: 'var(--radius-pill)',
                        flexShrink: 0,
                      }}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onClose={() => setPreviewDoc(null)} title="Document" width={500}>
        {previewDoc && (() => {
          const meta = typeMeta[previewDoc.file_type] || typeMeta.Unknown;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                height: 200, background: meta.bg, borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 10,
              }}>
                {meta.icon}
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: meta.color, opacity: 0.5 }}>
                  {meta.label}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  {previewDoc.name}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, color: meta.color,
                    background: meta.bg, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                  }}>
                    {meta.label}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Calendar size={13} style={{ flexShrink: 0 }} />
                  <span>Created: {previewDoc.created_at ? new Date(previewDoc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Clock size={13} style={{ flexShrink: 0 }} />
                  <span>Last opened: {previewDoc.lastOpened ? new Date(previewDoc.lastOpened).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  <FileText size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewDoc.path}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <button
                  onClick={() => setDeleteTarget(previewDoc)}
                  className="btn"
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid transparent', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--danger)', background: 'var(--bg-surface)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button
                  onClick={() => handleOpen(previewDoc)}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--primary-text)', background: 'var(--primary)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <ExternalLink size={14} /> Open on Canvas
                </button>
              </div>
            </div>
          );
        })()}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Document" width={380}>
        {deleteTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.name}</strong>? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn"
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                  background: 'transparent',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: '#fff', background: '#DC2626',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
