import { useEffect, useMemo, useState } from 'react';
import { EventFeed } from './event-feed';
import { StatusCard } from './status-card';
import { apiRequest } from '../lib/api';
import { useOperatorStore } from '../store/operator-store';
import type { FrontendRole } from '../lib/auth';
import type { ApiEnvelope, RealtimeEnvelope, SessionSummary } from '../types/contracts';

interface OperatorDashboardProps {
	token: string;
	onTokenChange: (value: string) => void;
	roleView: FrontendRole;
}

interface RfidVerifyResult {
	uid: string;
	observed_plate_number: string;
	expected_plate_number: string | null;
	is_match: boolean;
	decision: 'accepted' | 'rejected';
	reason?: string;
	rfid_card_found: boolean;
	rfid_card_active: boolean;
	rfid_card_id: string | null;
	vehicle_id: string | null;
}

interface VehicleStatePayload {
	checkpoint?: string;
	plateNumber?: string;
	state?: string;
}

interface RfidDecisionPayload {
	uid?: string;
	plateNumber?: string;
	expectedPlateNumber?: string;
	reason?: string;
	decision?: string;
}

const parseVehicleStatePayload = (event: RealtimeEnvelope | undefined): VehicleStatePayload => {
	const payload = (event?.payload ?? {}) as Record<string, unknown>;
	return {
		checkpoint: typeof payload.checkpoint === 'string' ? payload.checkpoint : undefined,
		plateNumber: typeof payload.plateNumber === 'string' ? payload.plateNumber : undefined,
		state: typeof payload.state === 'string' ? payload.state : undefined
	};
};

const parseRfidDecisionPayload = (event: RealtimeEnvelope | undefined): RfidDecisionPayload => {
	const payload = (event?.payload ?? {}) as Record<string, unknown>;
	return {
		uid: typeof payload.uid === 'string' ? payload.uid : undefined,
		plateNumber: typeof payload.plateNumber === 'string' ? payload.plateNumber : undefined,
		expectedPlateNumber:
			typeof payload.expectedPlateNumber === 'string' ? payload.expectedPlateNumber : undefined,
		reason: typeof payload.reason === 'string' ? payload.reason : undefined,
		decision: typeof payload.decision === 'string' ? payload.decision : undefined
	};
};

