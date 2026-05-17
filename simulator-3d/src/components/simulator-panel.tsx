import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
	connectSocket,
	disconnectSocket,
	emitSimulatorCheckpoint,
	emitSimulatorStage,
	joinSimulatorRoom,
	requestSimulatorGateCommand,
	subscribeRealtime
} from '../lib/socket';
import {
	assignParkingSlot,
	completeSimulatorParkingExit,
	getRfidCardById,
	getSimulatorApiKey,
	getVehicleById,
	createSimulatorVehicle,
	listParkingSessions,
	listParkingSlots
} from '../lib/api';
import { LoadingOverlay } from './loading-overlay';

const ParkingScene3D = lazy(() => import('./parking-scene-3d'));

type SimulatorStage =
	| 'idle'
	| 'approaching_entry'
	| 'waiting_rfid'
	| 'barrier_pass'
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

interface SessionWaiter {
	correlationId: string;
	resolve: (sessionId: string) => void;
	reject: (error: Error) => void;
	timerId: number;
}

interface StagePathWaiter {
	stage: SimulatorStage;
	resolve: () => void;
	reject: (error: Error) => void;
	timerId: number;
}

type VehicleType = 'motorbike' | 'car';

interface ParkedVehicle {
	localId: string;
	sessionId: string;
	plateNumber: string;
	dbSlotCode: string;
	sceneSlotId: SceneSlotId;
	vehicleType: VehicleType;
}

const SCENE_SLOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
type SceneSlotId = (typeof SCENE_SLOT_IDS)[number];

