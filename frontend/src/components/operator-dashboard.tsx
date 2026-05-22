import { useEffect, useMemo, useRef, useState } from 'react';
import { EventFeed } from './event-feed';
import {
	listParkingSlots,
	createParkingEntry
} from '../api/parking.api';
import { listRfidCards } from '../api/rfid-card.api';
import { getVehicleById } from '../api/vehicle.api';
import { getSocket, requestManualGateCommand } from '../lib/socket';
import { notifyError, notifySuccess } from '../lib/toast';
import { useOperatorStore } from '../store/operator-store';
import type { ParkingSlotRecord, RealtimeEnvelope } from '../types/contracts';

interface OperatorDashboardProps {
	token: string;
}

interface VehicleStatePayload {
	checkpoint?: string;
	plateNumber?: string;
	state?: string;
}

type PlateMatchStatus = 'neutral' | 'good' | 'danger';

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
	const [slotBusy, setSlotBusy] = useState(false);
	const [manualGateBusy, setManualGateBusy] = useState(false);
	const [expectedEntryPlateByUid, setExpectedEntryPlateByUid] = useState('');
	const [expectedExitPlateByUid, setExpectedExitPlateByUid] = useState('');
	const [displayEntryUid, setDisplayEntryUid] = useState('');
	const [displayExitUid, setDisplayExitUid] = useState('');
	const [displayEntryPlate, setDisplayEntryPlate] = useState('');
	const [displayExitPlate, setDisplayExitPlate] = useState('');
	const clearTimerRef = useRef<number | null>(null);
	const [slotRows, setSlotRows] = useState<ParkingSlotRecord[]>([]);
	const [entryMatchSnapshot, setEntryMatchSnapshot] = useState<{
    detectedPlate: string;
    expectedPlate: string;
} | null>(null);

const lastSnapshotEventIdRef = useRef('');

const pendingLookupUidRef = useRef('');
const pendingLookupCheckpointRef = useRef<'entry_rfid' | 'exit_rfid' | undefined>(undefined);

	const events = useOperatorStore((state) => state.events);
	const sessions = useOperatorStore((state) => state.sessions);
	const entryGateState = useOperatorStore((state) => state.entryGateState);
	const exitGateState = useOperatorStore((state) => state.exitGateState);

	const displayEntryPlateRef = useRef('');
