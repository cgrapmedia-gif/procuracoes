module.exports = {
  preset: 'ts-jest', testEnvironment: 'node', roots: ['<rootDir>/test'], testTimeout: 60000,
  globalSetup: '<rootDir>/test/global-setup.ts',
  moduleNameMapper: { '^@proc/core$': '<rootDir>/../../packages/core/src' },
};
