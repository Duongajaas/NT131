import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

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

interface ParkingScene3DProps {
	stage: SimulatorStage;
	activePlateNumber: string;
	activeSceneSlotId?: string;
	parkedVehicles?: Array<{
		localId: string;
		plateNumber: string;
		sceneSlotId: number;
	}>;
	entryGateOpen?: boolean;
	exitGateOpen?: boolean;
	onParkedCarClick?: (vehicleId: string) => void;
	onEntryBarrierPassed?: () => void;
	onExitBarrierPassed?: () => void;
}

type PathPoint = [number, number, number];

const CAR_DRIVE_Y = 0.1;
const SLOT_WIDTH = 1.9;
const SLOT_LENGTH = 3.4;
const CAR_BODY_HEIGHT = 1.2;
const ENTRY_LANE_Z = -3;
const EXIT_LANE_Z = 3;
const ENTRY_RFID_POINT: PathPoint = [1.5, CAR_DRIVE_Y, ENTRY_LANE_Z];
const EXIT_RFID_POINT: PathPoint = [-1.5, CAR_DRIVE_Y, EXIT_LANE_Z];
const ENTRY_BARRIER_X = -5;
const EXIT_BARRIER_X = 5;
const CAR_BODY_LENGTH = SLOT_LENGTH;
const BARRIER_PASS_Y_TOLERANCE = 0.3;
const BARRIER_PASS_Z_TOLERANCE = 0.2;
const ENTRY_BARRIER_POSITION: PathPoint = [ENTRY_BARRIER_X, 0.35, ENTRY_LANE_Z];
const EXIT_BARRIER_POSITION: PathPoint = [EXIT_BARRIER_X, 0.35, EXIT_LANE_Z];
const barrierPass = {
	entry: ENTRY_BARRIER_POSITION,
	exit: EXIT_BARRIER_POSITION
} as const;

const isSupportedDemoSlotId = (slotId: number): slotId is 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 =>
	slotId >= 1 && slotId <= 8;

const getSlotX = (slotId: number): number => {
	const slotColumn = (slotId - 1) % 4;
	return -7 - slotColumn * 3;
};

const getLaneZ = (slotId: number): 8 | 16 => (slotId <= 4 ? 8 : 16);
const getParkedZ = (slotId: number): 12 | 20 => (slotId <= 4 ? 12 : 20);

interface GeneratedPath {
	entryProcessing: PathPoint[];
	toSlot: PathPoint[];
	fromSlot: PathPoint[];
	parked: PathPoint;
}

const generatePath = (slotId: number): GeneratedPath => {
	const slotX = getSlotX(slotId);
	const laneZ = getLaneZ(slotId);
	const parkedZ = getParkedZ(slotId);

	const laneTurnPoint: PathPoint = [-20, CAR_DRIVE_Y, laneZ];
	const laneSlotPoint: PathPoint = [slotX, CAR_DRIVE_Y, laneZ];
	const parked: PathPoint = [slotX, CAR_DRIVE_Y, parkedZ];

	const entryProcessing: PathPoint[] =
		laneZ === 16
			? [ENTRY_RFID_POINT, [-20, CAR_DRIVE_Y, ENTRY_LANE_Z], [-20, CAR_DRIVE_Y, laneZ], laneTurnPoint]
			: [ENTRY_RFID_POINT, [-20, CAR_DRIVE_Y, ENTRY_LANE_Z], laneTurnPoint];

	const fromSlot: PathPoint[] =
		laneZ === 16
			? [laneSlotPoint, laneTurnPoint, [-20, CAR_DRIVE_Y, laneZ]]
			: [laneSlotPoint, laneTurnPoint];

	return {
		entryProcessing,
		toSlot: [laneTurnPoint, laneSlotPoint, parked],
		fromSlot,
		parked
	};
};

