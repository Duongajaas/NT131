const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOST = process.env.SOCKET_HOST || 'http://192.168.1.2:5000';
const PATH = process.env.SOCKET_PATH || '/socket.io';
const SIMULATOR_API_KEY = process.env.SIMULATOR_API_KEY || '7f3c9e2a4b8d1c6f9a2e7b4c3d1f8a6e5b9c2d4f7a1e3c6b9d2f4a7c1e8b5d3';
const RECONNECTION = process.env.SOCKET_RECONNECT !== 'false';
const RECONNECT_ATTEMPTS = parseInt(process.env.SOCKET_RECONNECT_ATTEMPTS || '10', 10);
const RECONNECT_DELAY = parseInt(process.env.SOCKET_RECONNECT_DELAY_MS || '1000', 10);
const RESULTS_DIR = path.resolve(__dirname, process.env.TEST_RESULTS_DIR || 'results');
const CHARTS_DIR = path.resolve(__dirname, process.env.TEST_CHARTS_DIR || 'charts');
const PYTHON_EXE = process.env.PYTHON_EXE || 'd:/NNLT/Project/NT131/.venv/Scripts/python.exe';

function parseCsvInts(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((item) => parseInt(item.trim(), 10))
    .filter((item) => !Number.isNaN(item));
}

