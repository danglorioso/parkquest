const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so Metro picks up workspace packages
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Packages installed at the monorepo root that Metro can't traverse to
// (Metro stops traversal at projectRoot when using a custom resolveRequest).
const rootPkg = (name) => path.resolve(monorepoRoot, 'node_modules', name);
config.resolver.extraNodeModules = {
  'expo-blur': rootPkg('expo-blur'),
  'expo-document-picker': rootPkg('expo-document-picker'),
  'expo-glass-effect': rootPkg('expo-glass-effect'),
  'expo-haptics': rootPkg('expo-haptics'),
  'expo-image-manipulator': rootPkg('expo-image-manipulator'),
  'expo-media-library': rootPkg('expo-media-library'),
  'expo-sensors': rootPkg('expo-sensors'),
  'expo-sms': rootPkg('expo-sms'),
  'react-native-view-shot': rootPkg('react-native-view-shot'),
  '@react-native-community/netinfo': rootPkg('@react-native-community/netinfo'),
  '@react-native-community/slider': rootPkg('@react-native-community/slider'),
  '@react-native-segmented-control/segmented-control': rootPkg('@react-native-segmented-control/segmented-control'),
  '@sentry/react-native': rootPkg('@sentry/react-native'),
};

// Hard-pin singleton packages to the monorepo root. Uses Metro's own resolver
// with a spoofed originModulePath so it always finds the root copy.
const SINGLETONS = ['react', 'react-native'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const match = SINGLETONS.find(
    s => moduleName === s || moduleName.startsWith(s + '/')
  );
  if (match) {
    return context.resolveRequest(
      {
        ...context,
        originModulePath: path.resolve(monorepoRoot, 'node_modules', match, 'index.js'),
      },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