const createIdlePreviewPath = (slotId: number): PathPoint[] => {
	const slotX = getSlotX(slotId);
	const laneZ = getLaneZ(slotId);
	const parkedZ = getParkedZ(slotId);

	if (laneZ === 16) {
		return [
			[22, CAR_DRIVE_Y, ENTRY_LANE_Z],
			[0, CAR_DRIVE_Y, ENTRY_LANE_Z],
			ENTRY_RFID_POINT,
			[-20, CAR_DRIVE_Y, ENTRY_LANE_Z],
			[-20, CAR_DRIVE_Y, 22],
			[-20, CAR_DRIVE_Y, laneZ],
			[slotX, CAR_DRIVE_Y, laneZ],
			[slotX, CAR_DRIVE_Y, parkedZ]
		];
	}

	return [
		[22, CAR_DRIVE_Y, ENTRY_LANE_Z],
		[0, CAR_DRIVE_Y, ENTRY_LANE_Z],
		ENTRY_RFID_POINT,
		[-20, CAR_DRIVE_Y, ENTRY_LANE_Z],
		[-20, CAR_DRIVE_Y, laneZ],
		[slotX, CAR_DRIVE_Y, laneZ],
		[slotX, CAR_DRIVE_Y, parkedZ]
	];
};

const createCarWaypoints = (slotId: number): Record<SimulatorStage, PathPoint[]> => {
	const slotPath = generatePath(slotId);
	const idlePreviewPath = createIdlePreviewPath(slotId);

	return {
		idle: idlePreviewPath,
		approaching_entry: [
			[22, CAR_DRIVE_Y, ENTRY_LANE_Z],
			ENTRY_RFID_POINT
		],
		barrier_pass: [ENTRY_BARRIER_POSITION],
		waiting_rfid: [ENTRY_RFID_POINT],
		entry_processing: slotPath.entryProcessing,
		assigned_slot: slotPath.toSlot,
		parked: [slotPath.parked],
		approaching_exit: [
			slotPath.parked,
			...slotPath.fromSlot,
			[-20, CAR_DRIVE_Y, EXIT_LANE_Z],
			EXIT_RFID_POINT
		],
		exit_processing: [
			EXIT_RFID_POINT,
			[22, CAR_DRIVE_Y, EXIT_LANE_Z],
			[22, CAR_DRIVE_Y, 5]
		],
		completed: [[22, CAR_DRIVE_Y, 5], [22, CAR_DRIVE_Y, 7]]
	};
};

const SLOT_LAYOUT: Array<{ id: number; position: PathPoint }> = [
	{ id: 1, position: [-7, 0.02, 12] },
	{ id: 2, position: [-10, 0.02, 12] },
	{ id: 3, position: [-13, 0.02, 12] },
	{ id: 4, position: [-16, 0.02, 12] },
	{ id: 5, position: [-7, 0.02, 20] },
	{ id: 6, position: [-10, 0.02, 20] },
	{ id: 7, position: [-13, 0.02, 20] },
	{ id: 8, position: [-16, 0.02, 20] }
];

const MAIN_FLOW_GUIDES: PathPoint[][] = [
	// lối đi vào
	[
		[-20, 0.05, ENTRY_LANE_Z],
		[22, 0.05, ENTRY_LANE_Z]
	],
	// đường đi vào bãi
	[
		[-20, 0.05, ENTRY_LANE_Z],
		[-20, 0.05, 16]
	],
	[
		[-20, 0.05, 16],
		[-7, 0.05, 16]
	],
	// đi vào slot 8
	[
		[-16, 0.05, 16],
		[-16, 0.05, 20]
	],
	// đi vào slot 7
	[
		[-13, 0.05, 16],
		[-13, 0.05, 20]
	],
	// đi vào slot 6
	[
		[-10, 0.05, 16],
		[-10, 0.05, 20]
	],
	// đi vào slot 5
	[
		[-7, 0.05, 16],
		[-7, 0.05, 20]
	],
	// lối đi ra
	[
		[-20, 0.05, EXIT_LANE_Z],
		[22, 0.05, EXIT_LANE_Z]
	],
	[
		[-20, 0.05, 8],
		[-7, 0.05, 8]
	],
	// đi vào slot 4
	[
		[-16, 0.05, 8],
		[-16, 0.05, 12]
	],
	// đi vào slot 3
	[
		[-13, 0.05, 8],
		[-13, 0.05, 12]
	],
	// đi vào slot 2
	[
		[-10, 0.05, 8],
		[-10, 0.05, 12]
	],
	// đi vào slot 1
	[
		[-7, 0.05, 8],
		[-7, 0.05, 12]
	]
];

