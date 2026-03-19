# PARKING IoT — Ghi chu Database

---

## Bang `users`
Luu tai khoan dang nhap cua nhan vien van hanh he thong.

- `_id` — ObjectId do MongoDB sinh.
- `username` — Ten dang nhap, unique.
- `password` — Mat khau da bam, khong luu plaintext.
- `full_name` — Ho ten hien thi.
- `role` — Phan quyen: `admin` hoac `operator`.
- `is_active` — Vo hieu hoa tai khoan ma khong can xoa.
- `created_at` — Thoi diem tao tai khoan.

---

## Bang `residents`
Luu thong tin cu dan trong toa nha/chung cu.

- `_id` — ObjectId do MongoDB sinh.
- `full_name` — Ho ten cu dan.
- `phone` — So dien thoai lien he (co the de trong).
- `apartment_no` — So can ho.
- `is_active` — Trang thai con hieu luc cua cu dan.
- `created_at` — Thoi diem tao ban ghi.

---

## Bang `vehicles`
Luu thong tin xe, lien ket voi cu dan (neu co).

- `_id` — ObjectId do MongoDB sinh.
- `resident_id` — FK toi `residents` (co the null voi xe vang lai).
- `vehicle_type` — `motorbike` hoac `car`.
- `plate_number` — Bien so xe, unique, luu uppercase.
- `created_at` — Thoi diem tao ban ghi.

---

## Bang `rfid_cards`
Luu the RFID va thong tin dang ky the cho xe.

- `_id` — ObjectId do MongoDB sinh.
- `uid` — Ma the RFID, unique, luu uppercase.
- `vehicle_id` — FK toi `vehicles` (hien tai unique 1 the/1 xe).
- `card_type` — `monthly` hoac `guest`.
- `is_active` — Khoa/mo the tam thoi.
- `monthly_fee` — Phi thang (ap dung cho the thang, co the null).
- `monthly_started_at` — Ngay bat dau chu ky thang.
- `monthly_expires_at` — Ngay het han chu ky thang.
- `issued_at` — Thoi diem cap the.

---

## Bang `pricing_policies`
Luu chinh sach tinh phi theo loai xe va loai the.

- `_id` — ObjectId do MongoDB sinh.
- `vehicle_type` — `motorbike` hoac `car`.
- `card_type` — `monthly` hoac `guest`.
- `price_per_hour` — Don gia theo gio.
- `free_minutes` — So phut mien phi.
- `is_active` — Chinh sach dang duoc ap dung.
- `effective_from` — Moc thoi gian bat dau hieu luc.

---

## Bang `parking_sessions`
Ghi lai tung phien gui xe vao/ra bai. Day la bang trung tam cua luong xu ly.

- `_id` — ObjectId do MongoDB sinh.
- `vehicle_id` — FK toi `vehicles`.
- `rfid_card_id` — FK toi `rfid_cards`.
- `status` — `active`, `completed`, `blocked`.
- `entry_time` — Thoi diem xe vao.
- `exit_time` — Thoi diem xe ra (null neu xe chua ra).
- `duration_minutes` — Tong so phut gui.
- `entry_plate_text` — Bien so OCR tai cong vao.
- `exit_plate_text` — Bien so OCR tai cong ra.
- `entry_plate_confidence` — Do tin cay OCR cong vao (0-100).
- `exit_plate_confidence` — Do tin cay OCR cong ra (0-100).
- `entry_image_url` — Link anh chup cong vao.
- `exit_image_url` — Link anh chup cong ra.
- `is_plate_mismatch` — Co sai lech bien so vao/ra hay khong.
- `created_at` — Thoi diem tao ban ghi.

---

## Bang `transactions`
Luu ket qua thanh toan cua moi phien gui xe.

- `_id` — ObjectId do MongoDB sinh.
- `session_id` — FK toi `parking_sessions` (unique, 1 phien/1 giao dich).
- `vehicle_id` — FK toi `vehicles`.
- `rfid_card_id` — FK toi `rfid_cards`.
- `pricing_policy_id` — FK toi `pricing_policies` (co the null neu tinh phi thu cong).
- `amount` — So tien tinh toan ban dau.
- `final_amount` — So tien thuc thu sau dieu chinh.
- `payment_status` — `pending`, `paid`, `failed`, `waived`.
- `paid_at` — Thoi diem thanh toan thanh cong.
- `created_at` — Thoi diem tao giao dich.

---

## Luong thuc thi chinh

### 1. Xe vao bai
1. Dau doc quet the -> lay `uid`.
2. Tra bang `rfid_cards` theo `uid`:
   - Khong tim thay hoac `is_active = false` -> tu choi.
3. Lay `vehicle_id` tu the va tao ban ghi moi trong `parking_sessions` voi:
   - `status = active`
   - `entry_time = now()`
   - `exit_time = null`
4. Neu co camera ANPR, luu `entry_plate_text`, `entry_plate_confidence`, `entry_image_url`.
5. Mo barrier cong vao.

### 2. Xe ra bai
1. Quet the -> lay `uid` va tim `rfid_card_id`.
2. Tim phien `active` trong `parking_sessions` theo `rfid_card_id`.
3. Tinh `duration_minutes = now() - entry_time`.
4. Tra `pricing_policies` theo `vehicle_type` + `card_type` (chi lay ban ghi `is_active = true`).
5. Tinh `amount`/`final_amount` theo quy tac nghiep vu.
6. Tao `transactions` voi trang thai thanh toan phu hop (`paid`, `pending`, `failed`, `waived`).
7. Cap nhat `parking_sessions`:
   - `exit_time`
   - `duration_minutes`
   - `status = completed` hoac `blocked` neu vi pham/chua xu ly duoc
   - Cap nhat thong tin ANPR luc ra + `is_plate_mismatch` neu can.
8. Mo barrier cong ra neu dat dieu kien nghiep vu.

### 3. Quan ly cu dan/xe/the
- Tao/sua `residents`.
- Dang ky `vehicles` cho cu dan, chuan hoa `plate_number`.
- Cap `rfid_cards`, doi `card_type`, khoa/mo the qua `is_active`.
- Quan ly chu ky the thang qua `monthly_started_at`, `monthly_expires_at`, `monthly_fee`.

### 4. Quan ly chinh sach gia
- Tao hoac cap nhat `pricing_policies` theo `vehicle_type` + `card_type`.
- Su dung co `is_active` + `effective_from` de dieu phoi chinh sach dang hieu luc.
- Khong xoa lich su giao dich cu de dam bao doi soat.