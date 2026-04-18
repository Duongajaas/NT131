import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
	connectSocket,
	disconnectSocket,
	emitSimulatorCheckpoint,
	joinSimulatorRoom,
	subscribeRealtime
} from '../lib/socket';
import {
	completeSimulatorParkingExit,
	createSimulatorParkingSession
} from '../lib/api';

const ParkingScene3D = lazy(() => import('./parking-scene-3d'));

type SimulatorStage =
	| 'idle'
	| 'approaching_entry'
	| 'waiting_rfid'
	| 'entry_processing'
	| 'assigned_slot'
	| 'parked'
	| 'approaching_exit'
	| 'exit_processing'
	| 'completed';

interface SimulatorPanelProps {
	onSessionCreated: (sessionId: string, plateNumber: string) => void;
}

interface StepLog {
	id: string;
	label: string;
	details: string;
}

type GateId = 'entry-gate' | 'exit-gate';

interface GateWaiter {
	resolve: () => void;
	timerId: number;
}

const STAGE_LABELS: Record<SimulatorStage, string> = {
	idle: 'Idle',
	approaching_entry: 'Approaching entry gate',
	waiting_rfid: 'Waiting RFID scan',
	entry_processing: 'Processing entry',
	assigned_slot: 'Assigned slot',
	parked: 'Parked',
	approaching_exit: 'Approaching exit gate',
	exit_processing: 'Processing exit',
	completed: 'Completed'
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const STAGE_TRAVEL_MS = 8500;
const STAGE_SHORT_HOLD_MS = 1200;
const EXIT_STAGE_TRAVEL_MS = 11000;
const GATE_WAIT_TIMEOUT_MS = 15000;
const isGateOpenState = (state?: string) => state === 'opening' || state === 'open';

export const SimulatorPanel = ({ onSessionCreated }: SimulatorPanelProps) => {
	const [uid, setUid] = useState('');
	const [plateNumber, setPlateNumber] = useState('');
	const [sessionId, setSessionId] = useState('');
	const [slotId, setSlotId] = useState('');
	const [dbSlotCode, setDbSlotCode] = useState('');
	const [stage, setStage] = useState<SimulatorStage>('idle');
	const [entryGateOpen, setEntryGateOpen] = useState(false);
	const [exitGateOpen, setExitGateOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState<StepLog[]>([]);
	const [result, setResult] = useState('Ready');
	const simulatorSocketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
	const hasJoinedSimulatorRoomRef = useRef(false);
	const entryGateOpenRef = useRef(false);
	const exitGateOpenRef = useRef(false);
	const activeCorrelationIdRef = useRef('');
	const gateWaitersRef = useRef<Record<GateId, GateWaiter[]>>({
		'entry-gate': [],
		'exit-gate': []
	});

	const stageLabel = useMemo(() => STAGE_LABELS[stage], [stage]);

	const isRealtimeGateSyncActive = () =>
		Boolean(simulatorSocketRef.current?.connected && hasJoinedSimulatorRoomRef.current);

	const resolveGateWaiters = (gateId: GateId) => {
		const waiters = gateWaitersRef.current[gateId];
		if (waiters.length === 0) {
			return;
		}

		gateWaitersRef.current[gateId] = [];

		for (const waiter of waiters) {
			window.clearTimeout(waiter.timerId);
			waiter.resolve();
		}
	};

	const applyGateState = (gateId: 'entry-gate' | 'exit-gate', gateState: string) => {
		const isOpen = isGateOpenState(gateState);

		if (gateId === 'entry-gate') {
			entryGateOpenRef.current = isOpen;
			setEntryGateOpen(isOpen);
		}

		if (gateId === 'exit-gate') {
			exitGateOpenRef.current = isOpen;
			setExitGateOpen(isOpen);
		}

		if (isOpen) {
			resolveGateWaiters(gateId);
		}
	};

	const waitForGateOpen = (gateId: GateId, timeoutMs = GATE_WAIT_TIMEOUT_MS) => {
		const gateIsOpen = gateId === 'entry-gate' ? entryGateOpenRef.current : exitGateOpenRef.current;
		if (gateIsOpen || !isRealtimeGateSyncActive()) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const timerId = window.setTimeout(() => {
				gateWaitersRef.current[gateId] = gateWaitersRef.current[gateId].filter(
					(waiter) => waiter.timerId !== timerId
				);
				reject(new Error(`Timed out waiting for ${gateId} to open`));
			}, timeoutMs);

			gateWaitersRef.current[gateId].push({ resolve, timerId });
		});
	};

	const generateVehiclePlateNumber = () => {
		const suffix = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 900 + 100)}`;
		return `59A${suffix}`.toUpperCase();
	};

	const generateSimulatorUid = () => `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

	useEffect(() => {
		const socket = connectSocket();
		simulatorSocketRef.current = socket;
		let isMounted = true;

		const handleConnect = async () => {
			try {
				await joinSimulatorRoom(socket, import.meta.env.VITE_SIMULATOR_API_KEY?.trim() || undefined);
				if (!isMounted) {
					return;
				}

				hasJoinedSimulatorRoomRef.current = true;
				pushLog('Realtime connected', 'Simulator joined realtime room');
			} catch (error) {
				if (!isMounted) {
					return;
				}

				hasJoinedSimulatorRoomRef.current = false;
				pushLog(
					'Realtime sync unavailable',
					error instanceof Error ? error.message : 'Simulator room join failed'
				);
			}
		};

		const unsubscribeRealtime = subscribeRealtime(socket, (event) => {
			if (event.eventName !== 'gate.state.changed') {
				return;
			}

			const gateId = typeof event.payload?.gateId === 'string' ? event.payload.gateId : undefined;
			const gateState = typeof event.payload?.state === 'string' ? event.payload.state : undefined;

			if (!gateId || !gateState) {
				return;
			}

			if (gateId !== 'entry-gate' && gateId !== 'exit-gate') {
				return;
			}

			applyGateState(gateId, gateState);

			pushLog('Gate sync', `${gateId} -> ${gateState}`);
		});

		socket.on('connect', handleConnect);

		if (socket.connected) {
			void handleConnect();
		}

		return () => {
			isMounted = false;
			unsubscribeRealtime();
			socket.off('connect', handleConnect);
			disconnectSocket();
			simulatorSocketRef.current = null;
			hasJoinedSimulatorRoomRef.current = false;
		};
	}, []);

	const pushLog = (label: string, details: string) => {
		setLog((current) => [
			{
				id: crypto.randomUUID(),
				label,
				details
			},
			...current
		]);
	};

	const notifyCheckpoint = async (
		checkpoint: 'entry_rfid' | 'exit_rfid',
		plateNumberValue = plateNumber,
		sessionIdValue = sessionId,
		correlationIdValue = activeCorrelationIdRef.current || undefined
	) => {
		pushLog('Checkpoint simulated', `${plateNumberValue} reached ${checkpoint}`);

		const socket = simulatorSocketRef.current;
		if (!socket || !socket.connected || !hasJoinedSimulatorRoomRef.current) {
			return;
		}

		try {
			await emitSimulatorCheckpoint(socket, {
				plateNumber: plateNumberValue.trim().toUpperCase(),
				checkpoint,
				state: checkpoint === 'entry_rfid' ? 'arrived' : 'leaving',
				sessionId: sessionIdValue || undefined,
				correlationId: correlationIdValue
			});
			pushLog('Checkpoint synced', `${checkpoint} sent to backend`);
		} catch (error) {
			pushLog(
				'Checkpoint sync failed',
				error instanceof Error ? error.message : 'Unable to sync checkpoint'
			);
		}
	};

	const simulateEntry = async () => {
		setBusy(true);
		setStage('approaching_entry');
		setDbSlotCode('');
		const nextPlateNumber = generateVehiclePlateNumber();
		const nextUid = generateSimulatorUid();
		const correlationId = crypto.randomUUID();
		activeCorrelationIdRef.current = correlationId;
		setPlateNumber(nextPlateNumber);
		setUid(nextUid);
		setResult('Creating a new vehicle record in backend');
		pushLog('Vehicle spawned', `${nextPlateNumber} / ${nextUid}`);
		if (!isRealtimeGateSyncActive()) {
			applyGateState('entry-gate', 'closed');
			applyGateState('exit-gate', 'closed');
		}

		try {
			await wait(STAGE_TRAVEL_MS);
			setStage('waiting_rfid');
			pushLog('Vehicle stopped', 'Waiting for RFID scan and plate recognition');
			const entryResult = await createSimulatorParkingSession({
				plateNumber: nextPlateNumber,
				uid: nextUid,
				vehicleType: 'car',
				plateConfidence: 100,
				correlationId
			});

			setSessionId(entryResult.session._id);
			setDbSlotCode(entryResult.slot.slot_code);
			onSessionCreated(entryResult.session._id, nextPlateNumber);
			pushLog('Vehicle persisted', `Vehicle ${entryResult.vehicle._id} and RFID ${entryResult.rfidCard._id} saved to DB`);
			pushLog('Slot assigned', `Real DB slot ${entryResult.slot.slot_code} reserved for session ${entryResult.session._id}`);
			setResult(`Database slot assigned: ${entryResult.slot.slot_code}`);

			await notifyCheckpoint('entry_rfid', nextPlateNumber, entryResult.session._id, correlationId);

			if (isRealtimeGateSyncActive()) {
				setResult('Waiting for backend gate state');
				pushLog('Gate awaiting socket', 'Waiting for backend signal to open entry gate');
				await waitForGateOpen('entry-gate');
				pushLog('Barrier opened', 'Entry gate opened via backend API event');
			} else {
				applyGateState('entry-gate', 'open');
				pushLog('Barrier opened', 'Entry gate lifted after check-in');
			}

			await wait(STAGE_SHORT_HOLD_MS);

			setStage('entry_processing');

			pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
			await wait(STAGE_TRAVEL_MS);
			setStage('assigned_slot');
			if (slotId) {
				pushLog('Scene slot', `Visual slot index ${slotId}`);
			}
			await wait(STAGE_TRAVEL_MS);
			setStage('parked');
			pushLog('Vehicle parked', `Vehicle parked in DB slot ${entryResult.slot.slot_code}`);
			setResult(`Vehicle parked in DB slot ${entryResult.slot.slot_code}`);
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Entry simulation failed');
			pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
			setDbSlotCode('');
			setStage('idle');
		} finally {
			setBusy(false);
		}

	};

	const simulateExit = async () => {
		if (!sessionId) {
			setResult('Create an entry session before exit simulation');
			return;
		}

		setBusy(true);
		setStage('approaching_exit');
		if (!isRealtimeGateSyncActive()) {
			applyGateState('exit-gate', 'closed');
		}
		pushLog('Vehicle leaving slot', 'Traveling toward exit gate');

		try {
			await wait(STAGE_TRAVEL_MS);
			const correlationId = activeCorrelationIdRef.current || crypto.randomUUID();
			activeCorrelationIdRef.current = correlationId;
			const exitResult = await completeSimulatorParkingExit({
				sessionId,
				exitPlateNumber: plateNumber,
				paymentStatus: 'pending',
				correlationId
			});
			pushLog('Exit persisted', `Transaction stored for session ${sessionId}`);
			setResult(
				`Exit persisted: ${exitResult.transaction.payment_status} / ${exitResult.transaction.final_amount}`
			);

			await notifyCheckpoint('exit_rfid', plateNumber, sessionId, correlationId);

			if (isRealtimeGateSyncActive()) {
				setResult('Waiting for backend gate state');
				pushLog('Gate awaiting socket', 'Waiting for backend signal to open exit gate');
				await waitForGateOpen('exit-gate');
				pushLog('Barrier opened', 'Exit gate opened via backend API event');
			} else {
				applyGateState('exit-gate', 'open');
				pushLog('Barrier opened', 'Exit gate lifted after check-out');
			}
			setStage('exit_processing');
			await wait(EXIT_STAGE_TRAVEL_MS);
			setResult(`Vehicle exited from DB slot ${dbSlotCode || 'released'}`);
			setStage('completed');
			pushLog('Simulation completed', 'Vehicle exited and slot released');
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Exit simulation failed');
			pushLog('Exit error', error instanceof Error ? error.message : 'Unknown error');
			setStage('parked');
		} finally {
			setBusy(false);
		}
	};

	const handleEntryBarrierPassed = () => {
		if (isRealtimeGateSyncActive()) {
			pushLog('Barrier passed', 'Entry gate stays under backend control');
			return;
		}

		applyGateState('entry-gate', 'closed');
		pushLog('Barrier closed', 'Entry gate closed after vehicle passed barrier');
	};

	const handleExitBarrierPassed = () => {
		if (isRealtimeGateSyncActive()) {
			pushLog('Barrier passed', 'Exit gate stays under backend control');
			return;
		}

		applyGateState('exit-gate', 'closed');
		pushLog('Barrier closed', 'Exit gate closed after vehicle passed barrier');
	};

	const handleParkedCarClick = () => {
		if (stage !== 'parked' || busy) {
			return;
		}

		void simulateExit();
	};

	const reset = () => {
		setStage('idle');
		setSessionId('');
		setDbSlotCode('');
		setLog([]);
		setResult('Ready');
		activeCorrelationIdRef.current = '';
	};

	return (
		<section className="panel simulator-panel">
			<header className="panel-head">
				<h2>Simulator Control</h2>
				<p>
					The simulator creates real vehicle, RFID, session, and slot records through backend APIs.
					When Socket.IO is reachable, gate state updates from the operator frontend also sync in realtime.
				</p>
			</header>

			<div className="simulator-workspace">
				<div className="simulator-stage-column">
					<Suspense
						fallback={
							<div className="scene-shell scene-fallback">
								<p className="scene-stage">Loading 3D scene...</p>
								<p className="scene-hint">Preparing WebGL assets</p>
							</div>
						}
					>
						<ParkingScene3D
							stage={stage}
							plateNumber={plateNumber}
							entryGateOpen={entryGateOpen}
							exitGateOpen={exitGateOpen}
							preferredSlotId={slotId}
							onCarClick={handleParkedCarClick}
							onEntryBarrierPassed={handleEntryBarrierPassed}
							onExitBarrierPassed={handleExitBarrierPassed}
						/>
					</Suspense>

					<div className="simulator-hero">
						<div>
							<p className="status-label">Current stage</p>
							<p className="simulator-stage">{stageLabel}</p>
						</div>
						<div>
							<p className="status-label">Last result</p>
							<p className="simulator-result">{result}</p>
						</div>
						<div>
							<p className="status-label">DB slot</p>
							<p className="simulator-result">{dbSlotCode || '-'}</p>
						</div>
					</div>
				</div>

				<aside className="simulator-control-column">
					<div className="field-row">
						<label className="field">
							<span>Simulator RFID UID</span>
							<input value={uid} onChange={(event) => setUid(event.target.value)} />
						</label>
						<label className="field">
							<span>Vehicle Plate</span>
							<input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} />
						</label>
					</div>

					<div className="field-row">
						<label className="field">
							<span>Session ID</span>
							<input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
						</label>
						<label className="field">
							<span>Scene Slot Index (1-8, optional)</span>
							<input value={slotId} onChange={(event) => setSlotId(event.target.value)} />
						</label>
					</div>

					<div className="button-row">
						<button onClick={simulateEntry} disabled={busy}>
							{busy ? 'Running...' : 'Simulate Entry'}
						</button>
						<button onClick={simulateExit} disabled={busy}>
							{busy ? 'Running...' : 'Simulate Exit'}
						</button>
						<button onClick={reset} disabled={busy}>
							Reset
						</button>
					</div>

					<div className="simulator-track">
						{Object.entries(STAGE_LABELS).map(([key, label]) => (
							<div
								key={key}
								className={`track-step ${stage === key ? 'active' : ''} ${
									['idle', 'completed'].includes(key) && stage === key ? 'done' : ''
								}`}
							>
								<span>{label}</span>
							</div>
						))}
					</div>

					<div className="simulator-log">
						{log.length === 0 ? <p className="empty">No simulation logs yet.</p> : null}
						{log.map((item) => (
							<article key={item.id} className="log-row">
								<p className="event-name">{item.label}</p>
								<p className="event-meta">{item.details}</p>
							</article>
						))}
					</div>
				</aside>
			</div>
		</section>
	);
};
