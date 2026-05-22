const { createGateTestRunner, parseCsvInts } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);
const TEST1_DELAYS = parseCsvInts(process.env.TEST1_DELAYS, '100,300,600,900');

createGateTestRunner({
  testName: 'Test1',
  durationMs: TEST_DURATION_MS,
  setup: ({ emitSimulatorGateRequest }) => {
    console.log('Test1: simulator gate requests at', TEST1_DELAYS);
    emitSimulatorGateRequest('entry-gate', 'open');

    TEST1_DELAYS.forEach((delay, index) => {
      setTimeout(() => {
        emitSimulatorGateRequest('entry-gate', index % 2 === 0 ? 'open' : 'close');
        console.log(`Test1: emitted simulator.gate.command.request #${index + 1} after ${delay}ms`);
      }, delay);
    });
  },
});