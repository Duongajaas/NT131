import type { Request, Response } from 'express';
import * as parkingSlotService from '../services/parking-slot.service.ts';

export const create = async (req: Request, res: Response) => {
	const { slot_code, level, slot_type } = req.body;
	const data = await parkingSlotService.create({
		slot_code,
		level,
		slot_type
	});

	return res.status(201).json({
		message: 'Parking slot created successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { level, slot_type, is_occupied } = req.query;
	const data = await parkingSlotService.list({
		level: typeof level === 'string' ? Number(level) : undefined,
		slot_type:
			slot_type === 'regular' || slot_type === 'motorbike' || slot_type === 'handicap'
				? slot_type
				: undefined,
		is_occupied:
			typeof is_occupied === 'string'
				? is_occupied === 'true'
					? true
					: is_occupied === 'false'
						? false
						: undefined
				: undefined
	});

	return res.status(200).json({
		message: 'Parking slots retrieved successfully',
		data
	});
};

export const getById = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await parkingSlotService.getById(id);

	return res.status(200).json({
		message: 'Parking slot retrieved successfully',
		data
	});
};

export const release = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await parkingSlotService.release(id);

	return res.status(200).json({
		message: 'Parking slot released successfully',
		data
	});
};
