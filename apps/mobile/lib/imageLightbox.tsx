import { useEffect, useState } from 'react';
import { ImageLightboxView, type LightboxImage } from '@/components/ImageLightbox';

export type { LightboxImage };

// Mounted ONCE at the app root (see _layout.tsx, same spot as PinchZoomHost/
// ToastHost) so the lightbox always renders above every screen and is never
// clipped by whatever overflow:hidden card/container happened to trigger it
// (e.g. PostCard's own card wrapper) — and, critically, never lives inside
// an RN <Modal>, where multi-touch gestures (pinch) don't reliably register.
// Screens call openImageLightbox() imperatively instead of rendering the
// lightbox inline, same calling convention as lib/pinchZoom's store.

interface LightboxRequest {
  images: LightboxImage[];
  initialIndex: number;
  loop: boolean;
  onClose: (finalIndex: number) => void;
}

let openFn: ((req: LightboxRequest) => void) | null = null;

export function openImageLightbox(req: {
  images: LightboxImage[];
  initialIndex?: number;
  loop?: boolean;
  onClose: (finalIndex: number) => void;
}) {
  openFn?.({
    images: req.images,
    initialIndex: req.initialIndex ?? 0,
    loop: req.loop ?? true,
    onClose: req.onClose,
  });
}

export function ImageLightboxHost() {
  const [request, setRequest] = useState<LightboxRequest | null>(null);

  useEffect(() => {
    openFn = setRequest;
    return () => { openFn = null; };
  }, []);

  if (!request) return null;

  return (
    <ImageLightboxView
      images={request.images}
      initialIndex={request.initialIndex}
      loop={request.loop}
      onClose={finalIndex => {
        setRequest(null);
        request.onClose(finalIndex);
      }}
    />
  );
}
