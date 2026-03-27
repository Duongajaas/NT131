import Resident, { type IResident } from '../models/resident.models.ts';

export interface CreateResidentInput {
	full_name: string;
	phone?: string;
	apartment_no: string;
	is_active?: boolean;
}

export interface UpdateResidentInput {
	full_name?: string;
	phone?: string;
	apartment_no?: string;
	is_active?: boolean;
}

export interface ListResidentsFilter {
	search?: string;
	is_active?: boolean;
}

export const createResident = async (input: CreateResidentInput): Promise<IResident> => {
	return Resident.create({
		full_name: input.full_name,
		phone: input.phone,
		apartment_no: input.apartment_no,
		is_active: input.is_active
	});
};

export const findResidentById = async (residentId: string): Promise<IResident | null> => {
	return Resident.findById(residentId);
};

export const findResidentByPhone = async (
	phone: string
): Promise<IResident | null> => {
	return Resident.findOne({ phone });
};

export const listResidents = async (
	filter: ListResidentsFilter
): Promise<IResident[]> => {
	const query: {
		$or?: Array<Record<string, unknown>>;
		is_active?: boolean;
	} = {};

	if (filter.search) {
		query.$or = [
			{ full_name: { $regex: filter.search, $options: 'i' } },
			{ apartment_no: { $regex: filter.search, $options: 'i' } },
			{ phone: { $regex: filter.search, $options: 'i' } }
		];
	}

	if (filter.is_active !== undefined) {
		query.is_active = filter.is_active;
	}

	return Resident.find(query).sort({ created_at: -1 });
};

export const updateResidentById = async (
	residentId: string,
	input: UpdateResidentInput
): Promise<IResident | null> => {
	return Resident.findByIdAndUpdate(
		residentId,
		{
			$set: input
		},
		{
			new: true,
			runValidators: true
		}
	);
};

export const deleteResidentById = async (residentId: string): Promise<IResident | null> => {
	return Resident.findByIdAndDelete(residentId);
};