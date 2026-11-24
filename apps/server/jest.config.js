/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // scripts/는 빌드하지 않는 Node 스크립트(CommonJS)라 그대로 읽는다(백필 스크립트 테스트)
  transformIgnorePatterns: ['/node_modules/', '/scripts/[^/]+\\.js$'],
  collectCoverageFrom: ['**/*.(t|j)s', '!**/main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
