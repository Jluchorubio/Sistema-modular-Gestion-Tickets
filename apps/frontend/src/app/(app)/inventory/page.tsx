import dynamic from 'next/dynamic';
import { SkeletonInventory } from '@/components/ui/Skeleton';

const InventoryClient = dynamic(
  () => import('./_components/InventoryClient').then((m) => ({ default: m.InventoryClient })),
  { ssr: false, loading: () => <div style={{ padding: '28px 32px' }}><SkeletonInventory /></div> },
);

export default function InventoryPage() {
  return <InventoryClient />;
}
