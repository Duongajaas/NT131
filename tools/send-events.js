const io = require('socket.io-client');

// Config via environment variables
const HOST = process.env.SOCKET_HOST || 'http://192.168.1.2:5000';
const PATH = process.env.SOCKET_PATH || '/socket.io';
const SIMULATOR_API_KEY = process.env.SIMULATOR_API_KEY || '7f3c9e2a4b8d1c6f9a2e7b4c3d1f8a6e5b9c2d4f7a1e3c6b9d2f4a7c1e8b5d3';
const DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '15000', 10); // total test runtime
const TEST1_DELAYS = (process.env.TEST1_DELAYS || '100,300,600').split(',').map(n => parseInt(n, 10));
const FLOOD_COUNT = parseInt(process.env.TEST3_FLOOD_COUNT || '50', 10);
const FLOOD_BURST = parseInt(process.env.TEST3_BURST_SIZE || '10', 10);
const FLOOD_BURST_INTERVAL_MS = parseInt(process.env.TEST3_BURST_INTERVAL_MS || '200', 10);

const RECONNECTION = process.env.SOCKET_RECONNECT !== 'false'; // default true for tests, allow SOCKET_RECONNECT=false
const RECONNECT_ATTEMPTS = parseInt(process.env.SOCKET_RECONNECT_ATTEMPTS || '10', 10);
const RECONNECT_DELAY = parseInt(process.env.SOCKET_RECONNECT_DELAY_MS || '1000', 10);

const socket = io(HOST, {
  path: PATH,
  transports: ['websocket'],
  reconnection: RECONNECTION,
  reconnectionAttempts: RECONNECT_ATTEMPTS,
  reconnectionDelay: RECONNECT_DELAY
});

