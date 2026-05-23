import { SkeletonInventory } from '@/components/ui/Skeleton';

export default function InventoryLoading() {
  return (
    <div style={{ padding: '28px 32px' }}>
      <SkeletonInventory />
    </div>
  );
}
