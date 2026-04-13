import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import type { Socket } from 'socket.io-client';
import {
	connectSocket,
	emitSimulatorCheckpoint,
	joinSimulatorRoom
} from '../lib/socket';
import type { ApiEnvelope, SessionSummary } from '../types/contracts';

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
	token: string;
	onSessionCreated: (sessionId: string, plateNumber: string) => void;
}

interface StepLog {
	id: string;
	label: string;
	details: string;
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
const USE_LOCAL_STAGE_SIMULATION = true;
const STAGE_TRAVEL_MS = 8500;
const STAGE_SHORT_HOLD_MS = 1200;
const EXIT_STAGE_TRAVEL_MS = 11000;

export const SimulatorPanel = ({ token, onSessionCreated }: SimulatorPanelProps) => {
	const [uid, setUid] = useState('SIM-UID-001');
	const [plateNumber, setPlateNumber] = useState('59A12345');
	const [sessionId, setSessionId] = useState('');
	const [slotId, setSlotId] = useState('');
	const [stage, setStage] = useState<SimulatorStage>('idle');
	const [entryGateOpen, setEntryGateOpen] = useState(false);
	const [exitGateOpen, setExitGateOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState<StepLog[]>([]);
	const [result, setResult] = useState('Ready');
	const hasAutoStartedEntryRef = useRef(false);
	const simulatorSocketRef = useRef<Socket | null>(null);
	const hasNotifiedEntryCheckpointRef = useRef(false);
	const hasNotifiedExitCheckpointRef = useRef(false);

	const stageLabel = useMemo(() => STAGE_LABELS[stage], [stage]);

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

	const notifyCheckpoint = async (checkpoint: 'entry_rfid' | 'exit_rfid') => {
		if (checkpoint === 'entry_rfid' && hasNotifiedEntryCheckpointRef.current) {
			return;
		}

		if (checkpoint === 'exit_rfid' && hasNotifiedExitCheckpointRef.current) {
			return;
		}

		const socket = simulatorSocketRef.current;
		if (!socket) {
			return;
		}

		try {
			await emitSimulatorCheckpoint(socket, {
				plateNumber,
				checkpoint,
				state: 'arrived',
				correlationId: crypto.randomUUID(),
				sessionId: sessionId || undefined
			});

			if (checkpoint === 'entry_rfid') {
				hasNotifiedEntryCheckpointRef.current = true;
			}

			if (checkpoint === 'exit_rfid') {
				hasNotifiedExitCheckpointRef.current = true;
			}

			pushLog('Checkpoint synced', `${checkpoint} plate ${plateNumber}`);
		} catch (error) {
			pushLog(
				'Checkpoint sync failed',
				error instanceof Error ? error.message : 'Unknown socket error'
			);
		}
	};

	const simulateEntry = async () => {
		const hasToken = !USE_LOCAL_STAGE_SIMULATION && Boolean(token);
		hasNotifiedEntryCheckpointRef.current = false;

		setBusy(true);
		setStage('approaching_entry');
		setEntryGateOpen(false);
		setExitGateOpen(false);
		pushLog('Vehicle spawned', `${plateNumber} approaching checkpoint`);

		try {
			await wait(STAGE_TRAVEL_MS);
			setStage('waiting_rfid');
			pushLog('Vehicle stopped', 'Waiting for RFID scan and plate recognition');
			await notifyCheckpoint('entry_rfid');

			await wait(STAGE_SHORT_HOLD_MS);

			if (!hasToken) {
				const localSessionId = sessionId || `SIM-${Date.now()}`;
				setSessionId(localSessionId);
				onSessionCreated(localSessionId, plateNumber);
				setResult('Demo mode: local stage simulation without backend API');
				pushLog('Entry response', `open for local session ${localSessionId}`);
				setEntryGateOpen(true);
				pushLog('Barrier opened', 'Entry gate lifted after check-in');
				setStage('entry_processing');
				pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
				await wait(STAGE_TRAVEL_MS);
				setStage('assigned_slot');
				await wait(STAGE_TRAVEL_MS);
				setEntryGateOpen(false);
				setStage('parked');
				pushLog('Vehicle parked', 'Simulator held at assigned parking position');
				return;
			}

			const response = await apiRequest<
				ApiEnvelope<{ session: SessionSummary; gate_action: 'open' | 'deny'; reason?: string }>
			>('/parking/sessions/entry', {
				method: 'POST',
				token,
				body: JSON.stringify({
					uid,
					plate_number: plateNumber,
					plate_confidence: 98,
					entry_image_url: `https://simulator.local/entry/${plateNumber}.jpg`,
					correlation_id: crypto.randomUUID()
				})
			});

			onSessionCreated(response.data.session._id, plateNumber);
			setSessionId(response.data.session._id);
			setResult(`${response.message} - gate ${response.data.gate_action}`);
			pushLog('Entry response', `${response.data.gate_action} for session ${response.data.session._id}`);

			if (response.data.gate_action === 'open') {
				setEntryGateOpen(true);
				pushLog('Barrier opened', 'Entry gate lifted after check-in');
				setStage('entry_processing');
				pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
				await wait(STAGE_TRAVEL_MS);
				setStage('assigned_slot');
				await wait(STAGE_TRAVEL_MS);
				if (slotId) {
					const assignResponse = await apiRequest<
						ApiEnvelope<{ session: SessionSummary; slot: { slot_code: string } }>
					>(`/parking/sessions/${response.data.session._id}/assign-slot`, {
						method: 'POST',
						token,
						body: JSON.stringify({
							slot_id: slotId,
							correlation_id: crypto.randomUUID()
						})
					});

					setSessionId(assignResponse.data.session._id);
					pushLog('Slot assigned', assignResponse.data.slot.slot_code);
				}
				setEntryGateOpen(false);
				setStage('parked');
				pushLog('Vehicle parked', 'Simulator held at assigned parking position');
			} else {
				setEntryGateOpen(false);
				setStage('waiting_rfid');
				pushLog('Entry blocked', response.data.reason || 'Plate mismatch or RFID rejection');
			}
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Entry simulation failed');
			pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
			setStage('idle');
		} finally {
			setBusy(false);
		}

	};

	const simulateExit = async () => {
		const hasToken = !USE_LOCAL_STAGE_SIMULATION && Boolean(token);

		if (!sessionId) {
			setResult('Create an entry session before exit simulation');
			return;
		}

		setBusy(true);
		setStage('approaching_exit');
		setExitGateOpen(false);
		pushLog('Vehicle leaving slot', 'Traveling toward exit gate');
		hasNotifiedExitCheckpointRef.current = false;

		try {
			await wait(STAGE_TRAVEL_MS);
			await notifyCheckpoint('exit_rfid');

			if (!hasToken) {
				setExitGateOpen(true);
				pushLog('Barrier opened', 'Exit gate lifted after check-out');
				setStage('exit_processing');
				await wait(EXIT_STAGE_TRAVEL_MS);
				setExitGateOpen(false);
				setResult('Demo mode: local exit simulation completed');
				pushLog('Exit response', `open for local session ${sessionId}`);
				setStage('completed');
				pushLog('Simulation completed', 'Vehicle exited and slot released');
				return;
			}

			const response = await apiRequest<
				ApiEnvelope<{
					session: SessionSummary;
					transaction: { final_amount: number; payment_status: string };
					gate_action: 'open' | 'deny';
				}>
			>(`/parking/sessions/${sessionId}/exit`, {
				method: 'POST',
				token,
				body: JSON.stringify({
					exit_plate_number: plateNumber,
					exit_plate_confidence: 97,
					exit_image_url: `https://simulator.local/exit/${plateNumber}.jpg`,
					payment_status: 'paid',
					correlation_id: crypto.randomUUID()
				})
			});

			setResult(
				`${response.message} - ${response.data.transaction.final_amount} (${response.data.transaction.payment_status})`
			);
			pushLog('Exit response', `${response.data.gate_action} for session ${sessionId}`);
			if (response.data.gate_action === 'open') {
				setExitGateOpen(true);
				pushLog('Barrier opened', 'Exit gate lifted after check-out');
				setStage('exit_processing');
				await wait(EXIT_STAGE_TRAVEL_MS);
				setExitGateOpen(false);
				setStage('completed');
				pushLog('Simulation completed', 'Vehicle exited and slot released');
			} else {
				setExitGateOpen(false);
				setStage('parked');
				pushLog('Exit blocked', 'Exit gate remained closed');
			}
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Exit simulation failed');
			pushLog('Exit error', error instanceof Error ? error.message : 'Unknown error');
			setStage('parked');
		} finally {
			setBusy(false);
		}
	};

	const handleEntryBarrierPassed = () => {
		setEntryGateOpen((isOpen) => {
			if (isOpen) {
				pushLog('Barrier closed', 'Entry gate closed after vehicle passed barrier');
			}

			return false;
		});
	};

	const handleExitBarrierPassed = () => {
		setExitGateOpen((isOpen) => {
			if (isOpen) {
				pushLog('Barrier closed', 'Exit gate closed after vehicle passed barrier');
			}

			return false;
		});
	};

	const handleParkedCarClick = () => {
		if (stage !== 'parked' || busy) {
			return;
		}

		void simulateExit();
	};

	useEffect(() => {
		if (!USE_LOCAL_STAGE_SIMULATION || hasAutoStartedEntryRef.current || busy || stage !== 'idle') {
			return;
		}

		hasAutoStartedEntryRef.current = true;
		void simulateEntry();
	}, [busy, stage]);

	useEffect(() => {
		const socket = connectSocket();
		simulatorSocketRef.current = socket;

		const join = async () => {
			try {
				await joinSimulatorRoom(socket, import.meta.env.VITE_SIMULATOR_API_KEY?.trim());
			} catch (error) {
				pushLog(
					'Simulator join failed',
					error instanceof Error ? error.message : 'Unable to join simulator room'
				);
			}
		};

		socket.on('connect', () => {
			void join();
		});

		if (socket.connected) {
			void join();
		}

		return () => {
			simulatorSocketRef.current = null;
		};
	}, []);

	const reset = () => {
		hasAutoStartedEntryRef.current = false;
		hasNotifiedEntryCheckpointRef.current = false;
		hasNotifiedExitCheckpointRef.current = false;
		setStage('idle');
		setSessionId('');
		setLog([]);
		setResult('Ready');
	};

	return (
		<section className="panel simulator-panel">
			<header className="panel-head">
				<h2>Simulator Control</h2>
				<p>Auto-play the vehicle flow against backend parking APIs.</p>
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
							<span>Preferred Slot ID (optional)</span>
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
