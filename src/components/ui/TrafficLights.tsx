'use client';

import React from 'react';

type TrafficAction = 'minimize' | 'maximize' | 'close';

interface TrafficLightsProps {
  onAction: (action: TrafficAction) => void;
  isFullscreen?: boolean;
  showMaximize?: boolean;
}

const btnBase: React.CSSProperties = {
  width: 12, height: 12, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const dotBase: React.CSSProperties = {
  opacity: 0, fontSize: 8, lineHeight: 1, fontWeight: 700,
  transition: 'opacity 0.1s',
};

const colors = {
  close: { bg: '#FF5F57', text: '#4a1c1c' },
  maximize: { bg: '#FEBC2E', text: '#594300' },
  minimize: { bg: '#28C840', text: '#0a4d1e' },
};

function Dot({ label, color }: { label: string; color: typeof colors[keyof typeof colors] }) {
  const dotRef = React.useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={dotRef}
      onMouseEnter={() => { if (dotRef.current) dotRef.current.style.opacity = '1'; }}
      onMouseLeave={() => { if (dotRef.current) dotRef.current.style.opacity = '0'; }}
      style={{ ...dotBase, color: color.text }}
    >
      {label}
    </span>
  );
}

export default function TrafficLights({ onAction, isFullscreen, showMaximize = true }: TrafficLightsProps) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
      onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); onAction('minimize'); }}
        style={{ ...btnBase, background: colors.minimize.bg }}
        title="Minimize">
        <Dot label="−" color={colors.minimize} />
      </button>
      {showMaximize && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction(isFullscreen ? 'close' : 'maximize'); }}
          style={{ ...btnBase, background: colors.maximize.bg }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Maximize'}>
          <Dot label={isFullscreen ? '−' : '+'} color={colors.maximize} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onAction('close'); }}
        style={{ ...btnBase, background: colors.close.bg }}
        title="Close">
        <Dot label="×" color={colors.close} />
      </button>
    </div>
  );
}
