import { randomUUID } from 'node:crypto';
import type { PaymentStatus } from '../models/transaction.models.ts';
import type { VehicleType } from '../models/vehicle.models.ts';
import {
	completeParkingSession,
	createParkingSession,
	findActiveSessionByRfidCardId,
	findParkingSessionById,
	listParkingSessions,
	updateParkingSessionStatus,
	type ListParkingSessionsFilter
} from '../repositories/parking-session.repository.ts';
import {
	findAvailableSlot,
	findParkingSlotById,
	findParkingSlotBySessionId,
	occupyParkingSlot,
	releaseParkingSlot
} from '../repositories/parking-slot.repository.ts';
import { findActivePricingPolicy } from '../repositories/pricing-policy.repository.ts';
import {
	findRfidCardById,
	findRfidCardByUid
} from '../repositories/rfid-card.repository.ts';
import { createTransaction, findTransactionBySessionId } from '../repositories/transaction.repository.ts';
import { findVehicleById } from '../repositories/vehicle.repository.ts';
import hardwareGateway from './hardware-gateway.service.ts';
import { publishRealtimeEvent } from './realtime-event-bus.service.ts';
import AppError from '../utills/app-error.ts';

interface EntryInput {
	uid: string;
	plate_number?: string;
	plate_confidence?: number;
	entry_image_url?: string;
	correlation_id?: string;
}

interface VerifyRfidPlateInput {
	uid: string;
	observed_plate_number: string;
	correlation_id?: string;
}

interface ExitInput {
	session_id: string;
	exit_plate_number?: string;
	exit_plate_confidence?: number;
	exit_image_url?: string;
	payment_status?: PaymentStatus;
	correlation_id?: string;
}

interface AssignSlotInput {
	session_id: string;
	slot_id?: string;
	correlation_id?: string;
}

interface HardwareRfidScanInput {
	uid: string;
	checkpoint: 'entry_rfid' | 'exit_rfid';
	plate_number: string;
	correlation_id?: string;
}

interface HardwareRfidScanResult {
	checkpoint: 'entry_rfid' | 'exit_rfid';
	sessionId?: string;
	gate_action: 'open' | 'deny';
	reason?: string;
}

const normalizeText = (value: string) => value.trim().toUpperCase();

const resolveSlotTypeByVehicle = (vehicleType: VehicleType) => {
	return vehicleType === 'motorbike' ? 'motorbike' : 'regular';
};

const ensureMonthlyCardValid = (monthlyExpiresAt?: Date) => {
	if (!monthlyExpiresAt) {
		return;
	}

	if (monthlyExpiresAt.getTime() < Date.now()) {
		throw new AppError('Monthly RFID card is expired', 403);
	}
};

const calculateFee = (durationMinutes: number, freeMinutes: number, pricePerHour: number) => {
	const billableMinutes = Math.max(0, durationMinutes - freeMinutes);
	const billableHours = Math.ceil(billableMinutes / 60);
	return billableHours * pricePerHour;
};

export const list = async (input: ListParkingSessionsFilter) => {
	return listParkingSessions(input);
};

