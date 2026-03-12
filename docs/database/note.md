# PARKING IoT — Ghi chú Database

---

## Bảng `users`
Lưu tài khoản đăng nhập của nhân viên vận hành hệ thống.

- `id` — Khoá chính, tự tăng.
- `username` — Tên đăng nhập, không trùng lặp.
- `password` — Mật khẩu đã được băm bằng bcrypt, không lưu plaintext.
- `full_name` — Họ tên hiển thị.
- `role` — Phân quyền: `admin` có toàn quyền, `operator` chỉ vận hành cổng.
- `is_active` — Vô hiệu hoá tài khoản mà không cần xoá.
- `created_at` — Ghi nhận thời điểm tạo tài khoản.

---

## Bảng `rfid_cards`
Lưu thông tin thẻ RFID và chủ xe đã đăng ký với hệ thống.

- `id` — Khoá chính, tự tăng.
- `uid` — Chuỗi hex đọc từ đầu đọc RC522, định danh duy nhất của thẻ vật lý.
- `owner_name` / `owner_phone` — Thông tin liên hệ chủ xe.
- `vehicle_type` — `motorbike` hoặc `car`, dùng để tra bảng giá.
- `plate_number` — Biển số xe, có thể dùng để đối chiếu camera nếu mở rộng sau.
- `card_type` — `monthly` (thuê tháng, không tính phí theo giờ) hoặc `guest` (vãng lai, tính phí bình thường).
- `balance` — Số dư nạp sẵn; hệ thống trừ tự động khi xe ra.
- `is_active` — Khoá thẻ tạm thời mà không xoá lịch sử.
- `created_at` — Thời điểm đăng ký thẻ.

---

## Bảng `parking_sessions`
Ghi lại từng lượt xe vào/ra bãi. Đây là bảng trung tâm của luồng thực thi.

- `id` — Khoá chính, tự tăng.
- `rfid_card_id` — FK trỏ đến thẻ RFID đã quẹt.
- `gate_type_entry` — Cổng quẹt: `IN` khi vào, `OUT` khi ra.
- `entry_time` — Thời điểm xe vào, ghi ngay khi quẹt thẻ ở cổng IN.
- `exit_time` — Thời điểm xe ra; giữ `NULL` khi xe còn trong bãi. Khi `exit_time` có giá trị, phiên coi như hoàn tất.
- `duration_minutes` — Tổng số phút gửi, tính bằng `exit_time - entry_time`, điền sau khi xe ra.
- `status` — `active` trong khi xe còn gửi; chuyển sang `completed` khi xe ra và thanh toán xong.
- `created_at` — Thời điểm tạo bản ghi.

---

## Bảng `pricing_config`
Cấu hình đơn giá áp dụng cho từng loại xe. Admin chỉnh sửa qua dashboard.

- `id` — Khoá chính, tự tăng.
- `vehicle_type` — `motorbike` hoặc `car`, khớp với trường cùng tên ở `rfid_cards`.
- `price_per_hour` — Đơn giá tính theo giờ (VND).
- `free_minutes` — Số phút đầu miễn phí (mặc định 15 phút). Xe ra trước thời gian này không bị tính tiền.
- `is_active` — Cho phép nhiều bản ghi cấu hình tồn tại, chỉ bản ghi `is_active = true` được dùng để tính tiền.
- `updated_at` — Ghi nhận lần chỉnh giá gần nhất.

---

## Bảng `transactions`
Ghi lại kết quả thanh toán sau khi phiên gửi xe hoàn tất.

- `id` — Khoá chính, tự tăng.
- `session_id` — FK trỏ đến `parking_sessions`, liên kết giao dịch với phiên cụ thể.
- `rfid_card_id` — FK trỏ trực tiếp đến thẻ để truy vấn lịch sử nhanh mà không cần JOIN qua session.
- `amount` — Số tiền tính theo công thức: `(duration_minutes - free_minutes) / 60 × price_per_hour`.
- `final_amount` — Số tiền thực thu (có thể bằng 0 nếu xe ra trong free_minutes, hoặc điều chỉnh theo chính sách).
- `payment_status` — `paid` khi trừ balance thành công; `pending` nếu chưa đủ số dư.
- `paid_at` — Thời điểm giao dịch thành công.
- `created_at` — Thời điểm tạo bản ghi giao dịch.

---

## Luồng thực thi chính

### 1. Xe vào bãi
1. Đầu đọc RC522 quét thẻ → lấy `uid`.
2. Tra bảng `rfid_cards` theo `uid`:
   - Không tìm thấy hoặc `is_active = false` → từ chối, báo lỗi.
3. Tạo bản ghi mới trong `parking_sessions` với `entry_time = now()`, `status = active`, `exit_time = NULL`.
4. Mở barrier cổng vào.

### 2. Xe ra bãi
1. Đầu đọc RC522 quét thẻ → lấy `uid`.
2. Tra `rfid_cards` → lấy `rfid_card_id` và `vehicle_type`.
3. Tìm phiên `active` tương ứng trong `parking_sessions` theo `rfid_card_id`.
4. Tính `duration_minutes = now() - entry_time`.
5. Tra `pricing_config` theo `vehicle_type` (lấy bản ghi `is_active = true`).
6. Tính phí:
   - Nếu `duration_minutes ≤ free_minutes` → `final_amount = 0`.
   - Ngược lại → `final_amount = ceil((duration_minutes - free_minutes) / 60) × price_per_hour`.
7. Kiểm tra `balance` trong `rfid_cards`:
   - Đủ tiền → trừ `balance`, tạo `transactions` với `payment_status = paid`.
   - Không đủ → tạo `transactions` với `payment_status = pending`, cảnh báo operator.
8. Cập nhật `parking_sessions`: điền `exit_time`, `duration_minutes`, chuyển `status = completed`.
9. Mở barrier cổng ra.

### 3. Nạp tiền / Quản lý thẻ
- Admin/operator tra cứu thẻ qua `uid` hoặc `plate_number`.
- Cập nhật `balance` trực tiếp trên bảng `rfid_cards`.
- Khoá/mở thẻ bằng cờ `is_active`.

### 4. Thay đổi bảng giá
- Admin tạo bản ghi mới trong `pricing_config` với giá mới, set `is_active = true`.
- Đặt `is_active = false` cho bản ghi cũ.
- Không xoá lịch sử → `transactions` cũ vẫn phản ánh giá tại thời điểm thanh toán qua `final_amount`.