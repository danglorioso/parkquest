import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { getBadges } from '@/lib/api';
import type { Badge, BadgeTier } from '@parkquest/types';

const TIER_COLOR: Record<BadgeTier, string> = {
  bronze: '#B27339',
  silver: '#A8A39B',
  gold: '#D4A93F',
  platinum: '#6E97A3',
  legendary: '#8B5DBF',
};

const TIER_ORDER: BadgeTier[] = ['legendary', 'platinum', 'gold', 'silver', 'bronze'];

function BadgeItem({ badge }: { badge: Badge }) {
  const color = TIER_COLOR[badge.tier] ?? '#6b7280';
  const pct = badge.progress_target && badge.progress_target > 0
    ? Math.min(100, Math.round((badge.progress_current! / badge.progress_target!) * 100))
    : 0;

  return (
    <View
      style={[
        styles.badgeCard,
        badge.earned ? { borderColor: `${color}55`, backgroundColor: `${color}08` } : undefined,
      ]}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: badge.earned ? `${color}22` : '#f3f4f6',
          borderWidth: 1.5,
          borderColor: badge.earned ? `${color}55` : '#e5e7eb',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: badge.earned ? 1 : 0.5,
        }}
      >
        <Text style={{ fontSize: 24 }}>{badge.emoji}</Text>
      </View>
      <View className="flex-1 ml-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-gray-900" style={{ opacity: badge.earned ? 1 : 0.6 }}>{badge.name}</Text>
          {badge.earned && (
            <View style={{ backgroundColor: `${color}22`, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color }}>✓ EARNED</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-400 mt-0.5 leading-4" numberOfLines={2}>{badge.description}</Text>
        {!badge.earned && badge.progress_current !== null && badge.progress_target !== null && (
          <View className="mt-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-gray-400">{badge.progress_current} / {badge.progress_target}</Text>
              <Text className="text-xs text-gray-400">{pct}%</Text>
            </View>
            <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 99 }} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export default function BadgesScreen() {
  const { getToken } = useAuth();

  const { data: badgesData, isLoading } = useQuery({
    queryKey: ['badges'],
    queryFn: async () => { const t = await getToken(); return getBadges(t!); },
  });

  const badges = badgesData?.badges ?? [];
  const stats = badgesData?.stats;

  const byTier = TIER_ORDER.reduce<Record<BadgeTier, Badge[]>>((acc, tier) => {
    acc[tier] = badges.filter((b: Badge) => b.tier === tier);
    return acc;
  }, {} as Record<BadgeTier, Badge[]>);

  const earnedCount = badges.filter((b: Badge) => b.earned).length;

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View className="bg-white px-4 py-5 mb-3 border-b border-gray-100">
          <View className="flex-row items-baseline gap-2">
            <Text className="text-3xl font-black text-gray-900">{earnedCount}</Text>
            <Text className="text-gray-400 font-medium">/ {badges.length} earned</Text>
          </View>
          {stats && (
            <Text className="text-sm text-gray-500 mt-1">
              {stats.parksVisited} parks visited · {stats.statesVisited} states
            </Text>
          )}
        </View>

        {TIER_ORDER.map(tier => {
          const tierBadges = byTier[tier];
          if (!tierBadges || tierBadges.length === 0) return null;
          const color = TIER_COLOR[tier];
          const earnedInTier = tierBadges.filter(b => b.earned).length;
          return (
            <View key={tier} className="mb-3">
              <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 8 }} />
                <Text className="text-sm font-bold text-gray-700 capitalize flex-1">{tier}</Text>
                <Text className="text-xs text-gray-400">{earnedInTier} / {tierBadges.length}</Text>
              </View>
              <View className="bg-white px-3 pb-2">
                {tierBadges.map(badge => <BadgeItem key={badge.id} badge={badge} />)}
              </View>
            </View>
          );
        })}

        <View className="h-8" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
});
