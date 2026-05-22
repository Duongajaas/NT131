const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);
const REPEAT_COUNT = parseInt(process.env.TEST4_REPEAT_COUNT || '5', 10);
const STEP_DELAY_MS = parseInt(process.env.TEST4_STEP_DELAY_MS || '250', 10);
const GATE_ID = process.env.TEST4_GATE_ID || 'entry-gate';
const GATE_COMMAND = process.env.TEST4_GATE_COMMAND || 'open';
const ALTERNATE_COMMAND = GATE_COMMAND === 'open' ? 'close' : 'open';
const expectedStateForCommand = (command) => (command === 'open' ? 'open' : 'closed');

createGateTestRunner({
  testName: 'Test4',
  durationMs: TEST_DURATION_MS,
  setup: ({ socket, recordLatency, finish }) => {
    console.log(`Test4: measuring gate.state.changed ${REPEAT_COUNT} times on ${GATE_ID}`);

    let cycle = 0;

    const runCycle = () => {
      if (cycle >= REPEAT_COUNT) {
        finish();
        return;
      }

      const cycleNumber = cycle + 1;
      const command = cycle % 2 === 0 ? GATE_COMMAND : ALTERNATE_COMMAND;
      const expectedState = expectedStateForCommand(command);
      const sentAt = Date.now();
      const correlationId = `test4-${cycleNumber}-${sentAt}`;
      let settled = false;

      const cleanup = () => {
        socket.off('realtime.event', onRealtimeEvent);
        clearTimeout(fallbackTimer);
      };

      const proceed = () => {
        cycle++;
        setTimeout(runCycle, STEP_DELAY_MS);
      };

      const fallbackTimer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        recordLatency('gate.state.changed.timeout', sentAt, `gateId=${GATE_ID} command=${command} expectedState=${expectedState} correlationId=${correlationId}`);
        cleanup();
        proceed();
      }, 6000);

      const onRealtimeEvent = (envelope) => {
        if (settled || !envelope || typeof envelope !== 'object') {
          return;
        }

        if (envelope.eventName !== 'gate.state.changed') {
          return;
        }

        const payload = envelope.payload || {};
        if (payload.gateId !== GATE_ID || payload.state !== expectedState) {
          return;
        }

        const eventCorrelationId = envelope.correlationId;
        if (eventCorrelationId && eventCorrelationId !== correlationId) {
          return;
        }

        settled = true;
        recordLatency('gate.state.changed', sentAt, `gateId=${payload.gateId} state=${payload.state} command=${command} correlationId=${eventCorrelationId || correlationId}`);
        cleanup();
        proceed();
      };

      socket.on('realtime.event', onRealtimeEvent);
      socket.emit(
        'simulator.gate.command.request',
        { gateId: GATE_ID, command, correlationId, ts: sentAt },
        (ack) => {
          console.log(`Test4: cycle ${cycleNumber}/${REPEAT_COUNT} ack:`, JSON.stringify(ack));
        }
      );
    };

    runCycle();
  },
});