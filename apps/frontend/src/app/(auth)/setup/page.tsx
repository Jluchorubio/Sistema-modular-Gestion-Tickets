import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SetupWizardClient } from './_components/SetupWizardClient';

export const metadata: Metadata = {
  title: 'Configuración inicial — Tickets System',
};

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupWizardClient />
    </Suspense>
  );
}
