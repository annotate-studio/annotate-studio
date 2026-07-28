'use client';

export default function Divider({ vertical, style }: { vertical?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      ...(vertical
        ? { width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }
        : { height: 1, width: '100%', background: 'var(--border)', margin: '4px 0', flexShrink: 0 }),
      ...style,
    }} />
  );
}
