import { useRef, useState } from 'react';
import {
  Dimensions, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width: W } = Dimensions.get('window');

export interface LightboxImage {
  url: string;
  title?: string | null;
}

export function ImageLightbox({
  images, initialIndex = 0, onClose,
}: {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(initialIndex);
  const listRef = useRef<FlatList<LightboxImage>>(null);
  const n = images.length;

  const goTo = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIdx(next);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        {/* Fullscreen pager — swipe anywhere to change image */}
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(_, k) => String(k)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
          onMomentumScrollEnd={e => {
            setIdx(Math.round(e.nativeEvent.contentOffset.x / W));
          }}
          renderItem={({ item }) => (
            <View style={styles.page}>
              <Image
                source={{ uri: item.url }}
                style={styles.img}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
          )}
        />

        {/* Counter chip — top left */}
        {n > 1 && (
          <View style={[styles.counter, { top: insets.top + 12 }]} pointerEvents="none">
            <Text style={styles.counterText}>{idx + 1} / {n}</Text>
          </View>
        )}

        {/* Close */}
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={16}
        >
          <Ionicons name="close" size={22} color="#FFFBF1" />
        </TouchableOpacity>

        {/* Prev arrow */}
        {idx > 0 && (
          <TouchableOpacity
            style={[styles.nav, { left: 16 }]}
            onPress={() => goTo(idx - 1)}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Next arrow */}
        {idx < n - 1 && (
          <TouchableOpacity
            style={[styles.nav, { right: 16 }]}
            onPress={() => goTo(idx + 1)}
          >
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Caption */}
        {images[idx]?.title ? (
          <View style={[styles.caption, { bottom: insets.bottom + 64 }]} pointerEvents="none">
            <Text style={styles.captionText} numberOfLines={2}>{images[idx].title}</Text>
          </View>
        ) : null}

        {/* Dot strip */}
        {n > 1 && (
          <View style={[styles.dots, { bottom: insets.bottom + 28 }]}>
            {images.map((_, k) => (
              <TouchableOpacity key={k} onPress={() => goTo(k)}>
                <View style={[styles.dot, k === idx ? styles.dotActive : styles.dotInactive]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
  },
  page: {
    width: W,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '90%',
    height: '75%',
  },
  counter: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  counterText: {
    color: '#FFFBF1',
    fontSize: 13,
    fontWeight: '700',
  },
  close: {
    position: 'absolute',
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  captionText: {
    color: 'rgba(255,251,241,0.85)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 17,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: '#fff' },
  dotInactive: { width: 7, backgroundColor: 'rgba(255,255,255,0.35)' },
});