useEffect(() => {
    displayEntryPlateRef.current = displayEntryPlate;
}, [displayEntryPlate]);

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
	const latestRejectedRfidEvent = useMemo(
		() =>
			events.find((event) => {
				if (event.eventName !== 'rfid.scan.rejected') {
					return false;
				}

				const payload = (event.payload ?? {}) as Record<string, unknown>;
				return typeof payload.uid === 'string' && payload.uid.length > 0;
			}),
		[events]
	);
	const latestRejectedRfidCorrelationId = latestRejectedRfidEvent?.correlationId;
	const latestExitCorrelationId = latestExitVehicleEvent?.correlationId;
	// const latestRfidEvent = useMemo(
	// 	() =>
	// 		events.find((event) => {
	// 			if (
	// 				event.eventName !== 'hardware.rfid.scan' &&
	// 				event.eventName !== 'rfid.scan.requested' &&
	// 				event.eventName !== 'rfid.scan.accepted' &&
	// 				event.eventName !== 'rfid.scan.rejected'
	// 			) {
	// 				return false;
	// 			}

	// 			const payload = (event.payload ?? {}) as Record<string, unknown>;
	// 			return typeof payload.uid === 'string' && payload.uid.length > 0;
	// 		}),
	// 	[events]
	// );

	const latestRfidEvent = useMemo(
    () =>
        events.find((event) => {
            if (
                event.eventName !== 'hardware.rfid.scan' &&
                event.eventName !== 'rfid.scan.requested'
            ) {
                return false; // chỉ giữ 2 event scan thật, bỏ accepted/rejected
            }

            const payload = (event.payload ?? {}) as Record<string, unknown>;
            return typeof payload.uid === 'string' && payload.uid.length > 0;
        }),
    [events]
);

	const latestScannedUid = useMemo(() => {
		const payload = (latestRfidEvent?.payload ?? {}) as Record<string, unknown>;
		return typeof payload.uid === 'string' ? normalizeText(payload.uid) : '';
	}, [latestRfidEvent]);
	const latestRfidCheckpoint = useMemo(() => {
		const payload = (latestRfidEvent?.payload ?? {}) as Record<string, unknown>;
		if (payload.checkpoint === 'entry_rfid' || payload.checkpoint === 'exit_rfid') {
			return payload.checkpoint;
		}
		return undefined;
	}, [latestRfidEvent]);
	const latestRfidDecisionEvent = useMemo(
		() =>
			events.find(
				(event) => event.eventName === 'rfid.scan.accepted' || event.eventName === 'rfid.scan.rejected'
			),
		[events]
	);
	const normalizedExpectedEntryPlateByUid = normalizeText(expectedEntryPlateByUid || '');
	const normalizedExpectedExitPlateByUid = normalizeText(expectedExitPlateByUid || '');

	const resolvePlateMatchStatus = (plateValue: string, expectedPlate: string): PlateMatchStatus => {
		const normalizedPlate = normalizeText(plateValue || '');
		if (!normalizedPlate || !expectedPlate) {
			return 'neutral';
		}

		return normalizedPlate === expectedPlate ? 'good' : 'danger';
	};

	// const entryPlateForMatch = displayEntryPlate;
	// const entryPlateMatchStatus = resolvePlateMatchStatus(
	// 	entryPlateForMatch,
	// 	normalizedExpectedEntryPlateByUid
	// );

	const entryPlateMatchStatus: PlateMatchStatus = useMemo(() => {
		console.log('Recalculating entry plate match status with snapshot:', entryMatchSnapshot);
    if (!entryMatchSnapshot?.detectedPlate || !entryMatchSnapshot?.expectedPlate) {
        return 'neutral';
    }
    return resolvePlateMatchStatus(
        entryMatchSnapshot.detectedPlate,
        entryMatchSnapshot.expectedPlate
    );
}, [entryMatchSnapshot]);

// 	const entryMatchCacheRef = useRef<{ plate: string; expected: string }>({
//     plate: '',
//     expected: ''
// });

	const exitPlateMatchStatus =
		latestRejectedRfidEvent && latestRejectedRfidCorrelationId && latestExitCorrelationId
			? latestRejectedRfidCorrelationId === latestExitCorrelationId
				? 'danger'
				: resolvePlateMatchStatus(displayExitPlate, normalizedExpectedExitPlateByUid)
			: resolvePlateMatchStatus(displayExitPlate, normalizedExpectedExitPlateByUid);

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

// 	useEffect(() => {
//     if (displayEntryPlate) {
//         entryMatchCacheRef.current.plate = displayEntryPlate;
//     }
// }, [displayEntryPlate]);

// useEffect(() => {
//     if (!displayEntryPlate) {
//         return;
//     }
//     setEntryMatchSnapshot((prev) => {
//         if (!prev || prev.detectedPlate) {
//             return prev; // đã có plate rồi, không ghi đè
//         }
//         return { ...prev, detectedPlate: displayEntryPlate };
//     });
// }, [displayEntryPlate]);


useEffect(() => {
    if (!displayEntryPlate) return;
    setEntryMatchSnapshot((prev) => {
        if (!prev) return prev;
        // Luôn cập nhật detectedPlate nếu snapshot đang thiếu
        if (prev.detectedPlate) return prev; // chỉ skip nếu đã có rồi
        return { ...prev, detectedPlate: displayEntryPlate };
    });
}, [displayEntryPlate]);

useEffect(() => {
    if (!normalizedExpectedEntryPlateByUid) {
        return;
    }
    setEntryMatchSnapshot((prev) =>
        prev ? { ...prev, expectedPlate: normalizedExpectedEntryPlateByUid } : prev
    );
}, [normalizedExpectedEntryPlateByUid]);

