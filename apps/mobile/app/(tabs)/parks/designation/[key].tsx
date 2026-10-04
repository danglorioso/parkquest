import { useLocalSearchParams } from 'expo-router';
import { ParksScreen } from '../index';

// Scoped copy of the all-parks screen for a single designation, pushed from
// the designation carousel at the top of /parks. Same screen, same filters —
// just seeded and locked to one PARK_TYPES key (see ParksScreen's onlyType).
export default function DesignationParksScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <ParksScreen onlyType={key} />;
}