const stageBackgroundTone: Record<SimulatorStage, string> = {
	idle: '#0d1728',
	approaching_entry: '#23170b',
	waiting_rfid: '#2b240c',
	barrier_pass: '#2b240c',
	entry_processing: '#062238',
	assigned_slot: '#08281a',
	parked: '#071f17',
	approaching_exit: '#2a1408',
	exit_processing: '#1a1233',
	completed: '#082420'
};

const stageAccentTone: Record<SimulatorStage, { entry: string; exit: string; rim: string }> = {
	idle: { entry: '#22d3ee', exit: '#60a5fa', rim: '#a78bfa' },
	approaching_entry: { entry: '#f59e0b', exit: '#60a5fa', rim: '#f97316' },
	waiting_rfid: { entry: '#eab308', exit: '#60a5fa', rim: '#facc15' },
	barrier_pass: { entry: '#eab308', exit: '#60a5fa', rim: '#facc15' },
	entry_processing: { entry: '#38bdf8', exit: '#818cf8', rim: '#22d3ee' },
	assigned_slot: { entry: '#22c55e', exit: '#14b8a6', rim: '#4ade80' },
	parked: { entry: '#4ade80', exit: '#2dd4bf', rim: '#22c55e' },
	approaching_exit: { entry: '#fb923c', exit: '#f97316', rim: '#f59e0b' },
	exit_processing: { entry: '#818cf8', exit: '#c084fc', rim: '#a78bfa' },
	completed: { entry: '#2dd4bf', exit: '#34d399', rim: '#22d3ee' }
};

const RENDER_EXPOSURE = 0.9;
const ROAD_BASE_COLOR = '#1e293b';
const ROAD_SURFACE_COLOR = '#64748b';
const ROAD_SIDE_COLOR = '#475569';
const ROAD_EMISSIVE_COLOR = '#334155';
const ROAD_EMISSIVE_INTENSITY = 0.18;

function Road() {
	return (
		<>
			<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
				<planeGeometry args={[80, 80]} />
				<meshStandardMaterial color={ROAD_BASE_COLOR} />
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
				<planeGeometry args={[35.2, 2.6]} />
				<meshStandardMaterial
					color={ROAD_SURFACE_COLOR}
					emissive={ROAD_EMISSIVE_COLOR}
					emissiveIntensity={ROAD_EMISSIVE_INTENSITY}
				/>
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.4, 0.02, 0]}>
				<planeGeometry args={[1.2, 11.8]} />
				<meshStandardMaterial
					color={ROAD_SIDE_COLOR}
					emissive={ROAD_EMISSIVE_COLOR}
					emissiveIntensity={ROAD_EMISSIVE_INTENSITY * 0.75}
				/>
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.4, 0.02, 0]}>
				<planeGeometry args={[1.2, 11.8]} />
				<meshStandardMaterial
					color={ROAD_SIDE_COLOR}
					emissive={ROAD_EMISSIVE_COLOR}
					emissiveIntensity={ROAD_EMISSIVE_INTENSITY * 0.75}
				/>
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -4.1]}>
				<planeGeometry args={[11, 0.65]} />
				<meshStandardMaterial
					color={ROAD_SURFACE_COLOR}
					emissive={ROAD_EMISSIVE_COLOR}
					emissiveIntensity={ROAD_EMISSIVE_INTENSITY}
				/>
			</mesh>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 4.1]}>
				<planeGeometry args={[11, 0.65]} />
				<meshStandardMaterial
					color={ROAD_SURFACE_COLOR}
					emissive={ROAD_EMISSIVE_COLOR}
					emissiveIntensity={ROAD_EMISSIVE_INTENSITY}
				/>
			</mesh>
		</>
	);
}

function Gate({
	position,
	label,
	armRotationX = 0,
	gateType = 'entry'
}: {
	position: PathPoint;
	label: string;
	armRotationX?: number;
	gateType?: 'entry' | 'exit';
}) {
	const armLength = 3;
	const armDirection = gateType === 'entry' ? 1 : -1;

	return (
		<group position={position}>
			<mesh position={[0, 0.55, 0]} castShadow>
				<boxGeometry args={[0.32, 2.5, 0.32]} />
				<meshStandardMaterial color="#cbd5e1" />
			</mesh>
			<group position={[0.15, 1.8, 0]} rotation={[armRotationX, 0, 0]}>
				<mesh position={[0, 0, (armLength / 2) * armDirection]} castShadow>
					<boxGeometry args={[0.12, 0.12, armLength]} />
					<meshStandardMaterial color="#f8fafc" />
				</mesh>
			</group>
			<mesh position={[0, 0.16, 0]}>
				<boxGeometry args={[0.76, 0.18, 0.76]} />
				<meshStandardMaterial color="#334155" />
			</mesh>
			<Html position={[0, 1.55, 0]} center>
				<div className="gate-label">{label}</div>
			</Html>
		</group>
	);
}

