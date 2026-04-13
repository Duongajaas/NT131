import type { Request, Response } from 'express';
import * as parkingSessionService from '../services/parking-session.service.ts';

export const entry = async (req: Request, res: Response) => {
	const { uid, plate_number, plate_confidence, entry_image_url, correlation_id } = req.body;
	const data = await parkingSessionService.createEntrySession({
		uid,
		plate_number,
		plate_confidence,
		entry_image_url,
		correlation_id
	});

	return res.status(201).json({
		message: 'Parking entry processed successfully',
		data
	});
};

export const verifyRfid = async (req: Request, res: Response) => {
	const { uid, observed_plate_number, correlation_id } = req.body;
	const data = await parkingSessionService.verifyRfidPlate({
		uid,
		observed_plate_number,
		correlation_id
	});

	return res.status(200).json({
		message: 'RFID scan verified successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { status, rfid_card_id, vehicle_id } = req.query;
	const data = await parkingSessionService.list({
		status: typeof status === 'string' ? (status as never) : undefined,
		rfid_card_id: typeof rfid_card_id === 'string' ? rfid_card_id : undefined,
		vehicle_id: typeof vehicle_id === 'string' ? vehicle_id : undefined
	});

	return res.status(200).json({
		message: 'Parking sessions retrieved successfully',
		data
	});
};

export const approve = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { correlation_id } = req.body;
	const data = await parkingSessionService.approveBlockedSession(id, correlation_id);

	return res.status(200).json({
		message: 'Parking session approved successfully',
		data
	});
};

export const assignSlot = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { slot_id, correlation_id } = req.body;
	const data = await parkingSessionService.assignSlot({
		session_id: id,
		slot_id,
		correlation_id
	});

	return res.status(200).json({
		message: 'Parking slot assigned successfully',
		data
	});
};

export const exit = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { exit_plate_number, exit_plate_confidence, exit_image_url, payment_status, correlation_id } =
		req.body;
	const data = await parkingSessionService.completeExitSession({
		session_id: id,
		exit_plate_number,
		exit_plate_confidence,
		exit_image_url,
		payment_status,
		correlation_id
	});

	return res.status(200).json({
		message: 'Parking exit processed successfully',
		data
	});
};