export const createEntrySession = async (input: EntryInput) => {
	const normalizedUid = normalizeText(input.uid);
	const normalizedPlate = input.plate_number ? normalizeText(input.plate_number) : undefined;

	publishRealtimeEvent({
		eventName: 'rfid.scan.requested',
		correlationId: input.correlation_id,
		payload: {
			uid: normalizedUid,
			plateNumber: normalizedPlate,
			plateConfidence: input.plate_confidence,
			status: 'requested'
		}
	});

	const rfidCard = await findRfidCardByUid(normalizedUid);
	if (!rfidCard) {
		throw new AppError('RFID card not found', 404);
	}

	if (!rfidCard.is_active) {
		throw new AppError('RFID card is inactive', 403);
	}

	if (rfidCard.card_type === 'monthly') {
		ensureMonthlyCardValid(rfidCard.monthly_expires_at);
	}

	const activeSession = await findActiveSessionByRfidCardId(rfidCard._id.toString());
	if (activeSession) {
		throw new AppError('RFID card already has an active parking session', 409);
	}

	const vehicle = await findVehicleById(rfidCard.vehicle_id.toString());
	if (!vehicle) {
		throw new AppError('Vehicle linked to RFID card was not found', 404);
	}

	const isPlateMismatch = normalizedPlate ? normalizedPlate !== vehicle.plate_number : false;
	const status = isPlateMismatch ? 'blocked' : 'approved_entry';

	const session = await createParkingSession({
		vehicle_id: vehicle._id.toString(),
		rfid_card_id: rfidCard._id.toString(),
		status,
		entry_plate_text: normalizedPlate,
		entry_plate_confidence: input.plate_confidence,
		entry_image_url: input.entry_image_url,
		is_plate_mismatch: isPlateMismatch
	});

	if (isPlateMismatch) {
		publishRealtimeEvent({
			eventName: 'rfid.scan.rejected',
			correlationId: input.correlation_id,
			sessionId: session._id.toString(),
			payload: {
				uid: normalizedUid,
				plateNumber: normalizedPlate,
				reason: 'plate_mismatch'
			}
		});
		publishRealtimeEvent({
			eventName: 'alert.plate_mismatch',
			correlationId: input.correlation_id,
			sessionId: session._id.toString(),
			payload: {
				expectedPlateNumber: vehicle.plate_number,
				actualPlateNumber: normalizedPlate
			}
		});
	} else {
		publishRealtimeEvent({
			eventName: 'rfid.scan.accepted',
			correlationId: input.correlation_id,
			sessionId: session._id.toString(),
			payload: {
				uid: normalizedUid,
				plateNumber: normalizedPlate,
				decision: 'accepted'
			}
		});
	}

	publishRealtimeEvent({
		eventName: 'session.created',
		correlationId: input.correlation_id,
		sessionId: session._id.toString(),
		payload: {
			status: session.status,
			vehicleId: vehicle._id.toString(),
			rfidCardId: rfidCard._id.toString()
		}
	});

	return {
		session,
		gate_action: (isPlateMismatch ? 'deny' : 'open') as 'deny' | 'open',
		reason: isPlateMismatch ? 'plate_mismatch' : undefined
	};
};

export const verifyRfidPlate = async (input: VerifyRfidPlateInput) => {
	const normalizedUid = normalizeText(input.uid);
	const observedPlateNumber = normalizeText(input.observed_plate_number);

	publishRealtimeEvent({
		eventName: 'rfid.scan.requested',
		correlationId: input.correlation_id,
		payload: {
			uid: normalizedUid,
			plateNumber: observedPlateNumber,
			status: 'requested'
		}
	});

	const rfidCard = await findRfidCardByUid(normalizedUid);
	if (!rfidCard) {
		publishRealtimeEvent({
			eventName: 'rfid.scan.rejected',
			correlationId: input.correlation_id,
			payload: {
				uid: normalizedUid,
				plateNumber: observedPlateNumber,
				status: 'rejected',
				reason: 'card_not_found'
			}
		});

		return {
			uid: normalizedUid,
			observed_plate_number: observedPlateNumber,
			expected_plate_number: null,
			is_match: false,
			decision: 'rejected' as const,
			reason: 'card_not_found' as const,
			rfid_card_found: false,
			rfid_card_active: false,
			rfid_card_id: null,
			vehicle_id: null
		};
	}

	const vehicle = await findVehicleById(rfidCard.vehicle_id.toString());
	if (!vehicle) {
		publishRealtimeEvent({
			eventName: 'rfid.scan.rejected',
			correlationId: input.correlation_id,
			payload: {
				uid: normalizedUid,
				plateNumber: observedPlateNumber,
				status: 'rejected',
				reason: 'vehicle_not_found'
			}
		});

		return {
			uid: normalizedUid,
			observed_plate_number: observedPlateNumber,
			expected_plate_number: null,
			is_match: false,
			decision: 'rejected' as const,
			reason: 'vehicle_not_found' as const,
			rfid_card_found: true,
			rfid_card_active: rfidCard.is_active,
			rfid_card_id: rfidCard._id.toString(),
			vehicle_id: rfidCard.vehicle_id.toString()
		};
	}

	const expectedPlateNumber = vehicle.plate_number;
	const isPlateMatch = expectedPlateNumber === observedPlateNumber;
	const decision = rfidCard.is_active && isPlateMatch ? 'accepted' : 'rejected';
	const reason = !rfidCard.is_active ? 'card_inactive' : isPlateMatch ? undefined : 'plate_mismatch';

	publishRealtimeEvent({
		eventName: decision === 'accepted' ? 'rfid.scan.accepted' : 'rfid.scan.rejected',
		correlationId: input.correlation_id,
		payload: {
			uid: normalizedUid,
			plateNumber: observedPlateNumber,
			expectedPlateNumber,
			status: decision,
			decision,
			reason
		}
	});

	if (decision === 'rejected' && reason === 'plate_mismatch') {
		publishRealtimeEvent({
			eventName: 'alert.plate_mismatch',
			correlationId: input.correlation_id,
			payload: {
				expectedPlateNumber,
				actualPlateNumber: observedPlateNumber,
				reason: 'plate_mismatch'
			}
		});
	}

	return {
		uid: normalizedUid,
		observed_plate_number: observedPlateNumber,
		expected_plate_number: expectedPlateNumber,
		is_match: isPlateMatch,
		decision,
		reason,
		rfid_card_found: true,
		rfid_card_active: rfidCard.is_active,
		rfid_card_id: rfidCard._id.toString(),
		vehicle_id: vehicle._id.toString()
	};
};

