'use client';

import React from 'react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export default function LoadingState({
  message = 'Loading...',
  className = '',
}: LoadingStateProps) {
  return (
    <div className={`flex-1 flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)] text-sm ${className}`}>      
      {message}
    </div>
  );
}
