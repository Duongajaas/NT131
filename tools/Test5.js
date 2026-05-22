const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10);
const REPEAT_COUNT = parseInt(process.env.TEST5_REPEAT_COUNT || '5', 10);
const STEP_DELAY_MS = parseInt(process.env.TEST5_STEP_DELAY_MS || '250', 10);
const UID = process.env.TEST5_UID || 'TEST5-UNKNOWN-UID';
const CHECKPOINT = process.env.TEST5_CHECKPOINT || 'entry_rfid';

createGateTestRunner({
  testName: 'Test5',
  durationMs: TEST_DURATION_MS,
  setup: ({ socket, recordLatency, finish }) => {
    console.log(`Test5: RFID reject path using uid=${UID} checkpoint=${CHECKPOINT} repeated ${REPEAT_COUNT} times`);

    let cycle = 0;

    const runCycle = () => {
      if (cycle >= REPEAT_COUNT) {
        finish();
        return;
      }

      const sentAt = Date.now();
      const correlationId = `test5-${cycle + 1}-${sentAt}`;
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
        recordLatency('rfid.scan.rejected.timeout', sentAt, `uid=${UID} checkpoint=${CHECKPOINT} correlationId=${correlationId}`);
        cleanup();
        proceed();
      }, 6000);

      const onRealtimeEvent = (envelope) => {
        if (settled || !envelope || typeof envelope !== 'object') {
          return;
        }

        if (envelope.eventName !== 'rfid.scan.rejected') {
          return;
        }

        const payload = envelope.payload || {};
        const eventCorrelationId = envelope.correlationId || payload.correlationId;
        if (payload.uid !== UID && eventCorrelationId !== correlationId) {
          return;
        }

        settled = true;
        recordLatency('rfid.scan.rejected', sentAt, `uid=${payload.uid || UID} checkpoint=${payload.checkpoint || CHECKPOINT} reason=${payload.reason || 'n/a'} correlationId=${eventCorrelationId || correlationId}`);
        cleanup();
        proceed();
      };

      socket.on('realtime.event', onRealtimeEvent);
      socket.emit('hardware.join', {}, (joinAck) => {
        console.log(`Test5: cycle ${cycle + 1}/${REPEAT_COUNT} hardware.join ack:`, JSON.stringify(joinAck));
        socket.emit(
          'hardware.rfid.scan',
          { uid: UID, checkpoint: CHECKPOINT, correlationId },
          (scanAck) => {
            console.log(`Test5: cycle ${cycle + 1}/${REPEAT_COUNT} hardware.rfid.scan ack:`, JSON.stringify(scanAck));
          }
        );
      });
    };

    runCycle();
  },
});