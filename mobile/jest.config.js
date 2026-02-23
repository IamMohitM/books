module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-native-community|@expo|expo(nent)?|expo-modules-core|@unimodules|react-native-svg|react-native-reanimated|@expo/vector-icons)/',
  ],
};
