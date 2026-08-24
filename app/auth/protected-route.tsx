'use client';

import { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  // Auth temporarily disabled for development
  return <>{children}</>;
}
