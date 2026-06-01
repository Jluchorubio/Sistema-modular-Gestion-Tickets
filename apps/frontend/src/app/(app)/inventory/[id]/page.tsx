import dynamic from 'next/dynamic';

const AssetDetailClient = dynamic(
  () => import('./_components/AssetDetailClient').then(m => ({ default: m.AssetDetailClient })),
  { ssr: false },
);

interface Props {
  params: { id: string };
}

export default function AssetDetailPage({ params }: Props) {
  return <AssetDetailClient assetId={params.id} />;
}
