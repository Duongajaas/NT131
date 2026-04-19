import { useEffect, useMemo, useState } from 'react';
import { EventFeed } from './event-feed';
import {
	completeParkingExit,
	createParkingEntry,
	listParkingSlots,
	type VerifyRfidResult,
	verifyRfidPlate
} from '../api/parking.api';
import { createRfidCard, listRfidCards } from '../api/rfid-card.api';
import { getResidentById } from '../api/resident.api';
import { createVehicle, getVehicleById, listVehicles } from '../api/vehicle.api';
import { getSocket, requestManualGateCommand } from '../lib/socket';
import { notifyError, notifyInfo, notifySuccess } from '../lib/toast';
import { useOperatorStore } from '../store/operator-store';
import type {
	ParkingSlotRecord,
	RealtimeEnvelope,
	ResidentRecord,
	RfidCardRecord,
	VehicleRecord
} from '../types/contracts';

interface OperatorDashboardProps {
	token: string;
}

type OwnerType = 'resident' | 'guest' | 'unknown';

interface OwnershipLookupResult {
	ownerType: OwnerType;
	message: string;
	card?: RfidCardRecord;
	vehicle?: VehicleRecord;
	resident?: ResidentRecord;
}

interface VehicleStatePayload {
	checkpoint?: string;
	plateNumber?: string;
	state?: string;
}

const normalizeText = (value: string) => value.trim().toUpperCase();

const parseVehicleStatePayload = (event: RealtimeEnvelope | undefined): VehicleStatePayload => {
	const payload = (event?.payload ?? {}) as Record<string, unknown>;
	return {
		checkpoint: typeof payload.checkpoint === 'string' ? payload.checkpoint : undefined,
		plateNumber: typeof payload.plateNumber === 'string' ? payload.plateNumber : undefined,
		state: typeof payload.state === 'string' ? payload.state : undefined
	};
};

