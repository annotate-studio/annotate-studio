'use client';

import React from 'react';
import IconButton from './IconButton';

type TrafficAction = 'minimize' | 'maximize' | 'close';

interface TrafficLightsProps {
  onAction: (action: TrafficAction) => void;
  isFullscreen?: boolean;
  showMaximize?: boolean;
}

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
      className='opacity-0 font-bold text-xs transition-opacity duration-100'
      style={{ color: color.text }}
    >
      {label}
    </span>
  );
}

export default function TrafficLights({ onAction, isFullscreen, showMaximize = true }: TrafficLightsProps) {
  return (
    <div className='flex gap-1.5 items-center flex-shrink-0' onClick={(e) => e.stopPropagation()}>
      <IconButton
        onClick={(e) => { e.stopPropagation(); onAction('minimize'); }}
        size='sm'
        variant='default'
        title='Minimize'
        className='transition-transform duration-150'
        style={{ backgroundColor: colors.minimize.bg }}
      >
        <Dot label='−' color={colors.minimize} />
      </IconButton>

      {showMaximize && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onAction(isFullscreen ? 'close' : 'maximize'); }}
          size='sm'
          variant='default'
          title={isFullscreen ? 'Exit Fullscreen' : 'Maximize'}
          className='transition-transform duration-150'
          style={{ backgroundColor: colors.maximize.bg }}
        >
          <Dot label={isFullscreen ? '−' : '+'} color={colors.maximize} />
        </IconButton>
      )}

      <IconButton
        onClick={(e) => { e.stopPropagation(); onAction('close'); }}
        size='sm'
        variant='default'
        title='Close'
        className='transition-transform duration-150'
        style={{ backgroundColor: colors.close.bg }}
      >
        <Dot label='×' color={colors.close} />
      </IconButton>
    </div>
  );
}
