import { useRef, useState } from 'react';
import {
  Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
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

  // For wrap-around swiping, pad the real data with a clone of the last image
  // up front and a clone of the first image at the end. List index `k` maps
  // to real image index `k - 1`. Landing on a clone snaps silently (no
  // animation) to its real counterpart, giving the illusion of an infinite loop.
  const loopData = n > 1 ? [images[n - 1], ...images, images[0]] : images;
  const initialListIndex = n > 1 ? initialIndex + 1 : initialIndex;

  const goTo = (k: number) => {
    if (n <= 1) return;
    const real = ((k % n) + n) % n;
    listRef.current?.scrollToIndex({ index: real + 1, animated: true });
    setIdx(real);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        {/* Fullscreen pager — swipe anywhere to change image, wraps at the ends */}
        <FlatList
          ref={listRef}
          data={loopData}
          keyExtractor={(_, k) => String(k)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          initialScrollIndex={initialListIndex}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
          onMomentumScrollEnd={e => {
            if (n <= 1) return;
            const listIndex = Math.round(e.nativeEvent.contentOffset.x / W);
            if (listIndex === 0) {
              listRef.current?.scrollToIndex({ index: n, animated: false });
              setIdx(n - 1);
            } else if (listIndex === n + 1) {
              listRef.current?.scrollToIndex({ index: 1, animated: false });
              setIdx(0);
            } else {
              setIdx(listIndex - 1);
            }
          }}
          renderItem={({ item }) => (
            <Pressable style={styles.page} onPress={onClose}>
              <Pressable style={styles.img} onPress={() => {}}>
                <Image
                  source={{ uri: item.url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </Pressable>
            </Pressable>
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

        {/* Prev arrow — wraps to the last image */}
        {n > 1 && (
          <TouchableOpacity
            style={[styles.nav, { left: 16 }]}
            onPress={() => goTo(idx - 1)}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Next arrow — wraps to the first image */}
        {n > 1 && (
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
