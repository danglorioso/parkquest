import { Image, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Same fullscreen-avatar treatment as profile/edit.tsx's "View photo" action —
// plain fade-in modal, tap-anywhere-to-close, no zoom/swipe (unlike
// ImageLightbox, which is for multi-photo galleries).
export function AvatarLightbox({ visible, url, onClose }: {
  visible: boolean;
  url?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        {url && (
          <Image source={{ uri: url }} style={{ width: '86%', aspectRatio: 1, borderRadius: 16 }} resizeMode="cover" />
        )}
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}