export const processHardwareRfidScan = async (
	input: HardwareRfidScanInput
): Promise<HardwareRfidScanResult> => {
	const correlationId = input.correlation_id ?? randomUUID();
	const normalizedUid = normalizeText(input.uid);
	const normalizedPlate = normalizeText(input.plate_number);
	const checkpoint = input.checkpoint === 'exit_rfid' ? 'exit_rfid' : 'entry_rfid';

	if (!normalizedPlate) {
		throw new AppError('Observed plate number is required', 400);
	}

	if (checkpoint === 'entry_rfid') {
		const entryResult = await createEntrySession({
			uid: normalizedUid,
			plate_number: normalizedPlate,
			correlation_id: correlationId
		});

		if (entryResult.gate_action === 'open') {
			const gateCommand = await hardwareGateway.openGate('entry-gate', {
				commandId: randomUUID(),
				sessionId: entryResult.session._id.toString(),
				correlationId,
				requestedBy: 'backend',
				timeoutMs: 5000,
				action: 'open'
			});

			publishRealtimeEvent({
				eventName: 'gate.command.sent',
				correlationId,
				sessionId: entryResult.session._id.toString(),
				payload: {
					gateId: 'entry-gate',
					command: 'open',
					reason: 'rfid_auto_open',
					result: gateCommand.result,
					commandId: gateCommand.commandId
				}
			});
			publishRealtimeEvent({
				eventName: 'gate.state.changed',
				correlationId,
				sessionId: entryResult.session._id.toString(),
				payload: {
					gateId: 'entry-gate',
					state: gateCommand.stateAfter
				}
			});
		}

		return {
			checkpoint,
			sessionId: entryResult.session._id.toString(),
			gate_action: entryResult.gate_action,
			reason: entryResult.reason
		};
	}

	const rfidCard = await findRfidCardByUid(normalizedUid);
	if (!rfidCard) {
		throw new AppError('RFID card not found', 404);
	}

	const activeSession = await findActiveSessionByRfidCardId(rfidCard._id.toString());
	if (!activeSession) {
		throw new AppError('Active parking session not found', 404);
	}

	const exitResult = await completeExitSession({
		session_id: activeSession._id.toString(),
		exit_plate_number: normalizedPlate,
		correlation_id: correlationId
	});

	return {
		checkpoint,
		sessionId: activeSession._id.toString(),
		gate_action: exitResult.gate_action,
		reason: exitResult.gate_action === 'deny' ? 'plate_mismatch' : undefined
	};
};