const STAGE_LABELS: Record<SimulatorStage, string> = {
	idle: 'Idle',
	approaching_entry: 'Approaching entry gate',
	waiting_rfid: 'Waiting RFID scan',
	barrier_pass: 'Barrier pass',
	entry_processing: 'Processing entry',
	assigned_slot: 'Assigned slot',
	parked: 'Parked',
	approaching_exit: 'Approaching exit gate',
	exit_processing: 'Processing exit',
	completed: 'Completed'
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const STAGE_PATH_TIMEOUT_MS = 60000;
const isGateOpenState = (state?: string) => state === 'opening' || state === 'open';

const MIN_LOADING_DURATION_MS = 2200;

const keepSpinnerVisible = async (startedAt: number) => {
	const elapsed = Date.now() - startedAt;
	if (elapsed < MIN_LOADING_DURATION_MS) {
		await wait(MIN_LOADING_DURATION_MS - elapsed);
	}
};

const normalizePlateNumber = (value: string) => value.trim().toUpperCase();

const chooseSceneSlotId = (
	occupiedSlotIds: Set<number>,
	preferredSlotId?: number
): SceneSlotId | undefined => {
	const normalizedPreferredSlotId = SCENE_SLOT_IDS.find((slotId) => slotId === preferredSlotId);
	if (normalizedPreferredSlotId && !occupiedSlotIds.has(normalizedPreferredSlotId)) {
		return normalizedPreferredSlotId;
	}

	return SCENE_SLOT_IDS.find((slotId) => !occupiedSlotIds.has(slotId));
};

export const SimulatorPanel = ({ onSessionCreated }: SimulatorPanelProps) => {
	const [plateNumber, setPlateNumber] = useState('');
	const [vehicleType, setVehicleType] = useState<VehicleType>('car');
	const [sessionId, setSessionId] = useState('');
	const [slotId, setSlotId] = useState('');
	const [dbSlotCode, setDbSlotCode] = useState('');
	const [parkedVehicles, setParkedVehicles] = useState<ParkedVehicle[]>([]);
	const [activeVehicle, setActiveVehicle] = useState<ParkedVehicle | null>(null);
	const [stage, setStage] = useState<SimulatorStage>('idle');
	const [entryGateOpen, setEntryGateOpen] = useState(false);
	const [exitGateOpen, setExitGateOpen] = useState(false);
	const [hydrating, setHydrating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState<StepLog[]>([]);
	const [result, setResult] = useState('Ready');
	const simulatorSocketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
	const hasJoinedSimulatorRoomRef = useRef(false);
	const entryGateOpenRef = useRef(false);
	const exitGateOpenRef = useRef(false);
	const busyRef = useRef(false);
	const hydratingRef = useRef(false);
	const activeVehicleRef = useRef<ParkedVehicle | null>(null);
	const parkedVehiclesRef = useRef<ParkedVehicle[]>([]);
	const slotIdRef = useRef('');
	const stageRef = useRef<SimulatorStage>('idle');
	const activeCorrelationIdRef = useRef('');
	const currentRfidCheckpointRef = useRef<'entry_rfid' | 'exit_rfid'>('entry_rfid');
	const sessionWaitersRef = useRef<SessionWaiter[]>([]);
	const stagePathWaitersRef = useRef<StagePathWaiter[]>([]);
	const createdSessionsByCorrelationRef = useRef<Map<string, string>>(new Map());
	const gateWaitersRef = useRef<Record<GateId, GateWaiter[]>>({
		'entry-gate': [],
		'exit-gate': []
	});
	const gateClosedWaitersRef = useRef<Record<GateId, GateWaiter[]>>({
		'entry-gate': [],
		'exit-gate': []
	});

	const stageLabel = useMemo(() => STAGE_LABELS[stage], [stage]);

	useEffect(() => {
		busyRef.current = busy;
	}, [busy]);

	useEffect(() => {
		hydratingRef.current = hydrating;
	}, [hydrating]);

	useEffect(() => {
		activeVehicleRef.current = activeVehicle;
	}, [activeVehicle]);

	useEffect(() => {
		parkedVehiclesRef.current = parkedVehicles;
	}, [parkedVehicles]);

	useEffect(() => {
		slotIdRef.current = slotId;
	}, [slotId]);

	useEffect(() => {
		stageRef.current = stage;
	}, [stage]);

	useEffect(() => {
		const socket = simulatorSocketRef.current;
		if (!socket || !socket.connected || !hasJoinedSimulatorRoomRef.current) {
			return;
		}

		void emitSimulatorStage(socket, {
			stage,
			plateNumber: plateNumber || undefined,
			checkpoint: stage === 'waiting_rfid' ? currentRfidCheckpointRef.current : undefined,
			sessionId: sessionId || undefined,
			correlationId: activeCorrelationIdRef.current || undefined
		}).catch((error) => {
			pushLog('Stage sync failed', error instanceof Error ? error.message : 'Unable to sync stage');
		});
	}, [stage, plateNumber, sessionId]);

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

	const resolveGateClosedWaiters = (gateId: GateId) => {
		const waiters = gateClosedWaitersRef.current[gateId];
		if (waiters.length === 0) {
			return;
		}

		gateClosedWaitersRef.current[gateId] = [];

		for (const waiter of waiters) {
			window.clearTimeout(waiter.timerId);
			waiter.resolve();
		}
	};

	const resolveSessionWaiters = (correlationId: string, sessionIdValue: string) => {
		const waiters = sessionWaitersRef.current.filter((waiter) => waiter.correlationId === correlationId);
		if (waiters.length === 0) {
			createdSessionsByCorrelationRef.current.set(correlationId, sessionIdValue);
			return;
		}

		sessionWaitersRef.current = sessionWaitersRef.current.filter(
			(waiter) => waiter.correlationId !== correlationId
		);

		for (const waiter of waiters) {
			window.clearTimeout(waiter.timerId);
			waiter.resolve(sessionIdValue);
		}
	};

	const resolveStagePathWaiters = (stageValue: SimulatorStage) => {
		const waiters = stagePathWaitersRef.current.filter((waiter) => waiter.stage === stageValue);
		if (waiters.length === 0) {
			return;
		}

		stagePathWaitersRef.current = stagePathWaitersRef.current.filter(
			(waiter) => waiter.stage !== stageValue
		);

		for (const waiter of waiters) {
			window.clearTimeout(waiter.timerId);
			waiter.resolve();
		}
	};

	const applyGateState = (gateId: 'entry-gate' | 'exit-gate', gateState: string) => {
		const isOpen = isGateOpenState(gateState);

		if (gateId === 'entry-gate') {
			const wasOpen = entryGateOpenRef.current;
			entryGateOpenRef.current = isOpen;
			setEntryGateOpen(isOpen);
			if (wasOpen && !isOpen) {
				resolveGateClosedWaiters('entry-gate');
			}
		}

		if (gateId === 'exit-gate') {
			const wasOpen = exitGateOpenRef.current;
			exitGateOpenRef.current = isOpen;
			setExitGateOpen(isOpen);
			if (wasOpen && !isOpen) {
				resolveGateClosedWaiters('exit-gate');
			}
		}

		if (isOpen) {
			resolveGateWaiters(gateId);
		}
	};

	const waitForGateOpen = (gateId: GateId) => {
		const gateIsOpen = gateId === 'entry-gate' ? entryGateOpenRef.current : exitGateOpenRef.current;
		if (gateIsOpen || !isRealtimeGateSyncActive()) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			gateWaitersRef.current[gateId].push({ resolve, timerId: 0 });
		});
	};

	const waitForGateClosed = (gateId: GateId) => {
		const gateIsOpen = gateId === 'entry-gate' ? entryGateOpenRef.current : exitGateOpenRef.current;
		if (!gateIsOpen || !isRealtimeGateSyncActive()) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			gateClosedWaitersRef.current[gateId].push({ resolve, timerId: 0 });
		});
	};

	const waitForSessionCreated = (correlationId: string) => {
		if (!correlationId) {
			return Promise.reject(new Error('Missing correlation id for session wait'));
		}

		const preCreatedSessionId = createdSessionsByCorrelationRef.current.get(correlationId);
		if (preCreatedSessionId) {
			createdSessionsByCorrelationRef.current.delete(correlationId);
			return Promise.resolve(preCreatedSessionId);
		}

		return new Promise<string>((resolve, reject) => {
			sessionWaitersRef.current.push({ correlationId, resolve, reject, timerId: 0 });
		});
	};

	const waitForStagePath = (stageValue: SimulatorStage) => {
		return new Promise<void>((resolve, reject) => {
			const timerId = window.setTimeout(() => {
				stagePathWaitersRef.current = stagePathWaitersRef.current.filter((waiter) => waiter.timerId !== timerId);
				reject(new Error(`Timeout waiting for stage path completion: ${stageValue}`));
			}, STAGE_PATH_TIMEOUT_MS);

			stagePathWaitersRef.current.push({
				stage: stageValue,
				resolve,
				reject,
				timerId
			});
		});
	};

	const generateVehiclePlateNumber = () => {
		const suffix = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 900 + 100)}`;
		return `59A${suffix}`.toUpperCase();
	};

	const occupiedSceneSlotIds = useMemo(() => {
		return new Set(parkedVehicles.map((vehicle) => vehicle.sceneSlotId));
	}, [parkedVehicles]);

	const sortParkingSlotsForScene = (slots: Awaited<ReturnType<typeof listParkingSlots>>) => {
		return [...slots].sort((left, right) => {
			if (left.level !== right.level) {
				return left.level - right.level;
			}

			return left.slot_code.localeCompare(right.slot_code);
		});
	};

	const loadParkedVehiclesFromDatabase = async () => {
		const apiKey = getSimulatorApiKey();
		if (!apiKey) {
			return;
		}

		const startedAt = Date.now();
		setHydrating(true);
		try {
			const [occupiedSlots, parkedSessions] = await Promise.all([
				listParkingSlots({ is_occupied: true }, apiKey),
				listParkingSessions({}, apiKey)
			]);

			const parkedSessionMap = new Map(
				parkedSessions.map((session) => [session._id, session] as const)
			);

			const hydratedVehicles = await Promise.all(
				sortParkingSlotsForScene(occupiedSlots).map(async (slot, index) => {
					const sessionId = slot.current_session_id?.trim();
					if (!sessionId) {
						pushLog('Hydrate skipped', `Slot ${slot.slot_code} has no session id`);
						return null;
					}

					const session = parkedSessionMap.get(sessionId);
					if (!session) {
						pushLog('Hydrate skipped', `Session ${sessionId} was not found for slot ${slot.slot_code}`);
						return null;
					}

					const sceneSlotId = SCENE_SLOT_IDS[index];
					if (sceneSlotId === undefined) {
						pushLog('Hydrate skipped', `No scene slot available for DB slot ${slot.slot_code}`);
						return null;
					}

					try {
						const [, vehicle] = await Promise.all([
							getRfidCardById(session.rfid_card_id, apiKey),
							getVehicleById(session.vehicle_id, apiKey)
						]);

						const plateNumberValue =
							(session.entry_plate_text || vehicle.plate_number).trim().toUpperCase();
						const vehicleTypeValue: VehicleType =
							vehicle.vehicle_type === 'motorbike' ? 'motorbike' : 'car';

						return {
							localId: session._id,
							sessionId: session._id,
							plateNumber: plateNumberValue,
							dbSlotCode: slot.slot_code,
							sceneSlotId,
							vehicleType: vehicleTypeValue
						};
					} catch (error) {
						pushLog(
							'Hydrate skipped',
							`Failed to load slot ${slot.slot_code}: ${error instanceof Error ? error.message : 'unknown error'}`
						);
						return null;
					}
				})
			);

			const nextParkedVehicles = hydratedVehicles.filter(
				(vehicle): vehicle is ParkedVehicle => Boolean(vehicle)
			);

			setParkedVehicles(nextParkedVehicles);
			setActiveVehicle(null);
			activeCorrelationIdRef.current = '';
			createdSessionsByCorrelationRef.current.clear();

			if (nextParkedVehicles.length > 0) {
				setStage('parked');
				setResult(`Loaded ${nextParkedVehicles.length} parked vehicle(s) from database`);
				const [primaryParkedVehicle] = nextParkedVehicles;
				if (primaryParkedVehicle) {
					setDbSlotCode(primaryParkedVehicle.dbSlotCode);
				}
			} else {
				setStage('idle');
				setResult('Ready');
				setDbSlotCode('');
			}
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Failed to load parked vehicles from database');
			pushLog(
				'Hydrate failed',
				error instanceof Error ? error.message : 'Unable to load parked vehicles from database'
			);
		} finally {
			await keepSpinnerVisible(startedAt);
			setHydrating(false);
		}
	};

	useEffect(() => {
		void loadParkedVehiclesFromDatabase();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
			if (event.eventName === 'session.created') {
				const createdSessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined;
				const sessionStatus = typeof event.payload?.status === 'string' ? event.payload.status : undefined;
				const vehicleId = typeof event.payload?.vehicleId === 'string' ? event.payload.vehicleId : undefined;
				if (event.correlationId === activeCorrelationIdRef.current && createdSessionId) {

					setActiveVehicle((current) =>
						current
							? {
								...current,
								sessionId: createdSessionId
							}
							: current
						);
					resolveSessionWaiters(event.correlationId, createdSessionId);
					pushLog('Session synced', `Backend created session ${createdSessionId}`);
					return;
				}

				if (
					sessionStatus === 'approved_entry' &&
					createdSessionId &&
					vehicleId &&
					!busyRef.current &&
					!hydratingRef.current
				) {
					pushLog('Operator entry detected', `Processing approved entry for session ${createdSessionId} (correlation: ${event.correlationId})`);
					void runOperatorApprovedEntryFlow(createdSessionId, vehicleId, event.correlationId);
				}

				return;
			}

			if (event.eventName === 'slot.assigned') {
				const slotCode = typeof event.payload?.slotCode === 'string' ? event.payload.slotCode : undefined;
				const assignedSessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined;
				if (
					event.correlationId === activeCorrelationIdRef.current &&
					assignedSessionId &&
					slotCode
				) {
					setDbSlotCode(slotCode);
					setActiveVehicle((current) =>
						current
							? {
								...current,
								sessionId: assignedSessionId,
								dbSlotCode: slotCode
							}
							: current
					);
					pushLog('Slot synced', `Backend assigned slot ${slotCode}`);
				}

				return;
			}

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

	const clearInputFields = () => {
		setPlateNumber('');
		setSessionId('');
		setSlotId('');
	};

	const finalizeEntryJourney = async (
		sessionIdValue: string,
		correlationIdValue: string,
		plateNumberValue: string,
		selectedSceneSlotId: SceneSlotId,
		vehicleTypeValue: VehicleType
	) => {
		setSessionId(sessionIdValue);
		setActiveVehicle((current) =>
			current
				? {
					...current,
					sessionId: sessionIdValue
				}
				: {
					localId: correlationIdValue,
					sessionId: sessionIdValue,
					plateNumber: plateNumberValue,
					dbSlotCode: '',
					sceneSlotId: selectedSceneSlotId,
					vehicleType: vehicleTypeValue
				}
		);
		onSessionCreated(sessionIdValue, plateNumberValue);

		const slotResult = await assignParkingSlot(
			sessionIdValue,
			{
				correlation_id: correlationIdValue
			},
			getSimulatorApiKey()
		);

		setDbSlotCode(slotResult.slot.slot_code);
		setActiveVehicle((current) =>
			current
				? {
					...current,
					dbSlotCode: slotResult.slot.slot_code
				}
				: current
		);
		pushLog('Slot assigned', `Real DB slot ${slotResult.slot.slot_code} reserved for session ${sessionIdValue}`);
		setResult(`Database slot assigned: ${slotResult.slot.slot_code}`);

		setStage('entry_processing');
		pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
		await waitForStagePath('entry_processing');
		setStage('assigned_slot');
		pushLog('Scene slot', `Visual slot index ${selectedSceneSlotId}`);
		await waitForStagePath('assigned_slot');
		setStage('parked');
		setParkedVehicles((current) => [
			...current,
			{
				localId: correlationIdValue,
				sessionId: sessionIdValue,
				plateNumber: plateNumberValue,
				dbSlotCode: slotResult.slot.slot_code,
				sceneSlotId: selectedSceneSlotId,
				vehicleType: vehicleTypeValue
			}
		]);
		setActiveVehicle(null);
		pushLog('Vehicle parked', `Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
		setResult(`Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
		clearInputFields();
	};

	const runOperatorApprovedEntryFlow = async (
		sessionIdValue: string,
		vehicleId: string,
		correlationIdValue: string
	) => {
		const existingVehicle = activeVehicleRef.current;
		const resumingExistingVehicle = Boolean(existingVehicle);

		const occupiedSlots = new Set(parkedVehiclesRef.current.map((vehicle) => vehicle.sceneSlotId));
		const selectedSceneSlotId = chooseSceneSlotId(occupiedSlots, Number.parseInt(slotIdRef.current, 10));
		if (!selectedSceneSlotId) {
			setResult('Bãi mô phỏng đã đầy, không còn slot trống');
			pushLog('Entry blocked', 'No free scene slot available for operator-created session');
			return;
		}

		busyRef.current = true;
		setBusy(true);
		try {
			const apiKey = getSimulatorApiKey();
			const vehicle = await getVehicleById(vehicleId, apiKey);
			const nextPlateNumber = normalizePlateNumber(vehicle.plate_number);
			const nextVehicleType: VehicleType = vehicle.vehicle_type === 'motorbike' ? 'motorbike' : 'car';
			const normalizedCorrelationId = correlationIdValue || crypto.randomUUID();
			const localId = existingVehicle?.localId || normalizedCorrelationId;

			activeCorrelationIdRef.current = normalizedCorrelationId;
			setPlateNumber(nextPlateNumber);
			setVehicleType(nextVehicleType);
			setSessionId(sessionIdValue);
			setStage(resumingExistingVehicle ? 'waiting_rfid' : 'approaching_entry');
			currentRfidCheckpointRef.current = 'entry_rfid';
			setActiveVehicle({
				localId,
				sessionId: sessionIdValue,
				plateNumber: nextPlateNumber,
				dbSlotCode: '',
				sceneSlotId: selectedSceneSlotId,
				vehicleType: nextVehicleType
			});
			setResult('Vehicle spawned from operator-approved entry');
			pushLog('Vehicle spawned', `${nextPlateNumber} -> session ${sessionIdValue}`);

			if (!resumingExistingVehicle) {
				await waitForStagePath('approaching_entry');
				setStage('waiting_rfid');
				pushLog('Vehicle stopped', 'Vehicle reached entry checkpoint after operator approval');
			} else {
				pushLog('Vehicle resumed', 'Existing vehicle is waiting at RFID checkpoint for operator approval');
			}
			await notifyCheckpoint('entry_rfid', nextPlateNumber, sessionIdValue, normalizedCorrelationId);

			if (isRealtimeGateSyncActive()) {
				setResult('Waiting for backend gate state');
				pushLog('Gate awaiting socket', 'Waiting for backend signal to open entry gate');
				await waitForGateOpen('entry-gate');
				pushLog('Barrier opened', 'Entry gate opened via backend API event');
			} else {
				applyGateState('entry-gate', 'open');
				pushLog('Barrier opened', 'Entry gate opened locally');
			}

			pushLog('Vehicle proceeding', 'Monthly card approved - vehicle proceeding through open gate');
			await finalizeEntryJourney(
				sessionIdValue,
				normalizedCorrelationId,
				nextPlateNumber,
				selectedSceneSlotId,
				nextVehicleType
			);
		} catch (error) {
			setResult(error instanceof Error ? error.message : 'Operator-driven entry simulation failed');
			pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
			setActiveVehicle(null);
			setDbSlotCode('');
			setStage('idle');
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};

	const notifyCheckpoint = async (
		checkpoint: 'entry_rfid' | 'exit_rfid',
		plateNumberValue: string,
		sessionIdValue: string,
		correlationIdValue: string
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

	const removeParkedVehicle = (localId: string) => {
		setParkedVehicles((current) => current.filter((vehicle) => vehicle.localId !== localId));
	};



	// const simulateEntry = async () => {
	// 	if (busy || hydrating) {
	// 		return;
	// 	}

	// 	const selectedSceneSlotId = chooseSceneSlotId(occupiedSceneSlotIds, Number.parseInt(slotId, 10));
	// 	if (!selectedSceneSlotId) {
	// 		setResult('Bãi mô phỏng đã đầy, không còn slot trống');
	// 		pushLog('Entry blocked', 'No free scene slot available');
	// 		return;
	// 	}

	// 	setBusy(true);
	// 	setStage('approaching_entry');
	// 	const nextPlateNumber = normalizePlateNumber(plateNumber) || generateVehiclePlateNumber();
	// 	const selectedVehicleType = vehicleType;
	// 	let persistedVehicleType: VehicleType = selectedVehicleType;
	// 	const correlationId = crypto.randomUUID();
	// 	activeCorrelationIdRef.current = correlationId;
	// 	setPlateNumber(nextPlateNumber);
	// 	setActiveVehicle({
	// 		localId: correlationId,
	// 		sessionId: '',
	// 		plateNumber: nextPlateNumber,
	// 		dbSlotCode: '',
	// 		sceneSlotId: selectedSceneSlotId,
	// 		vehicleType: selectedVehicleType
	// 	});
	// 	setResult('Vehicle spawned and waiting for RFID scan');
	// 	pushLog('Vehicle spawned', `${nextPlateNumber} -> scene slot ${selectedSceneSlotId}`);
	// 	try {
	// 		const vehicle = await createSimulatorVehicle({
	// 			plateNumber: nextPlateNumber,
	// 			vehicleType: selectedVehicleType
	// 		});
	// 		persistedVehicleType = vehicle.vehicle_type === 'motorbike' ? 'motorbike' : 'car';
	// 		setActiveVehicle((current) =>
	// 			current
	// 				? {
	// 					...current,
	// 					vehicleType: persistedVehicleType
	// 				}
	// 				: current
	// 		);
	// 					(!!activeVehicleRef.current || stage === 'waiting_rfid' || stage === 'approaching_entry')
	// 	} catch (error) {
	// 		setResult(error instanceof Error ? error.message : 'Failed to create vehicle record');
	// 		pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
	// 		setActiveVehicle(null);
	// 		setStage('idle');
	// 		setBusy(false);
	// 		return;
	// 	}
	// 	if (!isRealtimeGateSyncActive()) {
	// 		applyGateState('entry-gate', 'closed');
	// 		applyGateState('exit-gate', 'closed');
	// 	}

	// 	try {
	// 		await waitForStagePath('approaching_entry');
	// 		setStage('waiting_rfid');
	// 		currentRfidCheckpointRef.current = 'entry_rfid';
	// 		pushLog('Vehicle stopped', 'Waiting for RFID scan and plate recognition');
	// 		await notifyCheckpoint('entry_rfid', nextPlateNumber, '', correlationId);

	// 		if (isRealtimeGateSyncActive()) {
	// 			setResult('Waiting for backend gate state');
	// 			pushLog('Gate awaiting socket', 'Waiting for backend signal to open entry gate');
	// 			await waitForGateOpen('entry-gate');
	// 			pushLog('Barrier opened', 'Entry gate opened via backend API event');
	// 		} else {
	// 			applyGateState('entry-gate', 'open');
	// 			pushLog('Barrier opened', 'Entry gate lifted after check-in');
	// 		}

	// 		// Wait for gate to close before continuing
	// 		if (isRealtimeGateSyncActive()) {
	// 			setResult('Waiting for gate to close');
	// 			pushLog('Gate waiting close', 'Vehicle passing through, waiting for gate to close');
	// 			await waitForGateClosed('entry-gate');
	// 			pushLog('Barrier closed', 'Entry gate closed, vehicle proceeding to parking');
	// 		}

	// 		const createdSessionId = await waitForSessionCreated(correlationId);
	// 		setSessionId(createdSessionId);
	// 		setActiveVehicle((current) =>
	// 			current
	// 				? {
	// 					...current,
	// 					sessionId: createdSessionId
	// 				}
	// 				: current
	// 		);
	// 		onSessionCreated(createdSessionId, nextPlateNumber);

	// 		const slotResult = await assignParkingSlot(
	// 			createdSessionId,
	// 			{
	// 				correlation_id: correlationId
	// 			},
	// 			getSimulatorApiKey()
	// 		);
	// 		setDbSlotCode(slotResult.slot.slot_code);
	// 		setActiveVehicle((current) =>
	// 			current
	// 				? {
	// 					...current,
	// 					dbSlotCode: slotResult.slot.slot_code
	// 				}
	// 				: current
	// 		);
	// 		pushLog('Slot assigned', `Real DB slot ${slotResult.slot.slot_code} reserved for session ${createdSessionId}`);
	// 		setResult(`Database slot assigned: ${slotResult.slot.slot_code}`);

	// 		setStage('entry_processing');

	// 		pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
	// 		await waitForStagePath('entry_processing');
	// 		setStage('assigned_slot');
	// 		pushLog('Scene slot', `Visual slot index ${selectedSceneSlotId}`);
	// 		await waitForStagePath('assigned_slot');
	// 		setStage('parked');
	// 		setParkedVehicles((current) => [
	// 			...current,
	// 			{
	// 				localId: correlationId,
	// 				sessionId: createdSessionId,
	// 				plateNumber: nextPlateNumber,
	// 				dbSlotCode: slotResult.slot.slot_code,
	// 				sceneSlotId: selectedSceneSlotId,
	// 				vehicleType: persistedVehicleType
	// 			}
	// 		]);
	// 		setActiveVehicle(null);
	// 		pushLog('Vehicle parked', `Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
	// 		setResult(`Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
	// 		clearInputFields();
	// 	} catch (error) {
	// 		setResult(error instanceof Error ? error.message : 'Entry simulation failed');
	// 		pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
	// 		setActiveVehicle(null);
	// 		setDbSlotCode('');
	// 		setStage('idle');
	// 	} finally {
	// 		setBusy(false);
	// 	}
	// };

	const simulateEntry = async () => {
	if (busy || hydrating) return;

	const selectedSceneSlotId = chooseSceneSlotId(occupiedSceneSlotIds, Number.parseInt(slotId, 10));
	if (!selectedSceneSlotId) {
		setResult('Bãi mô phỏng đã đầy, không còn slot trống');
		pushLog('Entry blocked', 'No free scene slot available');
		return;
	}

	setBusy(true);
	setStage('approaching_entry');
	const nextPlateNumber = normalizePlateNumber(plateNumber) || generateVehiclePlateNumber();
	const selectedVehicleType = vehicleType;
	let persistedVehicleType: VehicleType = selectedVehicleType;
	const correlationId = crypto.randomUUID();
	activeCorrelationIdRef.current = correlationId;
	setPlateNumber(nextPlateNumber);
	setActiveVehicle({
		localId: correlationId,
		sessionId: '',
		plateNumber: nextPlateNumber,
		dbSlotCode: '',
		sceneSlotId: selectedSceneSlotId,
		vehicleType: selectedVehicleType
	});
	setResult('Vehicle spawned and waiting for RFID scan');
	pushLog('Vehicle spawned', `${nextPlateNumber} -> scene slot ${selectedSceneSlotId}`);

	try {
		const vehicle = await createSimulatorVehicle({
			plateNumber: nextPlateNumber,
			vehicleType: selectedVehicleType
		});
		persistedVehicleType = vehicle.vehicle_type === 'motorbike' ? 'motorbike' : 'car';
		setActiveVehicle((current) =>
			current ? { ...current, vehicleType: persistedVehicleType } : current
		);
	} catch (error) {
		setResult(error instanceof Error ? error.message : 'Failed to create vehicle record');
		pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
		setActiveVehicle(null);
		setStage('idle');
		setBusy(false);
		return;
	}

	if (!isRealtimeGateSyncActive()) {
		applyGateState('entry-gate', 'closed');
		applyGateState('exit-gate', 'closed');
	}

	try {
		await waitForStagePath('approaching_entry');
		setStage('waiting_rfid');
		currentRfidCheckpointRef.current = 'entry_rfid';
		pushLog('Vehicle stopped', 'Waiting for RFID scan and plate recognition');
		await notifyCheckpoint('entry_rfid', nextPlateNumber, '', correlationId);

		if (isRealtimeGateSyncActive()) {
			setResult('Waiting for backend gate state');
			pushLog('Gate awaiting socket', 'Waiting for backend signal to open entry gate');
			await waitForGateOpen('entry-gate');
			pushLog('Barrier opened', 'Entry gate opened via backend API event');
		} else {
			applyGateState('entry-gate', 'open');
			pushLog('Barrier opened', 'Entry gate lifted after check-in');
		}

		// Chờ session từ socket hoặc fallback poll API theo correlationId
		let createdSessionId: string;
		const sessionFromSocket = await Promise.race([
			waitForSessionCreated(correlationId),
			wait(3000).then(() => null) // chờ socket 3s trước
		]);

		if (sessionFromSocket) {
			createdSessionId = sessionFromSocket;
			pushLog('Session received', `Session ${createdSessionId} from socket event`);
		} else {
			// Fallback: poll API lấy session mới nhất theo plateNumber
			pushLog('Session polling', 'Socket timeout, polling API for session...');
			let found: string | null = null;
			for (let i = 0; i < 10; i++) {
				await wait(1000);
				try {
					const sessions = await listParkingSessions({}, getSimulatorApiKey());
					const match = sessions.find(
						(s) =>
							(s.entry_plate_text?.toUpperCase() === nextPlateNumber ||
								(s as any).plate_number?.toUpperCase() === nextPlateNumber) &&
							(s.status === 'active' || s.status === 'approved_entry' || !s.exit_time)
					);
					if (match) {
						found = match._id;
						pushLog('Session polled', `Found session ${match._id} via API fallback (attempt ${i + 1})`);
						resolveSessionWaiters(correlationId, match._id);
						break;
					}
				} catch {
					// tiếp tục poll
				}
			}
			if (!found) {
				throw new Error('Timeout: session not created after gate open');
			}
			createdSessionId = found;
		}

		setSessionId(createdSessionId);
		setActiveVehicle((current) =>
			current ? { ...current, sessionId: createdSessionId } : current
		);
		onSessionCreated(createdSessionId, nextPlateNumber);

		const slotResult = await assignParkingSlot(
			createdSessionId,
			{ correlation_id: correlationId },
			getSimulatorApiKey()
		);
		setDbSlotCode(slotResult.slot.slot_code);
		setActiveVehicle((current) =>
			current ? { ...current, dbSlotCode: slotResult.slot.slot_code } : current
		);
		pushLog('Slot assigned', `DB slot ${slotResult.slot.slot_code} for session ${createdSessionId}`);
		setResult(`Database slot assigned: ${slotResult.slot.slot_code}`);

		setStage('entry_processing');
		pushLog('Vehicle turning', 'Vehicle passed RFID and is entering the parking lanes');
		await waitForStagePath('entry_processing');

		setStage('assigned_slot');
		pushLog('Scene slot', `Visual slot index ${selectedSceneSlotId}`);
		await waitForStagePath('assigned_slot');

		setStage('parked');
		setParkedVehicles((current) => [
			...current,
			{
				localId: correlationId,
				sessionId: createdSessionId,
				plateNumber: nextPlateNumber,
				dbSlotCode: slotResult.slot.slot_code,
				sceneSlotId: selectedSceneSlotId,
				vehicleType: persistedVehicleType
			}
		]);
		setActiveVehicle(null);
		pushLog('Vehicle parked', `Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
		setResult(`Vehicle parked in DB slot ${slotResult.slot.slot_code}`);
		clearInputFields();
	} catch (error) {
		setResult(error instanceof Error ? error.message : 'Entry simulation failed');
		pushLog('Entry error', error instanceof Error ? error.message : 'Unknown error');
		setActiveVehicle(null);
		setDbSlotCode('');
		setStage('idle');
	} finally {
		setBusy(false);
	}
};

const simulateExit = async (vehicle: ParkedVehicle) => {
	if (busy || hydrating) return;

	if (!vehicle.sessionId) {
		setResult('Vehicle session is missing for exit simulation');
		return;
	}

	const remainingVehicles = parkedVehicles.filter((item) => item.localId !== vehicle.localId);

	setBusy(true);
	setActiveVehicle(vehicle);
	removeParkedVehicle(vehicle.localId);
	setStage('approaching_exit');
	currentRfidCheckpointRef.current = 'exit_rfid';
	setSessionId(vehicle.sessionId);
	setPlateNumber(vehicle.plateNumber);
	setDbSlotCode(vehicle.dbSlotCode);

	if (!isRealtimeGateSyncActive()) {
		applyGateState('exit-gate', 'closed');
	}

	pushLog('Vehicle leaving slot', `${vehicle.plateNumber} leaving scene slot ${vehicle.sceneSlotId}`);

	try {
		// Bước 1: chờ 3D scene xe di chuyển từ slot ra đến exit checkpoint
		await waitForStagePath('approaching_exit');

		const correlationId = crypto.randomUUID();
		activeCorrelationIdRef.current = correlationId;

		// Bước 2: xe dừng tại exit checkpoint, chờ quét RFID
		setStage('waiting_rfid');
		currentRfidCheckpointRef.current = 'exit_rfid';
		setResult('Xe đang chờ quét thẻ RFID tại cổng ra');
		pushLog('Vehicle stopped', 'Xe dừng tại exit checkpoint, chờ quét RFID');

		// Notify backend xe đã đến exit checkpoint
		await notifyCheckpoint('exit_rfid', vehicle.plateNumber, vehicle.sessionId, correlationId);

		// Bước 3: chờ operator/backend xác nhận RFID → mở gate
		// Gate chỉ mở sau khi backend xác nhận RFID hợp lệ
		if (isRealtimeGateSyncActive()) {
			setResult('Chờ operator xác nhận và mở cổng ra...');
			pushLog('RFID wait', 'Chờ ESP32 quét thẻ và backend xác nhận');
			await waitForGateOpen('exit-gate');
			pushLog('Barrier opened', 'Cổng ra mở sau khi RFID được xác nhận');
		} else {
			applyGateState('exit-gate', 'open');
			pushLog('Barrier opened', 'Cổng ra mở (local mode)');
		}

		// Bước 4: hoàn thành session trong DB ngay khi gate mở
		// Không chờ gate đóng — gate đóng do xe đi qua barrier trigger handleExitBarrierPassed
		const exitResult = await completeSimulatorParkingExit({
			sessionId: vehicle.sessionId,
			exitPlateNumber: vehicle.plateNumber,
			paymentStatus: 'pending',
			correlationId
		});

		if (exitResult.gate_action !== 'open') {
			throw new Error(
				exitResult.session.is_plate_mismatch
					? 'Biển số không khớp, xe bị từ chối'
					: 'Xe chưa thể rời bãi'
			);
		}

		pushLog('Exit persisted', `Lưu transaction cho session ${vehicle.sessionId}`);
		setResult(
			`Exit OK: ${exitResult.transaction.payment_status} / ${exitResult.transaction.final_amount}`
		);

		// Bước 5: xe đi qua barrier → handleExitBarrierPassed đóng gate
		// chờ 3D scene animate xe ra ngoài hoàn toàn
		setStage('exit_processing');
		pushLog('Vehicle exiting', 'Xe đang đi qua cổng ra');
		await waitForStagePath('exit_processing');

		setResult(`Xe đã ra khỏi bãi từ slot ${vehicle.dbSlotCode || 'released'}`);
		setStage(remainingVehicles.length > 0 ? 'parked' : 'completed');
		setActiveVehicle(null);
		pushLog('Simulation completed', 'Xe đã ra khỏi bãi, slot được giải phóng');
		clearInputFields();
	} catch (error) {
		setResult(error instanceof Error ? error.message : 'Exit simulation failed');
		pushLog('Exit error', error instanceof Error ? error.message : 'Unknown error');
		setActiveVehicle(null);
		setParkedVehicles((current) =>
			[...current, vehicle].sort((a, b) => a.sceneSlotId - b.sceneSlotId)
		);
		setStage('parked');
	} finally {
		setBusy(false);
	}
};

// const simulateExit = async (vehicle: ParkedVehicle) => {
// 	if (busy || hydrating) return;

// 	if (!vehicle.sessionId) {
// 		setResult('Vehicle session is missing for exit simulation');
// 		return;
// 	}

// 	const remainingVehicles = parkedVehicles.filter((item) => item.localId !== vehicle.localId);

// 	setBusy(true);
// 	setActiveVehicle(vehicle);
// 	removeParkedVehicle(vehicle.localId);
// 	setStage('approaching_exit');
// 	currentRfidCheckpointRef.current = 'exit_rfid';
// 	setSessionId(vehicle.sessionId);
// 	setPlateNumber(vehicle.plateNumber);
// 	setDbSlotCode(vehicle.dbSlotCode);
// 	if (!isRealtimeGateSyncActive()) {
// 		applyGateState('exit-gate', 'closed');
// 	}
// 	pushLog('Vehicle leaving slot', `${vehicle.plateNumber} leaving scene slot ${vehicle.sceneSlotId}`);

// 	try {
// 		// Bước 1: chờ xe di chuyển ra cổng exit
// 		await waitForStagePath('approaching_exit');

// 		const correlationId = crypto.randomUUID();
// 		activeCorrelationIdRef.current = correlationId;

// 		// Bước 2: xe dừng tại checkpoint, chờ RFID scan
// 		setStage('waiting_rfid');
// 		currentRfidCheckpointRef.current = 'exit_rfid';
// 		setResult('Vehicle reached exit checkpoint, waiting for RFID scan');
// 		pushLog('Vehicle stopped', 'Waiting for exit RFID scan at exit checkpoint');

// 		// Notify backend xe đã đến exit checkpoint
// 		await notifyCheckpoint('exit_rfid', vehicle.plateNumber, vehicle.sessionId, correlationId);

// 		// Bước 3: chờ operator/backend xác nhận → mở gate
// 		if (isRealtimeGateSyncActive()) {
// 			setResult('Waiting for operator to open exit gate');
// 			pushLog('Gate awaiting socket', 'Waiting for operator to open exit gate');
// 			await waitForGateOpen('exit-gate');
// 			pushLog('Barrier opened', 'Exit gate opened via backend event');
// 		} else {
// 			applyGateState('exit-gate', 'open');
// 			pushLog('Barrier opened', 'Exit gate lifted locally');
// 		}

// 		// Bước 4: hoàn thành exit trong DB ngay khi gate mở
// 		// Không chờ gate đóng vì gate đóng do 3D scene trigger sau khi xe qua
// 		const exitResult = await completeSimulatorParkingExit({
// 			sessionId: vehicle.sessionId,
// 			exitPlateNumber: vehicle.plateNumber,
// 			paymentStatus: 'pending',
// 			correlationId
// 		});

// 		if (exitResult.gate_action !== 'open') {
// 			throw new Error(
// 				exitResult.session.is_plate_mismatch
// 					? 'Biển số không khớp, xe bị từ chối'
// 					: 'Xe chưa thể rời bãi'
// 			);
// 		}

// 		pushLog('Exit persisted', `Transaction stored for session ${vehicle.sessionId}`);
// 		setResult(
// 			`Exit persisted: ${exitResult.transaction.payment_status} / ${exitResult.transaction.final_amount}`
// 		);

// 		// Bước 5: chờ 3D scene xe đi qua barrier (trigger handleExitBarrierPassed → gate close)
// 		setStage('exit_processing');
// 		pushLog('Vehicle exiting', 'Vehicle passing through exit gate');
// 		await waitForStagePath('exit_processing');

// 		setResult(`Vehicle exited from DB slot ${vehicle.dbSlotCode || 'released'}`);
// 		setStage(remainingVehicles.length > 0 ? 'parked' : 'completed');
// 		setActiveVehicle(null);
// 		pushLog('Simulation completed', 'Vehicle exited and slot released');
// 		clearInputFields();
// 	} catch (error) {
// 		setResult(error instanceof Error ? error.message : 'Exit simulation failed');
// 		pushLog('Exit error', error instanceof Error ? error.message : 'Unknown error');
// 		setActiveVehicle(null);
// 		setParkedVehicles((current) =>
// 			[...current, vehicle].sort((a, b) => a.sceneSlotId - b.sceneSlotId)
// 		);
// 		setStage('parked');
// 	} finally {
// 		setBusy(false);
// 	}
// };

	const handleEntryBarrierPassed = () => {
		if (isRealtimeGateSyncActive()) {
			const socket = simulatorSocketRef.current;
			if (!socket) {
				pushLog('Barrier close skipped', 'Entry gate socket unavailable, using local state only');
				applyGateState('entry-gate', 'closed');
				return;
			}

			void requestSimulatorGateCommand(socket, {
				gateId: 'entry-gate',
				command: 'close',
				correlationId: activeCorrelationIdRef.current || crypto.randomUUID()
			})
				.then((ack) => {
					pushLog(
						'Barrier closed',
						`Entry gate closed after vehicle passed barrier (${ack.state || 'unknown'})`
					);
				})
				.catch((error) => {
					pushLog(
						'Barrier close failed',
						error instanceof Error ? error.message : 'Unable to close entry gate via backend'
					);
					applyGateState('entry-gate', 'closed');
				});
			return;
		}

		applyGateState('entry-gate', 'closed');
		pushLog('Barrier closed', 'Entry gate closed after vehicle passed barrier');
	};

	const handleExitBarrierPassed = () => {
		if (isRealtimeGateSyncActive()) {
			const socket = simulatorSocketRef.current;
			if (!socket) {
				pushLog('Barrier close skipped', 'Exit gate socket unavailable, using local state only');
				applyGateState('exit-gate', 'closed');
				return;
			}

			void requestSimulatorGateCommand(socket, {
				gateId: 'exit-gate',
				command: 'close',
				correlationId: activeCorrelationIdRef.current || crypto.randomUUID()
			})
				.then((ack) => {
					pushLog(
						'Barrier closed',
						`Exit gate closed after vehicle passed barrier (${ack.state || 'unknown'})`
					);
				})
				.catch((error) => {
					pushLog(
						'Barrier close failed',
						error instanceof Error ? error.message : 'Unable to close exit gate via backend'
					);
					applyGateState('exit-gate', 'closed');
				});
			return;
		}

		applyGateState('exit-gate', 'closed');
		pushLog('Barrier closed', 'Exit gate closed after vehicle passed barrier');
	};

	const handleParkedCarClick = (vehicleLocalId: string) => {
		if (stage !== 'parked' || busy) {
			return;
		}

		const vehicle = parkedVehicles.find((item) => item.localId === vehicleLocalId);
		if (!vehicle) {
			return;
		}

		void simulateExit(vehicle);
	};

	const handleManualExit = () => {
		const latestParkedVehicle = parkedVehicles[parkedVehicles.length - 1];
		if (!latestParkedVehicle) {
			setResult('No parked vehicle available for manual exit');
			return;
		}

		void simulateExit(latestParkedVehicle);
	};

	const reset = () => {
		setStage('idle');
		setSessionId('');
		setDbSlotCode('');
		setParkedVehicles([]);
		setActiveVehicle(null);
		setLog([]);
		setResult('Ready');
		activeCorrelationIdRef.current = '';
		createdSessionsByCorrelationRef.current.clear();
		setSlotId('');
		setPlateNumber('');
	};

	const handleStagePathCompleted = (completedStage: SimulatorStage) => {
		resolveStagePathWaiters(completedStage);
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
							activePlateNumber={activeVehicle?.plateNumber || ''}
							activeVehicleType={activeVehicle?.vehicleType || vehicleType}
							activeSceneSlotId={activeVehicle ? String(activeVehicle.sceneSlotId) : ''}
							rfidCheckpoint={currentRfidCheckpointRef.current}
							parkedVehicles={parkedVehicles}
							entryGateOpen={entryGateOpen}
							exitGateOpen={exitGateOpen}
							onParkedCarClick={handleParkedCarClick}
							onEntryBarrierPassed={handleEntryBarrierPassed}
							onExitBarrierPassed={handleExitBarrierPassed}
							onStagePathCompleted={handleStagePathCompleted}
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
						<div>
							<p className="status-label">Parked cars</p>
							<p className="simulator-result">{parkedVehicles.length}</p>
						</div>
					</div>
				</div>

				<aside className="simulator-control-column">
					<div className="field-row">
						<label className="field">
							<span>Vehicle Plate</span>
							<input
								value={plateNumber}
								onChange={(event) => setPlateNumber(event.target.value.toUpperCase())}
								placeholder="Nhập biển số hoặc để trống để tự sinh"
							/>
						</label>
						<label className="field">
							<span>Vehicle Type</span>
							<select
								value={vehicleType}
								onChange={(event) => setVehicleType(event.target.value as VehicleType)}
								disabled={busy || hydrating}
							>
								<option value="car">Car</option>
								<option value="motorbike">Motorbike</option>
							</select>
						</label>
					</div>

					<div className="field-row">
						<label className="field">
							<span>Session ID</span>
							<input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
						</label>
						<label className="field">
							<span>Scene Slot Override (optional)</span>
							<input
								value={slotId}
								onChange={(event) => setSlotId(event.target.value)}
								placeholder="Auto-select free slot"
							/>
						</label>
					</div>

					<div className="button-row">
						<button onClick={simulateEntry} disabled={busy || hydrating}>
							{busy ? (
								<>
									<span className="loading-spinner loading-spinner-inline" aria-hidden="true" />
									Running...
								</>
							) : (
								'Simulate Entry'
							)}
						</button>
						<button onClick={handleManualExit} disabled={busy || hydrating || parkedVehicles.length === 0}>
							{busy ? (
								<>
									<span className="loading-spinner loading-spinner-inline" aria-hidden="true" />
									Running...
								</>
							) : (
								'Simulate Exit'
							)}
						</button>
						<button onClick={reset} disabled={busy || hydrating}>
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

			{hydrating ? (
				<LoadingOverlay
					className="loading-overlay-fixed"
					title="Đang đồng bộ dữ liệu simulator"
					description="Hệ thống đang tải lại danh sách xe và slot trong vài giây."
				/>
			) : null}
		</section>
	);
};
