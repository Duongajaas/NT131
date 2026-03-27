import type { Request, Response } from 'express';
import * as residentService from '../services/resident.service.ts';

export const create = async (req: Request, res: Response) => {
	const { full_name, phone, apartment_no, is_active } = req.body;
	const data = await residentService.create({
		full_name,
		phone,
		apartment_no,
		is_active
	});

	return res.status(201).json({
		message: 'Resident created successfully',
		data
	});
};

export const list = async (req: Request, res: Response) => {
	const { search, is_active } = req.query;
	const parsedIsActive =
		typeof is_active === 'string' ? is_active === 'true' : undefined;

	const data = await residentService.list({
		search: typeof search === 'string' ? search : undefined,
		is_active: parsedIsActive
	});

	return res.status(200).json({
		message: 'Residents retrieved successfully',
		data
	});
};

export const getById = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const data = await residentService.getById(id);

	return res.status(200).json({
		message: 'Resident retrieved successfully',
		data
	});
};

export const update = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	const { full_name, phone, apartment_no, is_active } = req.body;
	const data = await residentService.update(id, {
		full_name,
		phone,
		apartment_no,
		is_active
	});

	return res.status(200).json({
		message: 'Resident updated successfully',
		data
	});
};

export const remove = async (req: Request, res: Response) => {
	const { id } = req.params as { id: string };
	await residentService.remove(id);

	return res.status(200).json({
		message: 'Resident deleted successfully'
	});
};