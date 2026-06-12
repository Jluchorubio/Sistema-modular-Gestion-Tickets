import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CompleteProfileClient } from './_components/CompleteProfileClient';

export const metadata: Metadata = {
  title: 'Completar Perfil — NEXO',
};

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={null}>
      <CompleteProfileClient />
    </Suspense>
  );
}
