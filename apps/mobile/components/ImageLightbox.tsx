import { useRef, useState } from 'react';
import {
  Dimensions, FlatList, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
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

  const goTo = (i: number) => {
    const next = (i + images.length) % images.length;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIdx(next);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width: W }}
              contentContainerStyle={styles.zoomContainer}
              maximumZoomScale={4}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Image
                source={{ uri: item.url }}
                style={styles.img}
                contentFit="contain"
                transition={200}
                cachePolicy="memory-disk"
              />
            </ScrollView>
          )}
        />

        {/* Counter */}
        {images.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 12 }]} pointerEvents="none">
            <Text style={styles.counterText}>{idx + 1} / {images.length}</Text>
          </View>
        )}

        {/* Close */}
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color="#FFFBF1" />
        </TouchableOpacity>

        {/* Arrows */}
        {images.length > 1 && (
          <>
            <TouchableOpacity
              style={[styles.nav, { left: 12 }]}
              onPress={() => goTo(idx - 1)}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color="#FFFBF1" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nav, { right: 12 }]}
              onPress={() => goTo(idx + 1)}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={20} color="#FFFBF1" />
            </TouchableOpacity>
          </>
        )}

        {/* Caption */}
        {images[idx]?.title ? (
          <View style={[styles.caption, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            <Text style={styles.captionText} numberOfLines={2}>{images[idx].title}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(10,9,7,0.96)',
  },
  zoomContainer: {
    width: W,
    flexGrow: 1,
    justifyContent: 'center',
  },
  img: {
    width: W,
    height: '100%',
    minHeight: 320,
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
    fontSize: 11,
    fontWeight: '700',
  },
  close: {
    position: 'absolute',
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
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
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
