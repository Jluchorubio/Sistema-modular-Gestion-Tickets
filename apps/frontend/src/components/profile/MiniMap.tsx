'use client';

interface MiniMapProps {
  lat: number;
  lon: number;
  city?: string | null;
  country?: string | null;
  zoom?: number;
}

function latLonToTile(lat: number, lon: number, z: number) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

function pixelOffset(lat: number, lon: number, z: number, tx: number, ty: number) {
  const n = Math.pow(2, z);
  const ex = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const ey =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { px: (ex - tx) * 256, py: (ey - ty) * 256 };
}

export function MiniMap({ lat, lon, zoom = 10 }: MiniMapProps) {
  const { x: cx, y: cy } = latLonToTile(lat, lon, zoom);
  const { px, py } = pixelOffset(lat, lon, zoom, cx, cy);

  // 3×3 tile grid (768×768) centered so location dot sits at container center (70, 50)
  const gridLeft = 70 - (256 + px);
  const gridTop  = 50 - (256 + py);

  return (
    <div
      style={{
        position: 'relative',
        width: 140,
        height: 100,
        overflow: 'hidden',
        borderRadius: 8,
        border: '1px solid #E2E8F0',
        background: '#E8F0F8',
        flexShrink: 0,
      }}
    >
      {/* 3×3 OSM tile grid */}
      <div
        style={{
          position: 'absolute',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 256px)',
          left: gridLeft,
          top: gridTop,
          pointerEvents: 'none',
        }}
      >
        {[-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => (
            <img
              key={`${dx}-${dy}`}
              src={`https://tile.openstreetmap.org/${zoom}/${cx + dx}/${cy + dy}.png`}
              width={256}
              height={256}
              alt=""
              style={{ display: 'block', userSelect: 'none' }}
            />
          )),
        )}
      </div>

      {/* Location dot */}
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 50,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#3B82F6',
            border: '2px solid #fff',
            boxShadow: '0 0 0 3px rgba(59,130,246,0.25)',
          }}
        />
      </div>

      {/* OSM attribution (required by license) */}
      <a
        href="https://www.openstreetmap.org"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute',
          bottom: 2,
          right: 4,
          fontSize: 8,
          color: '#475569',
          background: 'rgba(255,255,255,0.75)',
          padding: '1px 3px',
          borderRadius: 2,
          textDecoration: 'none',
          lineHeight: 1.4,
        }}
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
