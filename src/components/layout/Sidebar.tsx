'use client';

import React from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  FileQuestion,
  FolderOpen,
  HeartHandshake,
  Layers,
  LayoutGrid,
  Settings,
  Timer,
} from 'lucide-react';
import { useApp, type ViewMode } from '@/store/app';
import { usePomodoro } from '@/store/pomodoro';
import { useSettings } from '@/store/settings';
import { cn, formatDuration } from '@/lib/utils';

interface NavItem {
  view: ViewMode;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

const NAV: NavItem[] = [
  { view: 'canvas', label: 'Canvas', icon: <LayoutGrid size={19} />, shortcut: 'Ctrl+1' },
  { view: 'library', label: 'Library', icon: <FolderOpen size={19} />, shortcut: 'Ctrl+2' },
  { view: 'flashcards', label: 'Flashcards', icon: <Layers size={19} />, shortcut: 'Ctrl+3' },
  { view: 'exams', label: 'Exams', icon: <FileQuestion size={19} />, shortcut: 'Ctrl+4' },
  { view: 'pomodoro', label: 'Pomodoro', icon: <Timer size={19} />, shortcut: 'Ctrl+5' },
  { view: 'motivation', label: 'Motivation', icon: <HeartHandshake size={19} />, shortcut: 'Ctrl+6' },
];

function NavButton({ item, active, expanded, badge, extra }: { item: NavItem; active: boolean; expanded: boolean; badge?: number; extra?: string }) {
  const setView = useApp((state) => state.setView);
  return (
    <button
      type="button"
      className={cn('nav-item', active && 'nav-item-active')}
      onClick={() => setView(item.view)}
      title={expanded ? item.shortcut : `${item.label} (${item.shortcut})`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon">
        {item.icon}
        {!expanded && badge ? <span className="nav-dot" /> : null}
      </span>
      {expanded && <span className="nav-label">{item.label}</span>}
      {expanded && extra && <span className="nav-extra">{extra}</span>}
      {expanded && badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}

export default function Sidebar() {
  const currentView = useApp((state) => state.currentView);
  const dueCards = useApp((state) => state.dueCards);
  const expanded = useSettings((state) => state.sidebarExpanded);
  const update = useSettings((state) => state.update);
  const pomodoroStatus = usePomodoro((state) => state.status);
  const remaining = usePomodoro((state) => state.remaining);

  return (
    <nav className={cn('sidebar', expanded && 'sidebar-expanded')} aria-label="Main navigation">
      <div className="sidebar-nav">
        {NAV.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            active={currentView === item.view}
            expanded={expanded}
            badge={item.view === 'flashcards' ? dueCards : undefined}
            extra={item.view === 'pomodoro' && pomodoroStatus !== 'idle' ? formatDuration(remaining) : undefined}
          />
        ))}
      </div>
      <div className="sidebar-footer">
        <NavButton item={{ view: 'settings', label: 'Settings', icon: <Settings size={19} />, shortcut: 'Ctrl+,' }} active={currentView === 'settings'} expanded={expanded} />
        <button
          type="button"
          className="nav-item nav-toggle"
          onClick={() => update({ sidebarExpanded: !expanded })}
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="nav-icon">{expanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}</span>
          {expanded && <span className="nav-label">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
