const path = require('path');
const fs = require('fs');

// Simulate what TestCoverageAnalyzer does
const projectRoot = '/Users/aleks/Dev/casper/playground';
const nodeFilePath = 'cb_root/photos-portal/server/src/controllers/authController.ts';

const baseFileName = path.basename(nodeFilePath, path.extname(nodeFilePath));
const dirName = path.dirname(nodeFilePath);

console.log('Project Root:', projectRoot);
console.log('Node File Path:', nodeFilePath);
console.log('Base File Name:', baseFileName);
console.log('Dir Name:', dirName);
console.log('');

const patterns = [
  // Same directory
  path.join(dirName, `${baseFileName}.test.ts`),
  path.join(dirName, `${baseFileName}.test.js`),
  path.join(dirName, `${baseFileName}.spec.ts`),
  path.join(dirName, `${baseFileName}.spec.js`),

  // __tests__ subdirectory
  path.join(dirName, '__tests__', `${baseFileName}.test.ts`),
  path.join(dirName, '__tests__', `${baseFileName}.test.js`),

  // tests directory at project root
  path.join(projectRoot, 'tests', `${baseFileName}.test.ts`),
  path.join(projectRoot, 'test', `${baseFileName}.test.ts`),

  // Mirror structure in test directory
  path.join(projectRoot, 'tests', path.relative(projectRoot, nodeFilePath).replace(/\.ts$/, '.test.ts')),
  path.join(projectRoot, 'test', path.relative(projectRoot, nodeFilePath).replace(/\.ts$/, '.test.ts'))
];

console.log('Checking patterns:');
patterns.forEach((pattern, idx) => {
  const exists = fs.existsSync(pattern);
  console.log(`${idx + 1}. ${exists ? '✅' : '❌'} ${pattern}`);
});

// Check the actual test file location
const actualTestFile = 'cb_root/photos-portal/server/src/controllers/authController.test.ts';
console.log('');
console.log('Actual test file exists:', fs.existsSync(actualTestFile) ? '✅' : '❌', actualTestFile);
