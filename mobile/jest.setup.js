import '@testing-library/jest-native/extend-expect';

// Silence Animated warnings from react-native in tests.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
