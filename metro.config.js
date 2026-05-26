const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Alias lucide-react-native → our safe wrapper so any missing/renamed icon
// name resolves to a placeholder instead of crashing React render with
// "Element type is invalid". See components/lucide-safe.tsx for details.
config.resolver.resolverMainFields = config.resolver.resolverMainFields ?? [
  'react-native',
  'browser',
  'main',
];

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') {
    return {
      filePath: path.resolve(__dirname, 'components/lucide-safe.tsx'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
