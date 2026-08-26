'use client';

import React from 'react';
import {
  LayoutGrid,
  NotebookText,
  ScrollText,
  Timer,
  Heart,
  Settings,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import { useStore, type ViewMode } from '@/lib/store';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  view: ViewMode;
  badge?: number;
}

export default function Sidebar() {
  const {
    currentView, setView, sidebarExpanded, toggleSidebar,
    flashcardStats,
  } = useStore();

  const NAV_ITEMS: NavItem[] = [
    { icon: <LayoutGrid size={sidebarExpanded ? 18 : 20} />, label: 'Canvas', view: 'canvas' },
    { icon: <NotebookText size={sidebarExpanded ? 18 : 20} />, label: 'Flashcards', view: 'flashcards', badge: flashcardStats?.due },
    { icon: <ScrollText size={sidebarExpanded ? 18 : 20} />, label: 'Exams', view: 'exams' },
    { icon: <Timer size={sidebarExpanded ? 18 : 20} />, label: 'Pomodoro', view: 'pomodoro' },
    { icon: <Heart size={sidebarExpanded ? 18 : 20} />, label: 'Motivation', view: 'motivation' },
    { icon: <Settings size={sidebarExpanded ? 18 : 20} />, label: 'Settings', view: 'settings' },
  ];

  return (
    <nav
      style={{
        width: sidebarExpanded ? 'var(--sidebar-width-expanded)' : 'var(--sidebar-width-collapsed)',
        height: '100%',
            background: 'var(--bg-app)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 50,
        position: 'relative',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Logo + hamburger */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: sidebarExpanded ? 'space-between' : 'center',
        padding: sidebarExpanded ? '0 16px 0 20px' : '0',
      }}>
        {sidebarExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
                  background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--primary-text)', flexShrink: 0,
            }}>
              S
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              Annotate Studio
            </span>
          </div>
        )}
        <button onClick={toggleSidebar}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            marginLeft: sidebarExpanded ? 0 : 'auto',
            marginRight: sidebarExpanded ? 0 : 'auto',
          }}
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarExpanded ? <ChevronLeft size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const active = currentView === item.view;
          return (
            <React.Fragment key={item.view}>
              <button
                onClick={() => setView(item.view)}
                title={item.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: sidebarExpanded ? '10px 12px' : '10px 0',
                  justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                  borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--primary-light)' : 'transparent',
                  position: 'relative', transition: 'all 0.15s ease',
                  width: '100%', textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--primary-light)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 20, borderRadius: '0 3px 3px 0', background: 'var(--primary)',
                  }} />
                )}
                <span style={{
                  width: sidebarExpanded ? 20 : 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.icon}
                </span>
                {sidebarExpanded && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{item.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="pulse-dot" style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                          background: 'var(--danger)', color: 'var(--primary-text)',
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}