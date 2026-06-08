import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PlannerScreen() {
  return (
    <View className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4">
        <Ionicons name="map" size={32} color="#16a34a" />
      </View>
      <Text className="text-gray-900 font-bold text-xl text-center">Trip Planner</Text>
      <Text className="text-gray-400 text-sm text-center mt-2 leading-5">
        Plan multi-park road trips with route optimization and weather forecasting. Coming soon.
      </Text>
    </View>
  );
}
