import { Spinner } from '@/components/ui/Spinner';

export default function AppLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner />
    </div>
  );
}