function BarrierLine() {
	return (
		<>
			<mesh position={barrierPass.entry}>
				<boxGeometry args={[0.24, 0.08, 3.2]} />
				<meshStandardMaterial color="#fbbf24" />
			</mesh>
			<mesh position={barrierPass.exit}>
				<boxGeometry args={[0.24, 0.08, 3.2]} />
				<meshStandardMaterial color="#22c55e" />
			</mesh>
		</>
	);
}

function SlotConnectors({ occupiedSlotIds }: { occupiedSlotIds: Set<number> }) {
	return (
		<>
			{SLOT_LAYOUT.map((slot) => {
				const [slotX, , slotZ] = slot.position;
				const sourceX = slotX < 0 ? -6.2 : 6.2;
				const connectorWidth = Math.abs(slotX - sourceX);
				const connectorCenterX = (slotX + sourceX) / 2;
				const isOccupied = occupiedSlotIds.has(slot.id);

				return (
					<mesh key={`slot-connector-${slot.id}`} position={[connectorCenterX, 0.031, slotZ]} rotation={[-Math.PI / 2, 0, 0]}>
						<planeGeometry args={[connectorWidth, 0.45]} />
						<meshStandardMaterial color="#ffffff" opacity={isOccupied ? 0.55 : 0.9} transparent />
					</mesh>
				);
			})}
		</>
	);
}

function FlowGuideLines() {
	return (
		<>
			{MAIN_FLOW_GUIDES.flatMap((path, pathIndex) =>
				path.slice(0, -1).map((point, index) => {
					const next = path[index + 1];

					if (!next) {
						return null;
					}

					const dx = next[0] - point[0];
					const dz = next[2] - point[2];
					const segmentLength = Math.hypot(dx, dz);
					const centerX = (point[0] + next[0]) / 2;
					const centerZ = (point[2] + next[2]) / 2;
					const rotationY = Math.atan2(dx, dz);

					return (
						<mesh key={`main-flow-${pathIndex}-${index}`} position={[centerX, 0.055, centerZ]} rotation={[0, rotationY, 0]}>
							<boxGeometry args={[0.22, 0.02, segmentLength]} />
							<meshStandardMaterial color="#ffffff" emissive="#f8fafc" emissiveIntensity={0.06} />
						</mesh>
					);
				})
			)}
		</>
	);
}

function Booth({ position, title }: { position: PathPoint; title: string }) {
	return (
		<group position={position}>
			<mesh castShadow>
				<boxGeometry args={[2.8, 0.7, 1.8]} />
				<meshStandardMaterial color="#b45309" />
			</mesh>
			<mesh position={[0, 0.5, 0]} castShadow>
				<boxGeometry args={[1.4, 0.1, 0.9]} />
				<meshStandardMaterial color="#111827" />
			</mesh>
			<mesh position={[0, 0.8, 0.32]} castShadow>
				<boxGeometry args={[0.7, 0.45, 0.55]} />
				<meshStandardMaterial color="#e2e8f0" />
			</mesh>
			<Html position={[0, 1.42, 0]} center>
				<div className="gate-label">{title}</div>
			</Html>
		</group>
	);
}

function Slot({ position, occupied, index }: { position: PathPoint; occupied: boolean; index: number }) {
	return (
		<group position={position}>
			<mesh rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[SLOT_WIDTH, SLOT_LENGTH]} />
				<meshStandardMaterial color={occupied ? '#14532d' : '#1e293b'} />
			</mesh>
			<mesh position={[0, 0.02, 1.5]}>
				<boxGeometry args={[1.72, 0.04, 0.08]} />
				<meshStandardMaterial color="#d97706" />
			</mesh>
			<Html position={[0, 0.1, 0]} center>
				<div className="slot-label">Slot {index}</div>
			</Html>
		</group>
	);
}

