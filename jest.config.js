const path = require('path');
const esModules = [].join('|');

module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['<rootDir>/src/polyfills-test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/zone-testing-setup.ts'],
  transformIgnorePatterns: [`<rootDir>/node_modules/(?!${esModules})`],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        allowSyntheticDefaultImports: true,
        tsconfig: path.resolve(__dirname, 'src/tsconfig.spec.json'),
      },
    ],
    '^.+\\.js$': 'babel-jest',
  },
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1,
  moduleNameMapper: {
    '^sailpoint-components$': '<rootDir>/projects/sailpoint-components/src/public-api'
  }
};
