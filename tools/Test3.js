const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);
const FLOOD_COUNT = parseInt(process.env.TEST3_FLOOD_COUNT || '50', 10);
const FLOOD_BURST = parseInt(process.env.TEST3_BURST_SIZE || '10', 10);
const FLOOD_BURST_INTERVAL_MS = parseInt(process.env.TEST3_BURST_INTERVAL_MS || '200', 10);

createGateTestRunner({
  testName: 'Test3',
  durationMs: TEST_DURATION_MS,
  setup: ({ emitSimulatorGateRequest }) => {
    console.log(`Test3: flooding ${FLOOD_COUNT} gate commands in bursts of ${FLOOD_BURST}`);

    let emitted = 0;
    let burstIndex = 0;
    const floodInterval = setInterval(() => {
      for (let index = 0; index < FLOOD_BURST && emitted < FLOOD_COUNT; index++) {
        emitted++;
        emitSimulatorGateRequest('exit-gate', emitted % 2 === 0 ? 'open' : 'close');
      }

      console.log(`Test3: burst ${burstIndex++} sent, total emitted=${emitted}`);
      if (emitted >= FLOOD_COUNT) {
        clearInterval(floodInterval);
      }
    }, FLOOD_BURST_INTERVAL_MS);
  },
});