export const approveBlockedSession = async (sessionId: string, correlationId?: string) => {
	const session = await findParkingSessionById(sessionId);
	if (!session) {
		throw new AppError('Parking session not found', 404);
	}

	if (session.status !== 'blocked') {
		throw new AppError('Only blocked sessions can be approved manually', 409);
	}

	const updated = await updateParkingSessionStatus(sessionId, 'approved_entry');
	if (!updated) {
		throw new AppError('Failed to approve parking session', 500);
	}

	const gateCommand = await hardwareGateway.openGate('entry-gate', {
		commandId: randomUUID(),
		sessionId,
		correlationId: correlationId,
		requestedBy: 'operator',
		timeoutMs: 5000,
		action: 'open'
	});

	publishRealtimeEvent({
		eventName: 'session.updated',
		correlationId: correlationId,
		sessionId,
		payload: {
			status: updated.status,
			approvedByOperator: true
		}
	});
	publishRealtimeEvent({
		eventName: 'gate.command.sent',
		correlationId: correlationId,
		sessionId,
		payload: {
			gateId: 'entry-gate',
			command: 'open',
			reason: 'manual_override',
			result: gateCommand.result,
			commandId: gateCommand.commandId
		}
	});
	publishRealtimeEvent({
		eventName: 'gate.state.changed',
		correlationId: correlationId,
		sessionId,
		payload: {
			gateId: 'entry-gate',
			state: gateCommand.stateAfter
		}
	});

	return updated;
};

