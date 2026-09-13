import { TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import { useColors } from '@/lib/palette';

// Mirrors the desktop admin dashboard's AdminNav (apps/web/src/app/admin/AdminNav.tsx)
// as a native dropdown menu instead of a link bar — same destinations, plus a
// checkmark on whichever admin screen is currently open.
const ITEMS: { path: string; label: string; icon: string }[] = [
  { path: '/admin',         label: 'Dashboard', icon: 'square.grid.2x2' },
  { path: '/admin/parks',   label: 'Parks',     icon: 'tree' },
  { path: '/admin/posts',   label: 'Posts',     icon: 'photo' },
  { path: '/admin/users',   label: 'Users',     icon: 'person.2' },
  { path: '/admin/badges',  label: 'Badges',    icon: 'rosette' },
  { path: '/admin/visits',  label: 'Visits',    icon: 'mappin.and.ellipse' },
  { path: '/admin/reports', label: 'Reports',   icon: 'flag' },
];

export function AdminMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const T = useColors();

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        router.navigate(nativeEvent.event as never);
      }}
      actions={ITEMS.map(item => ({
        id: item.path,
        title: item.label,
        image: item.icon,
        // Explicit imageColor — the menu lib's new-arch bridge tints unset
        // icons transparent (see the same note on the parks-tab view toggle).
        imageColor: T.primary,
        state: pathname === item.path ? 'on' : 'off',
        attributes: { disabled: pathname === item.path },
      }))}
    >
      <TouchableOpacity
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="menu-outline" size={22} color={T.primary} />
      </TouchableOpacity>
    </MenuView>
  );
}