function Car({
	waypoints,
	plateNumber,
	bodyColor = '#2563eb',
	loop = false,
	rotationY = 0,
	onClick,
	onPositionChange
}: {
	waypoints: PathPoint[];
	plateNumber: string;
	bodyColor?: string;
	loop?: boolean;
	rotationY?: number;
	onClick?: () => void;
	onPositionChange?: (position: THREE.Vector3) => void;
}) {
	const carRef = useRef<THREE.Group>(null);
	const plateTone = useMemo(() => '#64748b', []);
	const progressRef = useRef(0);
	const headingOffset = Math.PI / 2;
	const progressPerSecond = 0.12;
	const travelPointRef = useRef(new THREE.Vector3());

	const handleCarClick = (event: ThreeEvent<MouseEvent>) => {
		event.stopPropagation();
		onClick?.();
	};

	const segmentPath = useMemo(() => {
		if (waypoints.length < 2) {
			return null;
		}

		const segments = waypoints.slice(0, -1).map((point, index) => {
			const [startX, startY, startZ] = point;
			const [endX, endY, endZ] = waypoints[index + 1];
			const start = new THREE.Vector3(startX, startY, startZ);
			const end = new THREE.Vector3(endX, endY, endZ);
			const delta = new THREE.Vector3().subVectors(end, start);
			const length = delta.length();
			const tangent = length > 0 ? delta.clone().divideScalar(length) : new THREE.Vector3(0, 0, 1);

			return { start, end, length, tangent };
		});

		const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
		return { segments, totalLength };
	}, [waypoints]);

	useEffect(() => {
		progressRef.current = 0;
	}, [waypoints]);

	useFrame((_, delta) => {
		if (!carRef.current || waypoints.length === 0) {
			return;
		}

		if (waypoints.length === 1 || !segmentPath || segmentPath.totalLength === 0) {
			const [x, y, z] = waypoints[0];
			carRef.current.position.set(x, y, z);
			onPositionChange?.(carRef.current.position);
			return;
		}

		const nextProgress = progressRef.current + delta * progressPerSecond;
		progressRef.current = loop ? nextProgress % 1 : Math.min(nextProgress, 1);
		const travelDistance = progressRef.current * segmentPath.totalLength;

		let consumedDistance = 0;
		let activeSegment = segmentPath.segments[segmentPath.segments.length - 1];
		let segmentProgress = 1;

		for (const segment of segmentPath.segments) {
			if (consumedDistance + segment.length >= travelDistance) {
				activeSegment = segment;
				segmentProgress = segment.length === 0 ? 0 : (travelDistance - consumedDistance) / segment.length;
				break;
			}
			consumedDistance += segment.length;
		}

		travelPointRef.current.lerpVectors(activeSegment.start, activeSegment.end, segmentProgress);
		carRef.current.position.copy(travelPointRef.current);
		carRef.current.rotation.y = Math.atan2(activeSegment.tangent.x, activeSegment.tangent.z) + headingOffset;
		onPositionChange?.(carRef.current.position);
	});

	return (
		<group ref={carRef} position={waypoints[0]} rotation={[0, rotationY, 0]} castShadow onClick={handleCarClick}>
			<mesh position={[0, CAR_BODY_HEIGHT / 2, 0]} castShadow>
				<boxGeometry args={[SLOT_LENGTH, CAR_BODY_HEIGHT, SLOT_WIDTH]} />
				<meshStandardMaterial color={bodyColor} metalness={0.22} roughness={0.35} />
			</mesh>
			<Html position={[0, CAR_BODY_HEIGHT + 0.42, 0]} center>
				<div
					className="plate-tag"
					style={{ borderColor: plateTone, cursor: onClick ? 'pointer' : 'default' }}
					title={onClick ? 'Click to exit' : undefined}
				>
					{plateNumber}
				</div>
			</Html>
		</group>
	);
}

