'use client';

export default function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: 13,
    }}>
      {message}
    </div>
  );
}
