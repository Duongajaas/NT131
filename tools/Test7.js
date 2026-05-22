const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '30000', 10);
const REPEAT_COUNT = parseInt(process.env.TEST7_REPEAT_COUNT || '5', 10);
const DROP_AFTER_MS = parseInt(process.env.TEST7_DROP_AFTER_MS || '2000', 10);
const BETWEEN_CYCLES_MS = parseInt(process.env.TEST7_BETWEEN_CYCLES_MS || '1200', 10);

createGateTestRunner({
  testName: 'Test7',
  durationMs: TEST_DURATION_MS,
  setup: ({ socket, recordLatency, finish }) => {
    console.log(`Test7: forcing a transport drop/reconnect ${REPEAT_COUNT} times`);

    const startedAt = Date.now();
    let droppedAt = 0;
    let reconnectRecorded = false;
    let reconnectAttempts = 0;
    let cycle = 0;
    let dropTimer = null;
    let finishTimer = null;

    const onManagerReconnectAttempt = (attempt) => {
      reconnectAttempts = attempt;
      console.log(`[Socket.IO] reconnect_attempt=${attempt}`);
    };

    const onManagerReconnect = (attempt) => {
      if (!droppedAt || reconnectRecorded) {
        return;
      }

      reconnectRecorded = true;
      recordLatency('socket.reconnect', droppedAt, `cycle=${cycle + 1}/${REPEAT_COUNT} attempt=${attempt || reconnectAttempts}`);

      cycle++;
      if (cycle >= REPEAT_COUNT) {
        clearTimeout(finishTimer);
        finishTimer = setTimeout(() => {
          finish();
        }, 500);
        return;
      }

      setTimeout(() => {
        reconnectRecorded = false;
        scheduleDrop();
      }, BETWEEN_CYCLES_MS);
    };

    const scheduleDrop = () => {
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => {
        droppedAt = Date.now();
        console.log(`Test7: cycle ${cycle + 1}/${REPEAT_COUNT} closing transport at ${droppedAt - startedAt}ms`);
        if (socket.io && socket.io.engine) {
          socket.io.engine.close();
        } else {
          socket.disconnect();
        }
      }, DROP_AFTER_MS);
    };

    socket.io.on('reconnect_attempt', onManagerReconnectAttempt);
    socket.io.on('reconnect', onManagerReconnect);

    scheduleDrop();

    finishTimer = setTimeout(() => {
      if (!reconnectRecorded) {
        console.log('Test7: reconnect not observed within duration');
        finish();
      }
    }, TEST_DURATION_MS - 250);
  },
});