function ParkingScene3D({
	stage,
	activePlateNumber,
	activeSceneSlotId = '',
	parkedVehicles = [],
	entryGateOpen = false,
	exitGateOpen = false,
	onParkedCarClick,
	onEntryBarrierPassed,
	onExitBarrierPassed
}: ParkingScene3DProps) {
	const parsedActiveSceneSlotId = Number.parseInt(activeSceneSlotId, 10);
	const targetSlotId = isSupportedDemoSlotId(parsedActiveSceneSlotId) ? parsedActiveSceneSlotId : 8;
	const carWaypointsByStage = useMemo(() => createCarWaypoints(targetSlotId), [targetSlotId]);
	const sceneShellRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const shouldLoopCar = false;
	const carWaypoints = carWaypointsByStage[stage] ?? carWaypointsByStage.approaching_entry;
	const hasReportedEntryBarrierPassRef = useRef(false);
	const hasReportedExitBarrierPassRef = useRef(false);
	const previousCarPositionRef = useRef<THREE.Vector3 | null>(null);

	const stageColor = stageBackgroundTone[stage];
	const stageAccent = stageAccentTone[stage];
	const occupiedSlotIds = useMemo(() => {
		return new Set<number>(parkedVehicles.map((vehicle) => vehicle.sceneSlotId));
	}, [parkedVehicles]);

	const gateOpenAngle = Math.PI / 2.8;
	const entryArmRotationX = entryGateOpen ? -gateOpenAngle : 0;
	const exitArmRotationX = exitGateOpen ? gateOpenAngle : 0;

	useEffect(() => {
		if (!entryGateOpen) {
			hasReportedEntryBarrierPassRef.current = false;
		}
	}, [entryGateOpen]);

	useEffect(() => {
		if (!exitGateOpen) {
			hasReportedExitBarrierPassRef.current = false;
		}
	}, [exitGateOpen]);

	useEffect(() => {
		previousCarPositionRef.current = null;
	}, [carWaypoints]);

	const handleCarPositionChange = (position: THREE.Vector3) => {
		const previousPosition = previousCarPositionRef.current;
		const currentPosition = position.clone();

		if (previousPosition) {
			const entryBarrierPosition = barrierPass.entry;
			const previousEntryEdgeX = previousPosition.x + CAR_BODY_LENGTH / 2;
			const currentEntryEdgeX = currentPosition.x + CAR_BODY_LENGTH / 2;
			const isEntryAlignedToBarrier =
				Math.abs(currentPosition.y - entryBarrierPosition[1]) <= BARRIER_PASS_Y_TOLERANCE &&
				Math.abs(currentPosition.z - entryBarrierPosition[2]) <= BARRIER_PASS_Z_TOLERANCE;

			if (
				entryGateOpen &&
				!hasReportedEntryBarrierPassRef.current &&
				isEntryAlignedToBarrier &&
				previousEntryEdgeX > entryBarrierPosition[0] &&
				currentEntryEdgeX <= entryBarrierPosition[0]
			) {
				hasReportedEntryBarrierPassRef.current = true;
				onEntryBarrierPassed?.();
			}

			const exitBarrierPosition = barrierPass.exit;
			const previousExitEdgeX = previousPosition.x - CAR_BODY_LENGTH / 2;
			const currentExitEdgeX = currentPosition.x - CAR_BODY_LENGTH / 2;
			const isExitAlignedToBarrier =
				Math.abs(currentPosition.y - exitBarrierPosition[1]) <= BARRIER_PASS_Y_TOLERANCE &&
				Math.abs(currentPosition.z - exitBarrierPosition[2]) <= BARRIER_PASS_Z_TOLERANCE;

			if (
				exitGateOpen &&
				!hasReportedExitBarrierPassRef.current &&
				isExitAlignedToBarrier &&
				previousExitEdgeX < exitBarrierPosition[0] &&
				currentExitEdgeX >= exitBarrierPosition[0]
			) {
				hasReportedExitBarrierPassRef.current = true;
				onExitBarrierPassed?.();
			}
		}

		previousCarPositionRef.current = currentPosition;
	};

	useEffect(() => {
		const onFullscreenChange = () => {
			setIsFullscreen(document.fullscreenElement === sceneShellRef.current);
		};

		document.addEventListener('fullscreenchange', onFullscreenChange);
		return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
	}, []);

	const toggleFullscreen = async () => {
		try {
			if (!sceneShellRef.current) {
				return;
			}

			if (document.fullscreenElement === sceneShellRef.current) {
				await document.exitFullscreen();
				return;
			}

			await sceneShellRef.current.requestFullscreen();
		} catch {
			// Ignore fullscreen failures triggered by browser restrictions.
		}
	};

	return (
		<div ref={sceneShellRef} className={`scene-shell ${isFullscreen ? 'scene-shell-fullscreen' : ''}`}>
			<div className="scene-header">
				<div>
					<p className="status-label">WebGL 3D scene</p>
					<p className="scene-stage">{stage.replaceAll('_', ' ')}</p>
				</div>
				<div className="scene-actions">
					<button type="button" className="scene-action-btn scene-action-wide" onClick={toggleFullscreen}>
						{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
					</button>
				</div>
			</div>
			<Canvas
				className="parking-canvas"
				shadows
				dpr={[1, 1.5]}
				camera={{ position: [0, 28, 16], fov: 44 }}
				gl={{
					antialias: true,
					toneMapping: THREE.ACESFilmicToneMapping,
					toneMappingExposure: RENDER_EXPOSURE,
					outputColorSpace: THREE.SRGBColorSpace
				}}
			>
				<color attach="background" args={[stageColor]} />
				<fog attach="fog" args={[stageColor, 34, 96]} />
				<ambientLight intensity={0.24} color="#dbe7ff" />
				<hemisphereLight args={['#a7d8ff', '#0b1220', 0.34]} />
				<directionalLight
					position={[12, 24, 10]}
					color="#f4f7ff"
					intensity={1.25}
					castShadow
					shadow-mapSize-width={1024}
					shadow-mapSize-height={1024}
					shadow-bias={-0.00008}
				/>
				<spotLight
					position={[-8, 17, 8]}
					color={stageAccent.rim}
					intensity={0.45}
					angle={0.4}
					penumbra={0.55}
					castShadow
				/>
				<pointLight position={[-2, 4.2, ENTRY_LANE_Z]} color={stageAccent.entry} intensity={0.95} distance={14} decay={2.2} />
				<pointLight position={[-2, 4.2, EXIT_LANE_Z]} color={stageAccent.exit} intensity={0.95} distance={14} decay={2.2} />
				<pointLight position={[-16, 8, 14]} color={stageAccent.rim} intensity={0.55} distance={20} decay={2.2} />
				<pointLight position={[8, 7, -4]} color="#f8fafc" intensity={0.35} distance={38} decay={2} />
				<group position={[-1, 0, 0]}>
					<Road />
					<Gate position={[-3.4, 0, -4.1]} label="Cổng vào" gateType="entry" armRotationX={entryArmRotationX} />
					<Gate position={[3.4, 0, 4.1]} label="Cổng ra" gateType="exit" armRotationX={exitArmRotationX} />
					<Booth position={[-0.7, 0, -0.1]} title="Checkpoint booth" />
					<BarrierLine />
					<FlowGuideLines />
					<SlotConnectors occupiedSlotIds={occupiedSlotIds} />
					{SLOT_LAYOUT.map((slot) => (
						<Slot key={`slot-${slot.id}`} position={slot.position} occupied={occupiedSlotIds.has(slot.id)} index={slot.id} />
					))}
					{parkedVehicles.map((vehicle) => {
						const slot = SLOT_LAYOUT.find((slotItem) => slotItem.id === vehicle.sceneSlotId);
						if (!slot) {
							return null;
						}

						return (
							<Car
								key={`parked-${vehicle.localId}`}
								waypoints={[slot.position]}
								plateNumber={vehicle.plateNumber}
								bodyColor="#16a34a"
								loop={false}
								rotationY={-Math.PI / 2}
								onClick={() => onParkedCarClick?.(vehicle.localId)}
							/>
						);
					})}
					{activePlateNumber ? (
						<Car
							waypoints={carWaypoints}
							plateNumber={activePlateNumber}
							loop={shouldLoopCar}
							onPositionChange={handleCarPositionChange}
						/>
					) : null}
					<Html position={[1.5, 0.35, ENTRY_LANE_Z]} center>
						<div className="scene-lane-label">RFID check-in</div>
					</Html>
					<Html position={[-1.5, 0.35, EXIT_LANE_Z]} center>
						<div className="scene-lane-label">RFID check-out</div>
					</Html>
				</group>
				<OrbitControls
					enableZoom
					enablePan={false}
					target={[-1, 0, 0]}
					minDistance={20}
					maxDistance={52}
					minPolarAngle={Math.PI / 5}
					maxPolarAngle={Math.PI / 2.05}
				/>
			</Canvas>
		</div>
	);
}

export default ParkingScene3D;