export const OperatorDashboard = ({ token }: OperatorDashboardProps) => {
	const [uid, setUid] = useState('');
	const [observedPlate, setObservedPlate] = useState('');
	const [verificationResult, setVerificationResult] = useState<VerifyRfidResult | null>(null);

	const [lookupUid, setLookupUid] = useState('');
	const [lookupBusy, setLookupBusy] = useState(false);
	const [lookupResult, setLookupResult] = useState<OwnershipLookupResult | null>(null);

	const [guestUid, setGuestUid] = useState('');
	const [guestPlate, setGuestPlate] = useState('');
	const [guestVehicleType, setGuestVehicleType] = useState<'motorbike' | 'car'>('car');
	const [guestBusy, setGuestBusy] = useState(false);

	const [paymentSessionId, setPaymentSessionId] = useState('');
	const [paymentExitPlate, setPaymentExitPlate] = useState('');
	const [amountReceived, setAmountReceived] = useState('0');
	const [paymentBusy, setPaymentBusy] = useState(false);
	const [slotBusy, setSlotBusy] = useState(false);
	const [manualGateBusy, setManualGateBusy] = useState(false);
	const [slotRows, setSlotRows] = useState<ParkingSlotRecord[]>([]);
	const [lastPayment, setLastPayment] = useState<
		| {
			due: number;
			received: number;
			change: number;
			status: string;
		  }
		| undefined
	>();

	const events = useOperatorStore((state) => state.events);
	const sessions = useOperatorStore((state) => state.sessions);
	const entryGateState = useOperatorStore((state) => state.entryGateState);
	const exitGateState = useOperatorStore((state) => state.exitGateState);
	const upsertSession = useOperatorStore((state) => state.upsertSession);

	const latestEntryVehicleEvent = useMemo(
		() =>
			events.find((event) => {
				if (event.eventName !== 'vehicle.state.changed') {
					return false;
				}

				const payload = parseVehicleStatePayload(event);
				return payload.checkpoint === 'entry_rfid' && payload.state === 'arrived' && Boolean(payload.plateNumber);
			}),
		[events]
	);
	const latestExitVehicleEvent = useMemo(
		() =>
			events.find((event) => {
				if (event.eventName !== 'vehicle.state.changed') {
					return false;
				}

				const payload = parseVehicleStatePayload(event);
				return payload.checkpoint === 'exit_rfid' && payload.state === 'leaving' && Boolean(payload.plateNumber);
			}),
		[events]
	);
	const latestDetectedPlate = latestEntryVehicleEvent
		? parseVehicleStatePayload(latestEntryVehicleEvent).plateNumber || ''
		: '';
	const latestExitDetectedPlate = latestExitVehicleEvent
		? parseVehicleStatePayload(latestExitVehicleEvent).plateNumber || ''
		: '';
	const latestEntryCorrelationId = latestEntryVehicleEvent?.correlationId;

	const [lastSlotEventId, setLastSlotEventId] = useState('');
	const occupiedSlots = useMemo(
		() => slotRows.filter((slot) => slot.is_occupied),
		[slotRows]
	);
	const emptySlots = useMemo(
		() => slotRows.filter((slot) => !slot.is_occupied),
		[slotRows]
	);

	const loadParkingSlots = async () => {
		setSlotBusy(true);
		try {
			const slots = await listParkingSlots({ token });
			setSlotRows(slots);
		} catch (slotError) {
			notifyError(slotError instanceof Error ? slotError.message : 'Không thể tải danh sách slot');
		} finally {
			setSlotBusy(false);
		}
	};

	useEffect(() => {
		if (!token) {
			setSlotRows([]);
			return;
		}

		void loadParkingSlots();
	}, [token]);

	useEffect(() => {
		const latestSlotEvent = events.find(
			(event) => event.eventName === 'slot.assigned' || event.eventName === 'slot.released'
		);

		if (!latestSlotEvent || latestSlotEvent.eventId === lastSlotEventId) {
			return;
		}

		setLastSlotEventId(latestSlotEvent.eventId);
		void loadParkingSlots();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [events, lastSlotEventId]);

	useEffect(() => {
		if (!latestDetectedPlate || observedPlate) {
			return;
		}

		setObservedPlate(latestDetectedPlate);
	}, [latestDetectedPlate, observedPlate]);

	const runAction = async (task: () => Promise<void>) => {
		try {
			await task();
		} catch (taskError) {
			notifyError(taskError instanceof Error ? taskError.message : 'Thao tác thất bại');
		}
	};

	const processEntry = async (correlationId?: string) => {
		if (!uid || !observedPlate) {
			notifyError('Cần nhập UID và biển số để tạo phiên vào bãi');
			return null;
		}

		const response = await createParkingEntry(
			{
				uid,
				plate_number: normalizeText(observedPlate),
				plate_confidence: 95,
				correlation_id: correlationId || latestEntryCorrelationId || crypto.randomUUID()
			},
			{ token }
		);

		upsertSession(response.session);
		setPaymentSessionId(response.session._id);
		void loadParkingSlots();
		notifySuccess(`Đã tạo phiên: ${response.gate_action.toUpperCase()} (${response.session._id})`);
		return response;
	};

	const handleManualGateCommand = async (
		gateId: 'entry-gate' | 'exit-gate',
		command: 'open' | 'close'
	) => {
		const socket = getSocket();
		if (!socket || !socket.connected) {
			notifyError('Socket chưa sẵn sàng để điều khiển cổng');
			return;
		}

		setManualGateBusy(true);
		try {
			const response = await requestManualGateCommand(socket, {
				gateId,
				command,
				correlationId: crypto.randomUUID()
			});

			notifySuccess(`Đã gửi lệnh ${command} cho ${gateId} (${response.state || 'không rõ trạng thái'})`);
		} catch (error) {
			notifyError(error instanceof Error ? error.message : 'Điều khiển cổng thất bại');
		} finally {
			setManualGateBusy(false);
		}
	};

	const handleVerifyRfid = async () => {
		if (!uid || !observedPlate) {
			notifyError('Cần nhập UID và biển số quan sát để kiểm tra RFID');
			return;
		}

		await runAction(async () => {
			const correlationId = latestEntryCorrelationId || crypto.randomUUID();
			const result = await verifyRfidPlate(
				{
					uid,
					observed_plate_number: normalizeText(observedPlate),
					correlation_id: correlationId
				},
				{ token }
			);

			setVerificationResult(result);
			if (result.decision === 'accepted') {
				notifySuccess(
					`Kiểm tra RFID: ${result.decision.toUpperCase()} - expected ${result.expected_plate_number || 'N/A'}`
				);
				await processEntry(correlationId);
				return;
			}

			notifyError(
				`Kiểm tra RFID: ${result.decision.toUpperCase()} - expected ${result.expected_plate_number || 'N/A'}`
			);
		});
	};

	const handleProcessEntry = async () => {
		await runAction(async () => {
			await processEntry();
		});
	};

	const lookupCardOwnership = async () => {
		const normalizedUid = normalizeText(lookupUid);
		if (!normalizedUid) {
			notifyError('Nhập UID cần tra cứu');
			return;
		}

		setLookupBusy(true);
		setLookupResult(null);

		try {
			const cards = await listRfidCards({ token }, { search: normalizedUid });
			const card = cards.find((item) => normalizeText(item.uid) === normalizedUid);

			if (!card) {
				setLookupResult({
					ownerType: 'unknown',
					message: 'UID chưa có trong hệ thống. Có thể cấp thẻ khách vãng lai.'
				});
				notifyInfo('UID chưa có trong hệ thống. Có thể cấp thẻ khách vãng lai.');
				return;
			}

			const vehicle = await getVehicleById(card.vehicle_id, { token });
			if (card.card_type === 'guest' || !vehicle.resident_id) {
				setLookupResult({
					ownerType: 'guest',
					message: 'Thẻ thuộc nhóm khách vãng lai',
					card,
					vehicle
				});
				notifySuccess('Thẻ thuộc nhóm khách vãng lai');
				return;
			}

			const resident = await getResidentById(vehicle.resident_id, { token });
			setLookupResult({
				ownerType: 'resident',
				message: 'Thẻ thuộc cư dân',
				card,
				vehicle,
				resident
			});
			notifySuccess('Thẻ thuộc cư dân');
		} catch (lookupError) {
			notifyError(lookupError instanceof Error ? lookupError.message : 'Tra cứu RFID thất bại');
		} finally {
			setLookupBusy(false);
		}
	};

	const issueGuestCard = async () => {
		if (!guestUid || !guestPlate) {
			notifyError('Nhập UID và biển số để cấp thẻ khách');
			return;
		}

		setGuestBusy(true);
		try {
			const normalizedGuestPlate = normalizeText(guestPlate);
			const existingVehicles = await listVehicles({ token }, { search: normalizedGuestPlate });
			const existingVehicle = existingVehicles.find(
				(item) => normalizeText(item.plate_number) === normalizedGuestPlate
			);
			const vehicle =
				existingVehicle ??
				(await createVehicle(
					{
						vehicle_type: guestVehicleType,
						plate_number: normalizedGuestPlate
					},
					{ token }
				));

			const card = await createRfidCard(
				{
					uid: normalizeText(guestUid),
					vehicle_id: vehicle._id,
					card_type: 'guest',
					is_active: true
				},
				{ token }
			);

			setLookupResult({
				ownerType: 'guest',
				message: 'Đã cấp thẻ khách vãng lai thành công',
				card,
				vehicle
			});
			setUid(card.uid);
			setObservedPlate(vehicle.plate_number);
			notifySuccess(`Đã cấp thẻ khách UID ${card.uid} cho xe ${vehicle.plate_number}`);
			await processEntry(latestEntryCorrelationId || undefined);
		} catch (issueError) {
			notifyError(issueError instanceof Error ? issueError.message : 'Cấp thẻ khách thất bại');
		} finally {
			setGuestBusy(false);
		}
	};

	const collectGuestPayment = async () => {
		if (!paymentSessionId || !paymentExitPlate) {
			notifyError('Nhập session id và biển số khi ra để thu phí');
			return;
		}

		setPaymentBusy(true);
		try {
			const response = await completeParkingExit(
				paymentSessionId,
				{
					exit_plate_number: normalizeText(paymentExitPlate),
					payment_status: 'paid',
					correlation_id: crypto.randomUUID()
				},
				{ token }
			);

			upsertSession(response.session);

			const due = response.transaction.final_amount;
			const received = Number(amountReceived);
			const change = Number.isFinite(received) ? received - due : -due;
			setLastPayment({
				due,
				received: Number.isFinite(received) ? received : 0,
				change,
				status: response.transaction.payment_status
			});

			notifySuccess(`Đã thu phí vãng lai: ${due.toLocaleString('vi-VN')} VND`);
			void loadParkingSlots();
		} catch (paymentError) {
			notifyError(paymentError instanceof Error ? paymentError.message : 'Thu phí thất bại');
		} finally {
			setPaymentBusy(false);
		}
	};

	return (
		<section className="page-grid">
			<section className="panel barrier-panel">
				<header className="panel-head">
					<h2>Điều khiển thanh chắn</h2>
					<p>4 nút mở/đóng cho cổng vào và cổng ra.</p>
				</header>
				<div className="barrier-control-grid">
					<button
						type="button"
						className="btn barrier-control-button barrier-control-open"
						onClick={() => void handleManualGateCommand('entry-gate', 'open')}
						disabled={manualGateBusy}
					>
						Mở cổng vào
					</button>
					<button
						type="button"
						className="btn barrier-control-button barrier-control-close"
						onClick={() => void handleManualGateCommand('entry-gate', 'close')}
						disabled={manualGateBusy}
					>
						Đóng cổng vào
					</button>
					<button
						type="button"
						className="btn barrier-control-button barrier-control-open"
						onClick={() => void handleManualGateCommand('exit-gate', 'open')}
						disabled={manualGateBusy}
					>
						Mở cổng ra
					</button>
					<button
						type="button"
						className="btn barrier-control-button barrier-control-close"
						onClick={() => void handleManualGateCommand('exit-gate', 'close')}
						disabled={manualGateBusy}
					>
						Đóng cổng ra
					</button>
				</div>
				<p className="barrier-control-state">
					Entry gate: {entryGateState} · Exit gate: {exitGateState}
				</p>
				<p className="event-meta">
					{manualGateBusy ? 'Đang gửi lệnh thanh chắn...' : 'Sẵn sàng điều khiển thanh chắn.'}
				</p>
			</section>

			<section className="grid operator-workspace-grid">
				<section className="panel operator-check-panel">
					<header className="panel-head">
						<h2>Chức năng vận hành cổng</h2>
						<p>Kiểm tra RFID, xử lý khách vãng lai, thu phí và thao tác phiên vào/ra.</p>
					</header>

					<div className="split-field-grid">
						<label className="field">
							<span>Biển số realtime từ simulator</span>
							<input value={latestDetectedPlate} readOnly placeholder="Đợi simulator gửi checkpoint" />
						</label>
						<label className="field">
							<span>UID RFID</span>
							<input value={uid} onChange={(event) => setUid(event.target.value)} />
						</label>
					</div>

					<label className="field">
						<span>Biển số quan sát để kiểm tra</span>
						<input
							value={observedPlate}
							onChange={(event) => setObservedPlate(event.target.value)}
							placeholder={latestDetectedPlate || '59A12345'}
						/>
					</label>

					<div className="button-row">
						<button type="button" className="btn btn-secondary" onClick={() => setObservedPlate(latestDetectedPlate)}>
							Lấy biển số realtime
						</button>
						<button type="button" className="btn" onClick={handleVerifyRfid}>
							Kiểm tra RFID
						</button>
						<button type="button" className="btn" onClick={handleProcessEntry}>
							Tạo phiên vào bãi
						</button>
					</div>

					{verificationResult ? (
						<div
							className={`detail-box verification-result detail-box-${
								verificationResult.decision === 'accepted' ? 'good' : 'danger'
							}`}
						>
							<p>
								Kết quả: <strong>{verificationResult.decision.toUpperCase()}</strong>
							</p>
							<p>Observed: {verificationResult.observed_plate_number}</p>
							<p>Expected: {verificationResult.expected_plate_number || 'N/A'}</p>
							<p>Lý do: {verificationResult.reason || '-'}</p>
						</div>
					) : null}

					<hr className="section-divider" />

					<h3 className="section-title">Kiểm tra RFID cư dân/khách</h3>

					<div className="split-field-grid">
						<label className="field">
							<span>UID cần tra cứu</span>
							<input value={lookupUid} onChange={(event) => setLookupUid(event.target.value)} />
						</label>
						<div className="field">
							<span>&nbsp;</span>
							<button type="button" className="btn" onClick={lookupCardOwnership} disabled={lookupBusy}>
								{lookupBusy ? 'Đang tra cứu...' : 'Tra cứu chủ thẻ'}
							</button>
						</div>
					</div>

					{lookupResult ? (
						<div className="detail-box">
							<p>
								Loại chủ thẻ: <strong>{lookupResult.ownerType.toUpperCase()}</strong>
							</p>
							<p>{lookupResult.message}</p>
							<p>UID: {lookupResult.card?.uid || '-'}</p>
							<p>Biển số: {lookupResult.vehicle?.plate_number || '-'}</p>
							<p>Cư dân: {lookupResult.resident?.full_name || '-'}</p>
							<p>Căn hộ: {lookupResult.resident?.apartment_no || '-'}</p>
						</div>
					) : null}

					<hr className="section-divider" />

					<h3 className="section-title">Cấp thẻ khách vãng lai</h3>
					<div className="split-field-grid">
						<label className="field">
							<span>UID khách</span>
							<input value={guestUid} onChange={(event) => setGuestUid(event.target.value)} />
						</label>
						<label className="field">
							<span>Biển số khách</span>
							<input value={guestPlate} onChange={(event) => setGuestPlate(event.target.value)} />
						</label>
					</div>
					<div className="split-field-grid">
						<label className="field">
							<span>Loại xe</span>
							<select
								value={guestVehicleType}
								onChange={(event) =>
									setGuestVehicleType(event.target.value as 'motorbike' | 'car')
								}
							>
								<option value="car">Ô tô</option>
								<option value="motorbike">Xe máy</option>
							</select>
						</label>
						<div className="field">
							<span>&nbsp;</span>
							<button type="button" className="btn" onClick={issueGuestCard} disabled={guestBusy}>
								{guestBusy ? 'Đang cấp thẻ...' : 'Cấp thẻ khách'}
							</button>
						</div>
					</div>

					<hr className="section-divider" />

					<h3 className="section-title">Thu phí khách vãng lai</h3>
					<div className="split-field-grid">
						<label className="field">
							<span>Session ID</span>
							<input value={paymentSessionId} onChange={(event) => setPaymentSessionId(event.target.value)} />
						</label>
						<label className="field">
							<span>Biển số khi ra</span>
							<input value={paymentExitPlate} onChange={(event) => setPaymentExitPlate(event.target.value)} />
						</label>
					</div>
					<div className="split-field-grid">
						<label className="field">
							<span>Số tiền khách đưa (VND)</span>
							<input
								type="number"
								min={0}
								value={amountReceived}
								onChange={(event) => setAmountReceived(event.target.value)}
							/>
						</label>
						<div className="field">
							<span>&nbsp;</span>
							<button type="button" className="btn" onClick={collectGuestPayment} disabled={paymentBusy}>
								{paymentBusy ? 'Đang thu phí...' : 'Hoàn tất thu phí'}
							</button>
						</div>
					</div>
					{lastPayment ? (
						<div className="detail-box">
							<p>Phí phải thu: {lastPayment.due.toLocaleString('vi-VN')} VND</p>
							<p>Khách đưa: {lastPayment.received.toLocaleString('vi-VN')} VND</p>
							<p>Tiền thừa: {lastPayment.change.toLocaleString('vi-VN')} VND</p>
							<p>Payment status: {lastPayment.status}</p>
						</div>
					) : null}
				</section>

				<section className="panel operator-plate-panel">
					<header className="panel-head">
						<h2>Hình ảnh biển số xe</h2>
						<p>Nửa màn hình bên phải hiển thị vùng ảnh biển số từ dữ liệu realtime.</p>
					</header>

					<div className="plate-preview-stage plate-preview-grid">
						<div className="plate-preview-frame">
							<p className="plate-preview-head">CAMERA ENTRY</p>
							<div className="plate-preview-center">
								<div className="plate-visual-number">
									{observedPlate || latestDetectedPlate || 'CHUA NHAN DIEN'}
								</div>
							</div>
							<p className="plate-preview-meta">
								Detected: {latestDetectedPlate || '-'} | Observed: {observedPlate || '-'}
							</p>
						</div>
						<div className="plate-preview-frame plate-preview-exit">
							<p className="plate-preview-head">CAMERA EXIT</p>
							<div className="plate-preview-center">
								<div className="plate-visual-number plate-visual-number-exit">
									{latestExitDetectedPlate || 'CHUA CO XE RA'}
								</div>
							</div>
							<p className="plate-preview-meta">Detected: {latestExitDetectedPlate || '-'}</p>
							<div className="button-row">
								<button
									type="button"
									className="btn btn-secondary"
									onClick={() => setPaymentExitPlate(latestExitDetectedPlate)}
									disabled={!latestExitDetectedPlate}
								>
									Lấy biển số exit
								</button>
							</div>
						</div>
					</div>
				</section>
			</section>

			<section className="panel operator-slots-panel">
				<header className="panel-head">
					<h2>Bản đồ slot đỗ xe</h2>
					<p>Slot xanh là đã có xe đỗ, slot đỏ là còn trống. Dữ liệu đồng bộ từ backend realtime.</p>
				</header>
				<div className="slot-toolbar">
					<div className="slot-legend">
						<span className="slot-summary-chip slot-summary-chip-occupied">Đã đỗ: {occupiedSlots.length}</span>
						<span className="slot-summary-chip slot-summary-chip-empty">Trống: {emptySlots.length}</span>
						<span className="slot-summary-chip slot-summary-chip-total">Tổng: {slotRows.length}</span>
					</div>
					<div className="button-row">
						<button
							type="button"
							className="btn btn-secondary"
							onClick={() => void loadParkingSlots()}
							disabled={slotBusy}
						>
							{slotBusy ? 'Đang tải slot...' : 'Làm mới bản đồ slot'}
						</button>
					</div>
				</div>
				<div className="slot-grid">
					{slotRows.length === 0 ? (
						<p className="empty">Chưa tải được dữ liệu slot từ hệ thống.</p>
					) : (
						slotRows.map((slot) => {
							const occupied = slot.is_occupied;
							return (
								<article
									key={slot._id}
									className={`slot-card ${occupied ? 'slot-card-occupied' : 'slot-card-empty'}`}
								>
									<div className="slot-card-top">
										<p className="slot-card-code">{slot.slot_code}</p>
										<span className="slot-card-status">{occupied ? 'ĐÃ ĐỖ' : 'TRỐNG'}</span>
									</div>
									<p className="slot-card-meta">Tầng {slot.level} · {slot.slot_type}</p>
									<p className="slot-card-submeta">
										{occupied ? 'Có xe đang đỗ trong slot này' : 'Slot chưa có xe'}
									</p>
									<p className="slot-card-note">{occupied ? slot.current_session_id || 'Session realtime active' : 'Chờ xe vào bãi'}</p>
								</article>
							);
						})
					)}
				</div>
			</section>

			<section className="grid table-grid">
				<section className="panel">
					<header className="panel-head">
						<h2>Danh sách phiên gần nhất</h2>
						<p>Hỗ trợ theo dõi trạng thái vào/ra theo thời gian thực.</p>
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
								{sessions.slice(0, 20).map((session) => (
									<tr key={session._id}>
										<td>{session._id}</td>
										<td>{session.status}</td>
										<td>{session.entry_plate_text || '-'}</td>
										<td>{session.is_plate_mismatch ? 'Có' : 'Không'}</td>
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