export const assignSlot = async (input: AssignSlotInput) => {
	const session = await findParkingSessionById(input.session_id);
	if (!session) {
		throw new AppError('Parking session not found', 404);
	}

	if (session.status === 'completed') {
		throw new AppError('Cannot assign slot to completed session', 409);
	}

	const vehicle = await findVehicleById(session.vehicle_id.toString());
	if (!vehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	let slot = input.slot_id
		? await findParkingSlotById(input.slot_id)
		: await findAvailableSlot(resolveSlotTypeByVehicle(vehicle.vehicle_type));

	if (!slot && vehicle.vehicle_type === 'car') {
		slot = await findAvailableSlot('handicap');
	}

	if (!slot) {
		throw new AppError('No available parking slot', 409);
	}

	if (slot.is_occupied) {
		throw new AppError('Parking slot is already occupied', 409);
	}

	const occupiedSlot = await occupyParkingSlot(slot._id.toString(), input.session_id);
	if (!occupiedSlot) {
		throw new AppError('Failed to assign parking slot', 500);
	}

	const updatedSession = await updateParkingSessionStatus(input.session_id, 'parked');
	if (!updatedSession) {
		throw new AppError('Failed to update parking session status', 500);
	}

	publishRealtimeEvent({
		eventName: 'slot.assigned',
		correlationId: input.correlation_id,
		sessionId: input.session_id,
		payload: {
			slotId: occupiedSlot._id.toString(),
			slotCode: occupiedSlot.slot_code,
			action: 'assigned'
		}
	});
	publishRealtimeEvent({
		eventName: 'session.updated',
		correlationId: input.correlation_id,
		sessionId: input.session_id,
		payload: {
			status: updatedSession.status
		}
	});

	return {
		session: updatedSession,
		slot: occupiedSlot
	};
};

export const completeExitSession = async (input: ExitInput) => {
	const session = await findParkingSessionById(input.session_id);
	if (!session) {
		throw new AppError('Parking session not found', 404);
	}

	if (session.status === 'completed') {
		throw new AppError('Parking session has already been completed', 409);
	}

	const vehicle = await findVehicleById(session.vehicle_id.toString());
	if (!vehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	const normalizedExitPlate = input.exit_plate_number
		? normalizeText(input.exit_plate_number)
		: undefined;
	const plateMismatch =
		normalizedExitPlate && vehicle.plate_number !== normalizedExitPlate
			? true
			: session.is_plate_mismatch;

	const now = new Date();
	const durationMinutes = Math.max(
		1,
		Math.ceil((now.getTime() - session.entry_time.getTime()) / (1000 * 60))
	);

	let amount = 0;
	let finalAmount = 0;
	let paymentStatus: PaymentStatus = input.payment_status ?? 'pending';
	let pricingPolicyId: string | undefined;

	const rfidCardForSession = await findRfidCardById(session.rfid_card_id.toString());
	if (!rfidCardForSession) {
		throw new AppError('RFID card not found for session', 404);
	}

	if (rfidCardForSession.card_type === 'monthly') {
		paymentStatus = 'waived';
	} else {
		const pricingPolicy = await findActivePricingPolicy(
			vehicle.vehicle_type,
			rfidCardForSession.card_type
		);
		if (!pricingPolicy) {
			throw new AppError('Pricing policy not found', 409);
		}

		pricingPolicyId = pricingPolicy._id.toString();
		amount = calculateFee(
			durationMinutes,
			pricingPolicy.free_minutes,
			pricingPolicy.price_per_hour
		);
		finalAmount = amount;
	}

	const completedStatus = plateMismatch ? 'blocked' : 'completed';
	const updatedSession = await completeParkingSession(input.session_id, {
		duration_minutes: durationMinutes,
		exit_plate_text: normalizedExitPlate,
		exit_plate_confidence: input.exit_plate_confidence,
		exit_image_url: input.exit_image_url,
		is_plate_mismatch: plateMismatch,
		status: completedStatus
	});
	if (!updatedSession) {
		throw new AppError('Failed to complete parking session', 500);
	}

	let transaction = await findTransactionBySessionId(input.session_id);
	if (!transaction) {
		transaction = await createTransaction({
			session_id: input.session_id,
			vehicle_id: session.vehicle_id.toString(),
			rfid_card_id: session.rfid_card_id.toString(),
			pricing_policy_id: pricingPolicyId,
			amount,
			final_amount: finalAmount,
			payment_status: paymentStatus
		});
	}

	const occupiedSlot = await findParkingSlotBySessionId(input.session_id);
	if (occupiedSlot) {
		await releaseParkingSlot(occupiedSlot._id.toString());
		publishRealtimeEvent({
			eventName: 'slot.released',
			correlationId: input.correlation_id,
			sessionId: input.session_id,
			payload: {
				slotId: occupiedSlot._id.toString(),
				slotCode: occupiedSlot.slot_code,
				action: 'released'
			}
		});
	}

	publishRealtimeEvent({
		eventName: plateMismatch ? 'alert.plate_mismatch' : 'session.completed',
		correlationId: input.correlation_id,
		sessionId: input.session_id,
		payload: {
			status: updatedSession.status,
			amount: transaction.final_amount,
			paymentStatus: transaction.payment_status,
			exitPlateNumber: normalizedExitPlate,
			reason: plateMismatch ? 'plate_mismatch' : undefined
		}
	});

	if (!plateMismatch) {
		const gateCommand = await hardwareGateway.openGate('exit-gate', {
			commandId: randomUUID(),
			sessionId: input.session_id,
			correlationId: input.correlation_id,
			requestedBy: 'backend',
			timeoutMs: 5000,
			action: 'open'
		});

		publishRealtimeEvent({
			eventName: 'gate.command.sent',
			correlationId: input.correlation_id,
			sessionId: input.session_id,
			payload: {
				gateId: 'exit-gate',
				command: 'open',
				result: gateCommand.result,
				commandId: gateCommand.commandId
			}
		});
		publishRealtimeEvent({
			eventName: 'gate.state.changed',
			correlationId: input.correlation_id,
			sessionId: input.session_id,
			payload: {
				gateId: 'exit-gate',
				state: gateCommand.stateAfter
			}
		});
	}

	return {
		session: updatedSession,
		transaction,
		gate_action: (plateMismatch ? 'deny' : 'open') as 'deny' | 'open'
	};
};
