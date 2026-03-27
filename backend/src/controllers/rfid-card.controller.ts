import type { Request, Response } from 'express';
import * as rfidCardService from '../services/rfid-card.service.ts';

export const create = async (req: Request, res: Response) => {
	const {
		uid,
		vehicle_id,
		card_type,
		is_active,
		monthly_fee,
		monthly_started_at,
		monthly_expires_at
	} = req.body;

	const data = await rfidCardService.create({
		uid,
		vehicle_id,
		card_type,
		is_active,
		monthly_fee,
		monthly_started_at,
		monthly_expires_at
	});

	return res.status(201).json({
		message: 'RFID card created successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { search, card_type, is_active, vehicle_id } = req.query;
	const parsedIsActive =
		typeof is_active === 'string' ? is_active === 'true' : undefined;

	const data = await rfidCardService.list({
		search: typeof search === 'string' ? search : undefined,
		card_type: card_type === 'monthly' || card_type === 'guest' ? card_type : undefined,
		is_active: parsedIsActive,
		vehicle_id: typeof vehicle_id === 'string' ? vehicle_id : undefined
	});

	return res.status(200).json({
		message: 'RFID cards retrieved successfully',
		data
	});
};

export const getById = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await rfidCardService.getById(id);

	return res.status(200).json({
		message: 'RFID card retrieved successfully',
		data
	});
};

export const update = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const {
		uid,
		vehicle_id,
		card_type,
		is_active,
		monthly_fee,
		monthly_started_at,
		monthly_expires_at
	} = req.body;

	const data = await rfidCardService.update(id, {
		uid,
		vehicle_id,
		card_type,
		is_active,
		monthly_fee,
		monthly_started_at,
		monthly_expires_at
	});

	return res.status(200).json({
		message: 'RFID card updated successfully',
		data
	});
};

export const remove = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	await rfidCardService.remove(id);

	return res.status(200).json({
		message: 'RFID card deleted successfully'
	});
};