socket.on('connect', () => {
  console.log('connected to server', HOST);
  console.log('running test for', DURATION_MS, 'ms');
  console.log('socket reconnection:', RECONNECTION, 'attempts=', RECONNECT_ATTEMPTS, 'delayMs=', RECONNECT_DELAY);

  socket.emit('simulator.join', { apiKey: SIMULATOR_API_KEY }, (ack) => {
    console.log('simulator.join ack:', JSON.stringify(ack));
  });

  // include seq + ts to measure latency and detect losses for gate requests only
  let seq = 1;
  const pending = new Map(); // seq -> { sentTs }
  const receivedSeqs = new Set();
  const gateLatencies = [];
  let gateAckCount = 0;

//   const emitSimulatorGateRequest = (gateId, command) => {
//     const ts = Date.now();
//     const payload = { gateId, command, seq, ts };
//     socket.emit('simulator.gate.command.request', payload, (ack) => {
//       console.log(`[Backend ACK] gateId=${gateId} command=${command} seq=${payload.seq} ack=${JSON.stringify(ack)}`);
//     });
//     pending.set(seq, { sentTs: ts });
//     seq++;
//   };

const emitSimulatorGateRequest = (gateId, command) => {
    const s = seq;
    const sentTs = Date.now();
    pending.set(s, { sentTs });
    seq++;

    socket.emit('simulator.gate.command.request', 
        { gateId, command, seq: s, ts: sentTs }, 
        (ack) => {
            // Đây là ACK thực, đo RTT ở đây
            const rtt = Date.now() - sentTs;
            gateLatencies.push(rtt);
            gateAckCount++;
            receivedSeqs.add(s);
            pending.delete(s);
            console.log(`[RTT] seq=${s} gateId=${gateId} command=${command} rtt=${rtt}ms`);
        }
    );
};

  const handleAck = (ack) => {
    const nested = ack && typeof ack === 'object' ? ack.payload : undefined;
    const seqValue = ack?.seq ?? nested?.seq;
    const receivedTs = ack?.receivedTs ?? nested?.receivedTs ?? 0;
    const processedTs = ack?.processedTs ?? nested?.processedTs ?? 0;
    const eventName = ack?.eventName ?? nested?.eventName ?? 'gate.ack';

    if (typeof seqValue !== 'number') {
      console.log(`[ACK] unexpected seq=${seqValue}`);
      return;
    }

    const now = Date.now();
    const s = seqValue;
    if (pending.has(s)) {
      const p = pending.get(s);
      const rtt = now - p.sentTs;
      gateLatencies.push(rtt);
      gateAckCount++;
      receivedSeqs.add(s);
      pending.delete(s);
      console.log(`[ACK] event=${eventName} seq=${s} rtt=${rtt}ms receivedTs=${receivedTs} processedTs=${processedTs}`);
    } else {
      console.log(`[ACK] unexpected seq=${s} event=${eventName}`);
    }
  };

  socket.on('realtime.event', (envelope) => {
    if (!envelope || typeof envelope !== 'object') {
      return;
    }
    if (envelope.eventName === 'gate.ack' || envelope.eventName === 'event.ack') {
      handleAck(envelope);
    }
  });

  // Test1: open entry gate, then repeat requests during the sweep window
  console.log('Test1: simulator gate requests at', TEST1_DELAYS);
  emitSimulatorGateRequest('entry-gate', 'open');
  TEST1_DELAYS.forEach((delay, idx) => {
    setTimeout(() => {
      emitSimulatorGateRequest('entry-gate', idx % 2 === 0 ? 'open' : 'close');
      console.log(`Test1: emitted simulator.gate.command.request #${idx + 1} after ${delay}ms`);
    }, delay);
  });

  // Test2: small burst of alternating gate requests to exercise queueing and ordering
  console.log('Test2: alternating entry/exit gate requests');
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      emitSimulatorGateRequest(i % 2 === 0 ? 'entry-gate' : 'exit-gate', 'open');
      console.log(`Test2: emitted alternating gate request ${i + 1}/5`);
    }, 800 + i * 250);
  }

  // Test3: flood gate commands in bursts to trigger queue overflow if any
  console.log(`Test3: flooding ${FLOOD_COUNT} gate commands in bursts of ${FLOOD_BURST}`);
  let emitted = 0;
  let burstIndex = 0;
  const floodInterval = setInterval(() => {
    for (let j = 0; j < FLOOD_BURST && emitted < FLOOD_COUNT; j++) {
      emitted++;
      emitSimulatorGateRequest('exit-gate', emitted % 2 === 0 ? 'open' : 'close');
    }
    console.log(`Test3: burst ${burstIndex++} sent, total emitted=${emitted}`);
    if (emitted >= FLOOD_COUNT) {
      clearInterval(floodInterval);
    }
  }, FLOOD_BURST_INTERVAL_MS);

  // track reconnects
  let reconnects = 0;
  socket.on('reconnect', (attempt) => { reconnects++; console.log('[Socket] reconnect attempt', attempt); });

  // Heap and basic health TTL summary optional listener
  // Finish after duration and print stats
  setTimeout(() => {
    console.log('test duration ended — computing stats');
    // lost seqs
    const sentTotal = seq - 1;
    const lost = [];
    for (let i = 1; i <= sentTotal; i++) {
      if (!receivedSeqs.has(i)) lost.push(i);
    }
    gateLatencies.sort((a,b) => a-b);
    const avg = gateLatencies.reduce((s,v) => s+v, 0) / (gateLatencies.length || 1);
    const p95 = gateLatencies[Math.floor(gateLatencies.length * 0.95)] || 0;
    const p99 = gateLatencies[Math.floor(gateLatencies.length * 0.99)] || 0;
    const max = gateLatencies[gateLatencies.length - 1] || 0;

    console.log('--- TEST SUMMARY ---');
    console.log('sentTotal=', sentTotal);
    console.log('acks=', gateAckCount);
    console.log('lostCount=', lost.length);
    console.log('lostSeqs sample=', lost.slice(0,10));
    console.log('avg RTT(ms)=', Math.round(avg));
    console.log('p95 RTT(ms)=', p95);
    console.log('p99 RTT(ms)=', p99);
    console.log('max RTT(ms)=', max);
    console.log('reconnects=', reconnects);

    console.log('done tests, disconnecting');
    socket.disconnect();
    process.exit(0);
  }, DURATION_MS);
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err.message || err);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('disconnected:', reason);
});
