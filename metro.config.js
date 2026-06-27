const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'tflite' to assetExts so Metro bundles the model files natively
config.resolver.assetExts.push('tflite');

module.exports = config;
