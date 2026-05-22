const { createGateTestRunner } = require('./gate-test-runner');

const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '30000', 10);
const REPEAT_COUNT = parseInt(process.env.TEST6_REPEAT_COUNT || '5', 10);
const STEP_DELAY_MS = parseInt(process.env.TEST6_STEP_DELAY_MS || '500', 10);
const UID = process.env.TEST6_UID || 'B19DE116';
const PLATE_NUMBER = process.env.TEST6_PLATE_NUMBER || '38A1111';
const CHECKPOINT = process.env.TEST6_CHECKPOINT || 'entry_rfid';
const EXPECTED_DECISION = process.env.TEST6_EXPECTED_DECISION || 'accepted';
const API_BASE_URL = process.env.TEST6_API_BASE_URL || new URL('/api/v1', process.env.SOCKET_HOST || 'http://192.168.1.2:5000').toString().replace(/\/$/, '');
const ADMIN_USERNAME = process.env.TEST6_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.TEST6_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || response.statusText || 'Request failed';
    throw new Error(`${response.status} ${message}`);
  }

  return data;
}

createGateTestRunner({
  testName: 'Test6',
  durationMs: TEST_DURATION_MS,
  setup: ({ socket, recordLatency, finish }) => {
    console.log(`Test6: RFID ${EXPECTED_DECISION} path using uid=${UID} plate=${PLATE_NUMBER} checkpoint=${CHECKPOINT} repeated ${REPEAT_COUNT} times`);

    let cycle = 0;
    let finished = false;

    const finishOnce = () => {
      if (finished) {
        return;
      }

      finished = true;
      finish();
    };

    const ensureNoActiveSession = async () => {
      if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        console.log('Test6: admin cleanup skipped - set TEST6_ADMIN_USERNAME and TEST6_ADMIN_PASSWORD to clear active sessions');
        return;
      }

      const loginResponse = await fetchJson(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      });
      const token = loginResponse?.data?.token;
      if (!token) {
        throw new Error('Missing auth token from login response');
      }

      const cardsResponse = await fetchJson(`${API_BASE_URL}/rfid-cards?search=${encodeURIComponent(UID)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const card = cardsResponse?.data?.[0];
      if (!card?._id) {
        throw new Error(`RFID card ${UID} not found`);
      }

      const sessionsResponse = await fetchJson(
        `${API_BASE_URL}/parking/sessions?rfid_card_id=${encodeURIComponent(card._id)}&status=active`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const activeSession = sessionsResponse?.data?.[0];
      if (!activeSession?._id) {
        console.log('Test6: no active session found for the RFID card');
        return;
      }

      console.log(`Test6: closing active session ${activeSession._id} before entry test`);
      const exitResponse = await fetchJson(`${API_BASE_URL}/parking/sessions/${activeSession._id}/exit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          exit_plate_number: PLATE_NUMBER,
          correlation_id: `test6-cleanup-${Date.now()}`
        })
      });

      console.log('Test6: active session exit response:', JSON.stringify(exitResponse?.data || exitResponse));
    };

    const runCycle = async () => {
      if (cycle >= REPEAT_COUNT) {
        finishOnce();
        return;
      }

      const cycleNumber = cycle + 1;
      const sentAt = Date.now();
      const snapshotCorrelationId = `test6-snapshot-${cycleNumber}-${sentAt}`;
      const scanCorrelationId = `test6-scan-${cycleNumber}-${sentAt}`;
      let settled = false;

      const cleanup = () => {
        socket.off('realtime.event', onRealtimeEvent);
        clearTimeout(fallbackTimer);
      };

      const proceed = () => {
        cycle++;
        setTimeout(() => {
          void runCycle();
        }, STEP_DELAY_MS);
      };

      const fallbackTimer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        recordLatency('hardware.rfid.scan.timeout', sentAt, `uid=${UID} checkpoint=${CHECKPOINT} correlationId=${scanCorrelationId}`);
        console.log(`Test6: cycle ${cycleNumber}/${REPEAT_COUNT} no realtime decision before timeout`);
        cleanup();
        proceed();
      }, 9000);

      const onRealtimeEvent = (envelope) => {
        if (settled || !envelope || typeof envelope !== 'object') {
          return;
        }

        if (envelope.eventName !== 'rfid.scan.accepted' && envelope.eventName !== 'rfid.scan.rejected') {
          return;
        }

        const payload = envelope.payload || {};
        const eventCorrelationId = envelope.correlationId || payload.correlationId;
        const payloadUid = payload.uid || payload.uidNumber || payload.rfidUid;
        if (eventCorrelationId !== scanCorrelationId && payloadUid !== UID) {
          return;
        }

        settled = true;
        const actualDecision = payload.decision || (envelope.eventName === 'rfid.scan.accepted' ? 'accepted' : 'rejected');
        recordLatency(
          envelope.eventName,
          sentAt,
          `uid=${payloadUid || UID} checkpoint=${payload.checkpoint || CHECKPOINT} decision=${actualDecision} reason=${payload.reason || 'n/a'} correlationId=${eventCorrelationId || scanCorrelationId}`
        );
        cleanup();
        proceed();
      };

      socket.on('realtime.event', onRealtimeEvent);

      await ensureNoActiveSession();

      socket.emit(
        'simulator.vehicle.checkpoint',
        {
          plateNumber: PLATE_NUMBER,
          checkpoint: CHECKPOINT,
          correlationId: snapshotCorrelationId
        },
        (checkpointAck) => {
          console.log(`Test6: cycle ${cycleNumber}/${REPEAT_COUNT} simulator.vehicle.checkpoint ack:`, JSON.stringify(checkpointAck));

          socket.emit(
            'hardware.rfid.scan',
            { uid: UID, checkpoint: CHECKPOINT, correlationId: scanCorrelationId },
            (scanAck) => {
              console.log(`Test6: cycle ${cycleNumber}/${REPEAT_COUNT} hardware.rfid.scan ack:`, JSON.stringify(scanAck));
            }
          );
        }
      );
    };

    socket.emit('hardware.join', {}, (ack) => {
      console.log('Test6: hardware.join ack:', JSON.stringify(ack));
      void runCycle().catch((error) => {
        console.error('Test6: setup failed', error instanceof Error ? error.message : error);
        finishOnce();
      });
    });
  },
});