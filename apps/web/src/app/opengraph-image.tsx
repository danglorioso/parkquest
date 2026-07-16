import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ParkQuest — Track Your National Park Adventures';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F3D2E',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 100, marginBottom: 20, display: 'flex' }}>🏞️</div>
        <div style={{ fontSize: 76, fontWeight: 800, color: '#F2EBDB', letterSpacing: -2, display: 'flex' }}>
          ParkQuest
        </div>
        <div style={{ fontSize: 32, marginTop: 18, color: '#D8814F', fontWeight: 600, display: 'flex' }}>
          Track Your National Park Adventures
        </div>
      </div>
    ),
    { ...size }
  );
}
