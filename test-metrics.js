const escomplex = require('typhonjs-escomplex');

// Test with simple JavaScript code
const simpleCode = `
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].price > 0) {
      total += items[i].price;
    }
  }
  return total;
}
`;

try {
  const result = escomplex.analyzeModule(simpleCode, { loc: true, newmi: true });
  console.log('Analysis result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}