function createGateTestRunner({ testName, durationMs, setup }) {
  const socket = io(HOST, {
    path: PATH,
    transports: ['websocket'],
    reconnection: RECONNECTION,
    reconnectionAttempts: RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY,
  });

  let seq = 1;
  const pending = new Map();
  const completedSeqs = new Set();
  const gateLatencies = [];
  const latencySamples = [];
  let gateAckCount = 0;
  let reconnects = 0;
  let finished = false;
  let started = false;
  let stopTimer = null;
  let sampleSeq = 1;

  function recordLatency(label, sentTs, details) {
    const rtt = Date.now() - sentTs;
    const sample = {
      seq: sampleSeq++,
      label,
      rtt,
      details
    };
    gateLatencies.push(rtt);
    latencySamples.push(sample);
    console.log(`${label} ${details} rtt=${rtt}ms`);
    return sample;
  }

  function recordAck(seqValue, sentTs, prefix, details) {
    if (completedSeqs.has(seqValue)) {
      return false;
    }

    recordLatency(prefix, sentTs, `seq=${seqValue} ${details}`);
    gateAckCount++;
    completedSeqs.add(seqValue);
    pending.delete(seqValue);
    return true;
  }

  function emitSimulatorGateRequest(gateId, command) {
    const currentSeq = seq;
    const sentTs = Date.now();
    pending.set(currentSeq, { sentTs });
    seq++;

    socket.emit(
      'simulator.gate.command.request',
      { gateId, command, seq: currentSeq, ts: sentTs },
      (ack) => {
        recordAck(currentSeq, sentTs, '[RTT]', `gateId=${gateId} command=${command}`);
        if (ack) {
          console.log(`[Backend ACK] gateId=${gateId} command=${command} seq=${currentSeq} ack=${JSON.stringify(ack)}`);
        }
      }
    );
  }

  function handleAck(ack) {
    const nested = ack && typeof ack === 'object' ? ack.payload : undefined;
    const seqValue = ack?.seq ?? nested?.seq;
    const receivedTs = ack?.receivedTs ?? nested?.receivedTs ?? 0;
    const processedTs = ack?.processedTs ?? nested?.processedTs ?? 0;
    const eventName = ack?.eventName ?? nested?.eventName ?? 'gate.ack';

    if (typeof seqValue !== 'number') {
      console.log(`[ACK] unexpected seq=${seqValue}`);
      return;
    }

    const pendingEntry = pending.get(seqValue);
    if (!pendingEntry) {
      console.log(`[ACK] unexpected seq=${seqValue} event=${eventName}`);
      return;
    }

    const recorded = recordAck(
      seqValue,
      pendingEntry.sentTs,
      '[ACK]',
      `event=${eventName} receivedTs=${receivedTs} processedTs=${processedTs}`
    );

    if (!recorded) {
      console.log(`[ACK] duplicate seq=${seqValue} event=${eventName}`);
    }
  }

  function finish() {
    if (finished) {
      return;
    }

    finished = true;
    if (stopTimer) {
      clearTimeout(stopTimer);
    }

    console.log('test duration ended - computing stats');

    const sentTotal = seq - 1;
    const lost = [];
    for (let current = 1; current <= sentTotal; current++) {
      if (!completedSeqs.has(current)) {
        lost.push(current);
      }
    }

    gateLatencies.sort((left, right) => left - right);
    const avg = gateLatencies.reduce((sum, value) => sum + value, 0) / (gateLatencies.length || 1);
    const p95 = gateLatencies[Math.min(gateLatencies.length - 1, Math.floor(gateLatencies.length * 0.95))] || 0;
    const p99 = gateLatencies[Math.min(gateLatencies.length - 1, Math.floor(gateLatencies.length * 0.99))] || 0;
    const max = gateLatencies[gateLatencies.length - 1] || 0;
    const result = {
      testName,
      durationMs,
      generatedAt: new Date().toISOString(),
      sentTotal,
      acks: gateAckCount,
      lostCount: lost.length,
      lostSeqs: lost,
      stats: {
        avgRttMs: Math.round(avg),
        p95RttMs: p95,
        p99RttMs: p99,
        maxRttMs: max,
      },
      samples: latencySamples,
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.mkdirSync(CHARTS_DIR, { recursive: true });

    const resultFile = path.join(RESULTS_DIR, `${testName}.json`);
    const chartFile = path.join(CHARTS_DIR, `${testName}.png`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8');

    const plotScript = path.join(__dirname, 'plot_test_results.py');
    const plotRun = spawnSync(PYTHON_EXE, [plotScript, resultFile, chartFile], {
      encoding: 'utf8',
    });

    if (plotRun.error) {
      console.error('[Chart] failed to launch python:', plotRun.error.message || plotRun.error);
    } else {
      if (plotRun.stdout) {
        console.log(plotRun.stdout.trim());
      }
      if (plotRun.stderr) {
        console.error(plotRun.stderr.trim());
      }
      if (plotRun.status !== 0) {
        console.error(`[Chart] python exited with code ${plotRun.status}`);
      } else {
        console.log(`[Chart] saved chart to ${chartFile}`);
      }
    }

    console.log(`--- ${testName} SUMMARY ---`);
    console.log('sentTotal=', sentTotal);
    console.log('acks=', gateAckCount);
    console.log('lostCount=', lost.length);
    console.log('lostSeqs sample=', lost.slice(0, 10));
    console.log('avg RTT(ms)=', Math.round(avg));
    console.log('p95 RTT(ms)=', p95);
    console.log('p99 RTT(ms)=', p99);
    console.log('max RTT(ms)=', max);
    console.log('reconnects=', reconnects);

    console.log('done tests, disconnecting');
    socket.disconnect();
    process.exit(0);
  }

  socket.on('realtime.event', (envelope) => {
    if (!envelope || typeof envelope !== 'object') {
      return;
    }

    if (envelope.eventName === 'gate.ack' || envelope.eventName === 'event.ack') {
      handleAck(envelope);
    }
  });

  socket.on('reconnect', (attempt) => {
    reconnects++;
    console.log('[Socket] reconnect attempt', attempt);
  });

  socket.on('connect', () => {
    console.log('connected to server', HOST);
    console.log('running test for', durationMs, 'ms');
    console.log('socket reconnection:', RECONNECTION, 'attempts=', RECONNECT_ATTEMPTS, 'delayMs=', RECONNECT_DELAY);

    socket.emit('simulator.join', { apiKey: SIMULATOR_API_KEY }, (ack) => {
      console.log('simulator.join ack:', JSON.stringify(ack));
    });

    if (started) {
      return;
    }

    started = true;
    setup({ socket, emitSimulatorGateRequest, finish, recordLatency });
    stopTimer = setTimeout(finish, durationMs);
  });

  socket.on('connect_error', (err) => {
    console.error('connect_error', err.message || err);
    process.exit(1);
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnected:', reason);
  });

  return {
    emitSimulatorGateRequest,
    finish,
    recordLatency,
    parseCsvInts,
  };
}

module.exports = {
  createGateTestRunner,
  parseCsvInts,
};