useEffect(() => {
    if (!latestRfidDecisionEvent) {
        return;
    }
    // Giữ snapshot thêm 2500ms để UI kịp hiển thị kết quả
    const timer = window.setTimeout(() => {
        setEntryMatchSnapshot(null);
    }, 2500);
    return () => window.clearTimeout(timer);
}, [latestRfidDecisionEvent?.eventId]);


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

	const findVehiclePlateByUid = async (uidValue: string) => {
		const normalizedUid = normalizeText(uidValue);
		if (!normalizedUid) {
			return null;
		}

		const cards = await listRfidCards({ token }, { search: normalizedUid });
		const exactCard = cards.find((item) => normalizeText(item.uid) === normalizedUid);
		const containsCard = cards.find((item) => normalizeText(item.uid).includes(normalizedUid));
		const matchedCard = exactCard || containsCard;

		if (!matchedCard) {
			return null;
		}

		const vehicle = await getVehicleById(matchedCard.vehicle_id, { token });
		return normalizeText(vehicle.plate_number);
	};

	useEffect(() => {
		const normalizedUid = normalizeText(latestScannedUid);
		if (!normalizedUid || !latestRfidCheckpoint) {
			return;
		}

		let cancelled = false;
		const timer = window.setTimeout(() => {
			void findVehiclePlateByUid(normalizedUid)
				.then((plate) => {
					if (cancelled) {
						return;
					}
					if (latestRfidCheckpoint === 'entry_rfid') {
						setExpectedEntryPlateByUid(plate || '');
					} else {
						setExpectedExitPlateByUid(plate || '');
					}
				})
				.catch(() => {
					if (cancelled) {
						return;
					}
					if (latestRfidCheckpoint === 'entry_rfid') {
						setExpectedEntryPlateByUid('');
					} else {
						setExpectedExitPlateByUid('');
					}
				});
		}, 300);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [latestScannedUid, latestRfidCheckpoint, token]);

	// useEffect(() => {
	// 	if (!latestRfidCheckpoint) {
	// 		return;
	// 	}

	// 	if (latestRfidCheckpoint === 'entry_rfid') {
	// 		setDisplayEntryUid(latestScannedUid);
	// 		return;
	// 	}

	// 	setDisplayExitUid(latestScannedUid);
	// }, [latestScannedUid, latestRfidCheckpoint]);

// 	useEffect(() => {
//     if (!latestScannedUid || latestRfidCheckpoint !== 'entry_rfid') {
//         return;
//     }
//     // Lưu plate đang hiển thị tại thời điểm scan
//     setEntryMatchSnapshot({
//         detectedPlate: displayEntryPlate,
//         expectedPlate: '' // sẽ fill sau khi lookup xong
//     });
// }, [latestScannedUid, latestRfidCheckpoint]);

	useEffect(() => {
    if (!latestScannedUid || latestRfidCheckpoint !== 'entry_rfid') return;

    const currentEventId = latestRfidEvent?.eventId ?? '';
    if (!currentEventId || currentEventId === lastSnapshotEventIdRef.current) return;
    lastSnapshotEventIdRef.current = currentEventId;

    // Lưu vào ref để lookup dùng — không phụ thuộc vào reactive state
    pendingLookupUidRef.current = latestScannedUid;
    pendingLookupCheckpointRef.current = 'entry_rfid';

    setDisplayEntryUid(latestScannedUid);
    setEntryMatchSnapshot({
        detectedPlate: displayEntryPlateRef.current,
        expectedPlate: ''
    });
}, [latestScannedUid, latestRfidCheckpoint, latestRfidEvent?.eventId]);

useEffect(() => {
    if (!latestScannedUid || latestRfidCheckpoint !== 'exit_rfid') return;

    const currentEventId = latestRfidEvent?.eventId ?? '';
    if (!currentEventId) return;

    pendingLookupUidRef.current = latestScannedUid;
    pendingLookupCheckpointRef.current = 'exit_rfid';

    setDisplayExitUid(latestScannedUid);
}, [latestScannedUid, latestRfidCheckpoint, latestRfidEvent?.eventId]);

useEffect(() => {
    const uid = pendingLookupUidRef.current;
    const checkpoint = pendingLookupCheckpointRef.current;

    console.log('[lookup] triggered from snapshot', { uid, checkpoint });
    if (!uid || !checkpoint) return;

    // Clear ref ngay để không lookup lại lần sau
    pendingLookupUidRef.current = '';
    pendingLookupCheckpointRef.current = undefined;

    let cancelled = false;
    const timer = window.setTimeout(() => {
        void findVehiclePlateByUid(uid)
            .then((plate) => {
                console.log('[lookup] result:', { plate, cancelled, checkpoint });
                if (cancelled) return;
                if (checkpoint === 'entry_rfid') {
                    setExpectedEntryPlateByUid(plate || '');
                } else {
                    setExpectedExitPlateByUid(plate || '');
                }
            })
            .catch(() => {
                if (cancelled) return;
                if (checkpoint === 'entry_rfid') setExpectedEntryPlateByUid('');
                else setExpectedExitPlateByUid('');
            });
    }, 300);

    return () => {
        cancelled = true;
        window.clearTimeout(timer);
    };
}, [entryMatchSnapshot]);

	useEffect(() => {
		setDisplayEntryPlate(latestDetectedPlate);
	}, [latestDetectedPlate]);

	useEffect(() => {
		setDisplayExitPlate(latestExitDetectedPlate);
	}, [latestExitDetectedPlate]);

	useEffect(() => {
    if (!latestScannedUid || !latestRfidCheckpoint) return;
    if (latestRfidCheckpoint === 'exit_rfid') {
        setDisplayExitUid(latestScannedUid);
    }
}, [latestScannedUid, latestRfidCheckpoint]);

	useEffect(() => {
		if (!latestRfidDecisionEvent) {
			return;
		}

		if (clearTimerRef.current) {
			window.clearTimeout(clearTimerRef.current);
		}

		clearTimerRef.current = window.setTimeout(() => {
			setDisplayEntryUid('');
			setDisplayExitUid('');
			setDisplayEntryPlate('');
			setDisplayExitPlate('');
			setExpectedEntryPlateByUid('');
			setExpectedExitPlateByUid('');
			clearTimerRef.current = null;
		}, 2500);
	}, [latestRfidDecisionEvent?.eventId]);

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
			const correlationId = crypto.randomUUID();

			// Auto-create entry session when opening entry gate with valid RFID match
			if (gateId === 'entry-gate' && command === 'open' && entryPlateMatchStatus === 'good' && latestScannedUid && latestDetectedPlate) {
				const entryResponse = await createParkingEntry(
					{
						uid: latestScannedUid,
						plate_number: normalizeText(latestDetectedPlate),
						plate_confidence: 95,
						correlation_id: correlationId
					},
					{ token }
				);
				notifySuccess(`Đã tạo phiên vào bãi: ${entryResponse.session._id}`);
				void loadParkingSlots();
			}

			const response = await requestManualGateCommand(socket, {
				gateId,
				command,
				correlationId
			});

			notifySuccess(`Đã gửi lệnh ${command} cho ${gateId} (${response.state || 'không rõ trạng thái'})`);
		} catch (error) {
			notifyError(error instanceof Error ? error.message : 'Điều khiển cổng thất bại');
		} finally {
			setManualGateBusy(false);
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

			<section className="grid operator-workspace-grid operator-workspace-grid-single">
				<section className="panel operator-plate-panel">
					<header className="panel-head">
						<h2>Hình ảnh biển số xe</h2>
						<p>Nhận UID quét từ ESP32 và tự động đối chiếu biển số camera với DB.</p>
					</header>
					<p className="plate-preview-meta">RFID UID (Entry): {displayEntryUid || 'Chưa có dữ liệu quét'}</p>
					<p className="plate-preview-meta">RFID UID (Exit): {displayExitUid || 'Chưa có dữ liệu quét'}</p>

					<div className="plate-preview-stage plate-preview-grid">
						<div className="plate-preview-frame">
							<p className="plate-preview-head">CAMERA ENTRY</p>
							<div className="plate-preview-center">
								<div className={`plate-visual-number plate-visual-number-${entryPlateMatchStatus}`}>
									{displayEntryPlate || 'Chưa có xe vào'}
								</div>
							</div>
						</div>
						<div className="plate-preview-frame plate-preview-exit">
							<p className="plate-preview-head">CAMERA EXIT</p>
							<div className="plate-preview-center">
								<div className={`plate-visual-number plate-visual-number-${exitPlateMatchStatus}`}>
									{displayExitPlate || 'Chưa có xe ra'}
								</div>
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
