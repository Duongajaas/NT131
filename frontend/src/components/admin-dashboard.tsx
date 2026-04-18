import { useEffect, useMemo, useState } from 'react';
import { registerUser } from '../api/auth.api';
import { createParkingSlot, getRevenueReport } from '../api/parking.api';
import { createResident, listResidents } from '../api/resident.api';
import { createRfidCard, listRfidCards } from '../api/rfid-card.api';
import { createVehicle } from '../api/vehicle.api';
import type {
	ResidentRecord,
	RevenueReport,
	RfidCardRecord,
	TransactionRecord
} from '../types/contracts';
import { StatusCard } from './status-card';

interface AdminDashboardProps {
	token: string;
}

const toIsoStartOfDay = (value: string) => {
	if (!value) {
		return undefined;
	}
	return new Date(`${value}T00:00:00.000Z`).toISOString();
};

const toIsoEndOfDay = (value: string) => {
	if (!value) {
		return undefined;
	}
	return new Date(`${value}T23:59:59.999Z`).toISOString();
};

export const AdminDashboard = ({ token }: AdminDashboardProps) => {
	const [residents, setResidents] = useState<ResidentRecord[]>([]);
	const [monthlyCards, setMonthlyCards] = useState<RfidCardRecord[]>([]);
	const [revenueReport, setRevenueReport] = useState<RevenueReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('Sẵn sàng quản trị');

	const [search, setSearch] = useState('');
	const [fromDate, setFromDate] = useState('');
	const [toDate, setToDate] = useState('');

	const [fullName, setFullName] = useState('');
	const [phone, setPhone] = useState('');
	const [apartmentNo, setApartmentNo] = useState('');
	const [vehicleType, setVehicleType] = useState<'motorbike' | 'car'>('car');
	const [plateNumber, setPlateNumber] = useState('');
	const [uid, setUid] = useState('');
	const [monthlyFee, setMonthlyFee] = useState('0');
	const [startedAt, setStartedAt] = useState('');
	const [expiresAt, setExpiresAt] = useState('');
	const [createBusy, setCreateBusy] = useState(false);

	const [operatorFullName, setOperatorFullName] = useState('');
	const [operatorUsername, setOperatorUsername] = useState('');
	const [operatorPassword, setOperatorPassword] = useState('');
	const [createOperatorBusy, setCreateOperatorBusy] = useState(false);

	const [slotCode, setSlotCode] = useState('');
	const [slotLevel, setSlotLevel] = useState('0');
	const [slotType, setSlotType] = useState<'regular' | 'motorbike' | 'handicap'>('regular');
	const [createSlotBusy, setCreateSlotBusy] = useState(false);

	const activeResidents = useMemo(
		() => residents.filter((resident) => resident.is_active).length,
		[residents]
	);

	const totalRevenue = revenueReport?.summary.total_revenue ?? 0;
	const paidTransactions = revenueReport?.summary.paid_transactions ?? 0;
	const recentTransactions: TransactionRecord[] = revenueReport?.transactions ?? [];

	const loadDashboard = async () => {
		setLoading(true);
		try {
			const [residentRows, monthlyCardRows, report] = await Promise.all([
				listResidents({ token }, search || undefined),
				listRfidCards({ token }, { card_type: 'monthly' }),
				getRevenueReport(
					{ token },
					{
						from_date: toIsoStartOfDay(fromDate),
						to_date: toIsoEndOfDay(toDate),
						limit: 25
					}
				)
			]);

			setResidents(residentRows);
			setMonthlyCards(monthlyCardRows);
			setRevenueReport(report);
			setMessage('Đã tải dữ liệu admin thành công');
		} catch (loadError) {
			setMessage(loadError instanceof Error ? loadError.message : 'Tải dữ liệu admin thất bại');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadDashboard();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const createResidentAndCard = async () => {
		if (!fullName || !apartmentNo || !plateNumber || !uid || !startedAt || !expiresAt) {
			setMessage('Thiếu dữ liệu để tạo cư dân và cấp thẻ tháng');
			return;
		}

		setCreateBusy(true);
		try {
			const resident = await createResident(
				{
					full_name: fullName,
					phone: phone || undefined,
					apartment_no: apartmentNo,
					is_active: true
				},
				{ token }
			);

			const vehicle = await createVehicle(
				{
					resident_id: resident._id,
					vehicle_type: vehicleType,
					plate_number: plateNumber
				},
				{ token }
			);

			await createRfidCard(
				{
					uid,
					vehicle_id: vehicle._id,
					card_type: 'monthly',
					monthly_fee: Number(monthlyFee),
					monthly_started_at: new Date(startedAt).toISOString(),
					monthly_expires_at: new Date(expiresAt).toISOString(),
					is_active: true
				},
				{ token }
			);

			setMessage(`Đã tạo cư dân ${resident.full_name} và cấp thẻ tháng thành công`);
			setFullName('');
			setPhone('');
			setApartmentNo('');
			setPlateNumber('');
			setUid('');
			setMonthlyFee('0');
			setStartedAt('');
			setExpiresAt('');
			await loadDashboard();
		} catch (createError) {
			setMessage(createError instanceof Error ? createError.message : 'Tạo cư dân/cấp thẻ thất bại');
		} finally {
			setCreateBusy(false);
		}
	};

	const createOperatorAccount = async () => {
		if (!operatorUsername || !operatorPassword) {
			setMessage('Thiếu username hoặc password để tạo operator');
			return;
		}

		setCreateOperatorBusy(true);
		try {
			const response = await registerUser(
				{
					username: operatorUsername,
					password: operatorPassword,
					full_name: operatorFullName || undefined,
					role: 'operator'
				},
				{ token }
			);

			setMessage(`Đã tạo operator mới: ${response.user.username}`);
			setOperatorFullName('');
			setOperatorUsername('');
			setOperatorPassword('');
		} catch (createError) {
			setMessage(createError instanceof Error ? createError.message : 'Tạo operator thất bại');
		} finally {
			setCreateOperatorBusy(false);
		}
	};

	const createSlot = async () => {
		const normalizedSlotCode = slotCode.trim();
		const parsedLevel = Number(slotLevel);

		if (!normalizedSlotCode) {
			setMessage('Thiếu mã slot để tạo slot mới');
			return;
		}

		if (!Number.isInteger(parsedLevel) || parsedLevel < 0) {
			setMessage('Level slot phải là số nguyên không âm');
			return;
		}

		setCreateSlotBusy(true);
		try {
			const createdSlot = await createParkingSlot(
				{
					slot_code: normalizedSlotCode,
					level: parsedLevel,
					slot_type: slotType
				},
				{ token }
			);

			setSlotCode('');
			setSlotLevel('0');
			setSlotType('regular');
			setMessage(`Đã tạo slot ${createdSlot.slot_code} thành công`);
		} catch (createError) {
			setMessage(createError instanceof Error ? createError.message : 'Tạo slot thất bại');
		} finally {
			setCreateSlotBusy(false);
		}
	};

	return (
		<section className="page-grid">
			<section className="grid stats-grid">
				<StatusCard label="Số cư dân" value={residents.length} description="Tổng cư dân trong hệ thống" />
				<StatusCard label="Cư dân active" value={activeResidents} description="Đang hoạt động" tone="good" />
				<StatusCard label="Thẻ tháng" value={monthlyCards.length} description="RFID monthly card" />
				<StatusCard
					label="Doanh thu đã thu"
					value={`${totalRevenue.toLocaleString('vi-VN')} VND`}
					description={`Paid transactions: ${paidTransactions}`}
					tone="good"
				/>
			</section>

			<section className="grid admin-main-layout">
				<section className="admin-function-column">
					<section className="panel">
						<header className="panel-head">
							<h2>Tạo slot đỗ xe</h2>
							<p>Admin có thể thêm slot mới trực tiếp để đồng bộ với cấu trúc bãi xe.</p>
						</header>

						<div className="triple-field-grid">
							<label className="field">
								<span>Mã slot</span>
								<input
									value={slotCode}
									onChange={(event) => setSlotCode(event.target.value.toUpperCase())}
									placeholder="A01"
								/>
							</label>
							<label className="field">
								<span>Level</span>
								<input
									type="number"
									min={0}
									value={slotLevel}
									onChange={(event) => setSlotLevel(event.target.value)}
									placeholder="0"
								/>
							</label>
							<label className="field">
								<span>Loại slot</span>
									<select
										value={slotType}
										onChange={(event) =>
											setSlotType(event.target.value as 'regular' | 'motorbike' | 'handicap')
										}
									>
									<option value="regular">Regular</option>
									<option value="motorbike">Motorbike</option>
									<option value="handicap">Handicap</option>
								</select>
							</label>
						</div>

						<div className="button-row">
							<button type="button" className="btn" onClick={() => void createSlot()} disabled={createSlotBusy}>
								{createSlotBusy ? 'Đang tạo slot...' : 'Tạo slot'}
							</button>
						</div>
					</section>

					<section className="panel">
						<header className="panel-head">
							<h2>Bộ chức năng admin</h2>
							<p>{message}</p>
						</header>

						<div className="triple-field-grid">
							<label className="field">
								<span>Tìm cư dân (tên/điện thoại/căn hộ)</span>
								<input value={search} onChange={(event) => setSearch(event.target.value)} />
							</label>
							<label className="field">
								<span>Từ ngày</span>
								<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
							</label>
							<label className="field">
								<span>Đến ngày</span>
								<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
							</label>
						</div>

						<div className="button-row">
							<button type="button" className="btn" onClick={() => void loadDashboard()} disabled={loading}>
								{loading ? 'Đang tải...' : 'Làm mới báo cáo'}
							</button>
						</div>
					</section>

					<section className="panel">
						<header className="panel-head">
							<h2>Tạo mới operator</h2>
							<p>Tạo tài khoản nhân sự vận hành, hệ thống sẽ tự redirect theo role khi đăng nhập.</p>
						</header>

						<div className="split-field-grid">
							<label className="field">
								<span>Họ tên</span>
								<input value={operatorFullName} onChange={(event) => setOperatorFullName(event.target.value)} />
							</label>
							<label className="field">
								<span>Username</span>
								<input value={operatorUsername} onChange={(event) => setOperatorUsername(event.target.value)} />
							</label>
						</div>

						<label className="field">
							<span>Mật khẩu</span>
							<input
								type="password"
								value={operatorPassword}
								onChange={(event) => setOperatorPassword(event.target.value)}
							/>
						</label>

						<div className="button-row">
							<button
								type="button"
								className="btn"
								onClick={createOperatorAccount}
								disabled={createOperatorBusy}
							>
								{createOperatorBusy ? 'Đang tạo operator...' : 'Tạo operator'}
							</button>
						</div>
					</section>

					<section className="panel">
						<header className="panel-head">
							<h2>Cấp thẻ cho cư dân mới</h2>
							<p>Tạo cư dân, tạo xe và cấp RFID monthly trong một thao tác.</p>
						</header>

						<div className="split-field-grid">
							<label className="field">
								<span>Họ tên</span>
								<input value={fullName} onChange={(event) => setFullName(event.target.value)} />
							</label>
							<label className="field">
								<span>Điện thoại</span>
								<input value={phone} onChange={(event) => setPhone(event.target.value)} />
							</label>
						</div>

						<div className="split-field-grid">
							<label className="field">
								<span>Căn hộ</span>
								<input value={apartmentNo} onChange={(event) => setApartmentNo(event.target.value)} />
							</label>
							<label className="field">
								<span>Loại xe</span>
								<select
									value={vehicleType}
									onChange={(event) =>
										setVehicleType(event.target.value as 'motorbike' | 'car')
									}
								>
									<option value="car">Ô tô</option>
									<option value="motorbike">Xe máy</option>
								</select>
							</label>
						</div>

						<div className="split-field-grid">
							<label className="field">
								<span>Biển số xe</span>
								<input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} />
							</label>
							<label className="field">
								<span>UID RFID</span>
								<input value={uid} onChange={(event) => setUid(event.target.value)} />
							</label>
						</div>

						<div className="triple-field-grid">
							<label className="field">
								<span>Phí tháng (VND)</span>
								<input
									type="number"
									min={0}
									value={monthlyFee}
									onChange={(event) => setMonthlyFee(event.target.value)}
								/>
							</label>
							<label className="field">
								<span>Bắt đầu</span>
								<input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
							</label>
							<label className="field">
								<span>Hết hạn</span>
								<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
							</label>
						</div>

						<div className="button-row">
							<button type="button" className="btn" onClick={createResidentAndCard} disabled={createBusy}>
								{createBusy ? 'Đang tạo...' : 'Tạo cư dân và cấp thẻ'}
							</button>
						</div>
					</section>
				</section>

				<section className="admin-data-column">
					<section className="panel">
						<header className="panel-head">
							<h2>Quản lý cư dân</h2>
							<p>Danh sách chi tiết để theo dõi số cư dân và trạng thái hoạt động.</p>
						</header>

						<div className="session-table-wrap">
							<table className="session-table">
								<thead>
									<tr>
										<th>Họ tên</th>
										<th>Điện thoại</th>
										<th>Căn hộ</th>
										<th>Trạng thái</th>
									</tr>
								</thead>
								<tbody>
									{residents.map((resident) => (
										<tr key={resident._id}>
											<td>{resident.full_name}</td>
											<td>{resident.phone || '-'}</td>
											<td>{resident.apartment_no}</td>
											<td>{resident.is_active ? 'Active' : 'Inactive'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					<section className="panel">
						<header className="panel-head">
							<h2>Báo cáo giao dịch gần nhất</h2>
							<p>Chi tiết doanh thu từ giao dịch đã thu tiền.</p>
						</header>
						<div className="session-table-wrap">
							<table className="session-table">
								<thead>
									<tr>
										<th>Session ID</th>
										<th>Số tiền</th>
										<th>Trạng thái</th>
										<th>Thời gian</th>
									</tr>
								</thead>
								<tbody>
									{recentTransactions.map((transaction) => (
										<tr key={transaction._id}>
											<td>{transaction.session_id}</td>
											<td>{transaction.final_amount.toLocaleString('vi-VN')} VND</td>
											<td>{transaction.payment_status}</td>
											<td>{new Date(transaction.created_at).toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				</section>
			</section>
		</section>
	);
};