export const OperatorDashboard = ({
	token,
	onTokenChange,
	roleView
}: OperatorDashboardProps) => {
	const [uid, setUid] = useState('');
	const [plateNumber, setPlateNumber] = useState('');
	const [sessionId, setSessionId] = useState('');
	const [slotId, setSlotId] = useState('');
	const [message, setMessage] = useState('Ready');
	const [latestDetectedPlate, setLatestDetectedPlate] = useState('');
	const [lastVehicleEventId, setLastVehicleEventId] = useState('');
	const [verificationResult, setVerificationResult] = useState<RfidVerifyResult | null>(null);

	const connected = useOperatorStore((state) => state.connected);
	const events = useOperatorStore((state) => state.events);
	const sessions = useOperatorStore((state) => state.sessions);
	const entryGateState = useOperatorStore((state) => state.entryGateState);
	const exitGateState = useOperatorStore((state) => state.exitGateState);
	const error = useOperatorStore((state) => state.error);
	const upsertSession = useOperatorStore((state) => state.upsertSession);
	const isAdminView = roleView === 'admin';

	const latestRfidDecisionEvent = useMemo(
		() =>
			events.find(
				(event) => event.eventName === 'rfid.scan.accepted' || event.eventName === 'rfid.scan.rejected'
			),
		[events]
	);

	const latestRfidDecisionPayload = useMemo(
		() => parseRfidDecisionPayload(latestRfidDecisionEvent),
		[latestRfidDecisionEvent]
	);

	useEffect(() => {
		const latestVehicleStateEvent = events.find(
			(event) => event.eventName === 'vehicle.state.changed'
		);

		if (!latestVehicleStateEvent || latestVehicleStateEvent.eventId === lastVehicleEventId) {
			return;
		}

		setLastVehicleEventId(latestVehicleStateEvent.eventId);
		const payload = parseVehicleStatePayload(latestVehicleStateEvent);
		if (payload.checkpoint !== 'entry_rfid' || payload.state !== 'arrived' || !payload.plateNumber) {
			return;
		}

		setLatestDetectedPlate(payload.plateNumber);
		setPlateNumber(payload.plateNumber);
	}, [events, lastVehicleEventId]);

	const blockedSessions = useMemo(
		() => sessions.filter((item) => item.status === 'blocked').length,
		[sessions]
	);

	const parkedSessions = useMemo(
		() => sessions.filter((item) => item.status === 'parked').length,
		[sessions]
	);

	const run = async (task: () => Promise<void>) => {
		try {
			await task();
		} catch (taskError) {
			setMessage(taskError instanceof Error ? taskError.message : 'Action failed');
		}
	};

	const processEntry = async () => {
		if (!token) {
			setMessage('Token is required');
			return;
		}

		const observedPlateNumber = (plateNumber || latestDetectedPlate).trim().toUpperCase();
		if (!observedPlateNumber) {
			setMessage('Detected plate is required before processing entry');
			return;
		}

		await run(async () => {
			const res = await apiRequest<
				ApiEnvelope<{ session: SessionSummary; gate_action: 'open' | 'deny'; reason?: string }>
			>('/parking/sessions/entry', {
				method: 'POST',
				token,
				body: JSON.stringify({
					uid,
					plate_number: observedPlateNumber,
					plate_confidence: 95,
					correlation_id: crypto.randomUUID()
				})
			});

			upsertSession(res.data.session);
			setSessionId(res.data.session._id);
			setMessage(`${res.message} (${res.data.gate_action})`);
		});
	};

	const verifyRfid = async () => {
		if (!token) {
			setMessage('Token is required');
			return;
		}

		if (!uid) {
			setMessage('RFID UID is required');
			return;
		}

		const observedPlateNumber = (plateNumber || latestDetectedPlate).trim().toUpperCase();
		if (!observedPlateNumber) {
			setMessage('Observed plate is required');
			return;
		}

		await run(async () => {
			const res = await apiRequest<ApiEnvelope<RfidVerifyResult>>('/parking/sessions/rfid-verify', {
				method: 'POST',
				token,
				body: JSON.stringify({
					uid,
					observed_plate_number: observedPlateNumber,
					correlation_id: crypto.randomUUID()
				})
			});

			setVerificationResult(res.data);
			setMessage(
				`${res.message} (${res.data.decision}) expected: ${res.data.expected_plate_number || 'N/A'}`
			);
		});
	};

	const approveBlocked = async () => {
		if (!token || !sessionId) {
			setMessage('Token and session id are required');
			return;
		}

		await run(async () => {
			const res = await apiRequest<ApiEnvelope<SessionSummary>>(
				`/parking/sessions/${sessionId}/approve`,
				{
					method: 'POST',
					token,
					body: JSON.stringify({ correlation_id: crypto.randomUUID() })
				}
			);

			upsertSession(res.data);
			setMessage(res.message);
		});
	};

	const assignSlot = async () => {
		if (!token || !sessionId) {
			setMessage('Token and session id are required');
			return;
		}

		await run(async () => {
			const res = await apiRequest<
				ApiEnvelope<{ session: SessionSummary; slot: { slot_code: string } }>
			>(`/parking/sessions/${sessionId}/assign-slot`, {
				method: 'POST',
				token,
				body: JSON.stringify({
					slot_id: slotId || undefined,
					correlation_id: crypto.randomUUID()
				})
			});

			upsertSession(res.data.session);
			setMessage(`${res.message} (${res.data.slot.slot_code})`);
		});
	};

	const processExit = async () => {
		if (!token || !sessionId || !plateNumber) {
			setMessage('Token, session id, and exit plate number are required');
			return;
		}

		await run(async () => {
			const res = await apiRequest<
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
					payment_status: 'paid',
					correlation_id: crypto.randomUUID()
				})
			});

			upsertSession(res.data.session);
			setMessage(
				`${res.message} - ${res.data.transaction.final_amount} (${res.data.transaction.payment_status})`
			);
		});
	};

	return (
		<section className="app-shell">
			<header className="hero">
				<p className="eyebrow">Smart Parking Control</p>
				<h1>{isAdminView ? 'Admin Realtime Console' : 'Operator Realtime Console'}</h1>
				<p className="hero-sub">
					Realtime monitoring and role-based operations with RFID to plate verification.
				</p>
			</header>

			<section className="grid stats-grid">
				<StatusCard
					label="Socket"
					value={connected ? 'Connected' : 'Disconnected'}
					description={error || 'Room operator.join active'}
					tone={connected ? 'good' : 'warn'}
				/>
				<StatusCard label="Sessions" value={sessions.length} description="Loaded in memory" />
				<StatusCard
					label="Blocked"
					value={blockedSessions}
					description="Needs manual review"
					tone={blockedSessions > 0 ? 'danger' : 'neutral'}
				/>
				<StatusCard
					label="Parked"
					value={parkedSessions}
					description={`Entry ${entryGateState} · Exit ${exitGateState}`}
					tone="good"
				/>
				<StatusCard
					label="Live Plate @ RFID"
					value={latestDetectedPlate || '-'}
					description="From vehicle.state.changed (simulator)"
					tone={latestDetectedPlate ? 'good' : 'warn'}
				/>
			</section>

			<section className="grid form-grid">
				<section className="panel">
					<header className="panel-head">
						<h2>Authentication</h2>
						<p>Bearer token is required for REST and socket auth.</p>
					</header>
					<label className="field">
						<span>Access Token</span>
						<textarea
							value={token}
							onChange={(event) => onTokenChange(event.target.value)}
							placeholder="Paste JWT access token"
							rows={3}
						/>
					</label>
				</section>

				<section className="panel">
					<header className="panel-head">
						<h2>RFID Checkpoint</h2>
						<p>Show live plate from socket, verify with RFID in database, then process entry.</p>
					</header>
					<div className="field-row">
						<label className="field">
							<span>RFID UID</span>
							<input value={uid} onChange={(event) => setUid(event.target.value)} />
						</label>
						<label className="field">
							<span>Observed Plate Number</span>
							<input
								value={plateNumber}
								onChange={(event) => setPlateNumber(event.target.value)}
								placeholder={latestDetectedPlate || '59A12345'}
							/>
						</label>
					</div>
					<div className="button-row">
						<button onClick={verifyRfid}>Verify RFID</button>
						<button onClick={processEntry}>Process Entry</button>
					</div>
					<p className="event-meta">
						Latest socket decision: {latestRfidDecisionEvent?.eventName || '-'}
						 {latestRfidDecisionPayload.plateNumber
							? `(${latestRfidDecisionPayload.plateNumber} vs ${latestRfidDecisionPayload.expectedPlateNumber || 'N/A'})`
							: ''}
					</p>
					{verificationResult ? (
						<p className="event-meta">
							Verify result: {verificationResult.decision} | observed {verificationResult.observed_plate_number} | expected{' '}
							{verificationResult.expected_plate_number || 'N/A'} | reason {verificationResult.reason || '-'}
						</p>
					) : null}
				</section>

				{isAdminView ? (
					<section className="panel">
						<header className="panel-head">
							<h2>Admin Session Actions</h2>
							<p>Approve blocked sessions, assign slot, and process exit.</p>
						</header>
						<div className="field-row">
							<label className="field">
								<span>Session ID</span>
								<input
									value={sessionId}
									onChange={(event) => setSessionId(event.target.value)}
									placeholder="Mongo ObjectId"
								/>
							</label>
							<label className="field">
								<span>Slot ID (optional)</span>
								<input
									value={slotId}
									onChange={(event) => setSlotId(event.target.value)}
									placeholder="Mongo ObjectId"
								/>
							</label>
						</div>

						<div className="button-row">
							<button onClick={approveBlocked}>Approve Blocked</button>
							<button onClick={assignSlot}>Assign Slot</button>
							<button onClick={processExit}>Process Exit</button>
						</div>
					</section>
				) : (
					<section className="panel">
						<header className="panel-head">
							<h2>Operator Role</h2>
							<p>
								Operator view is focused on realtime RFID/plate verification and entry processing.
							</p>
						</header>
						<p className="event-meta">
							Use admin role to access blocked approval, slot assignment, and manual exit tools.
						</p>
					</section>
				)}
			</section>

			<section className="grid table-grid">
				<section className="panel">
					<header className="panel-head">
						<h2>Session Snapshot</h2>
						<p>{message}</p>
					</header>
					<div className="session-table-wrap">
						<table className="session-table">
							<thead>
								<tr>
									<th>Session</th>
									<th>Status</th>
									<th>Entry Plate</th>
									<th>Mismatch</th>
								</tr>
							</thead>
							<tbody>
								{sessions.slice(0, 12).map((item) => (
									<tr key={item._id}>
										<td>{item._id}</td>
										<td>{item.status}</td>
										<td>{item.entry_plate_text || '-'}</td>
										<td>{item.is_plate_mismatch ? 'Yes' : 'No'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<EventFeed events={events.slice(0, 40)} />
			</section>
		</section>
	);
};
