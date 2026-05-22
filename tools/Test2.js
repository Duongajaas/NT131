const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);

createGateTestRunner({
  testName: 'Test2',
  durationMs: TEST_DURATION_MS,
  setup: ({ emitSimulatorGateRequest }) => {
    console.log('Test2: alternating entry/exit gate requests');

    for (let index = 0; index < 5; index++) {
      setTimeout(() => {
        emitSimulatorGateRequest(index % 2 === 0 ? 'entry-gate' : 'exit-gate', 'open');
        console.log(`Test2: emitted alternating gate request ${index + 1}/5`);
      }, 800 + index * 250);
    }
  },
});