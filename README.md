# tvgsystem

## Giao diện theo từng trang

Mỗi mục điều hướng có một URL HTML riêng và chỉ tải nội dung của trang đó. Các trang dùng chung `app.js` và `app.css`:

- `index.html` — Tổng quan
- `profiles.html` — Hồ sơ học viên
- `assignments.html` — Phân công trợ giảng
- `attendance.html` — Điểm danh của giám đốc
- `daily-summary.html` — Tổng kết điểm danh hôm nay
- `inactive-students.html` — Học viên đã nghỉ
- `teachers.html` — Quản lý trợ giảng
- `levels.html` — Quản lý cấp độ lớp
- `teacher-attendance.html` — Điểm danh lớp của trợ giảng
- `change-password.html` — Đổi mật khẩu

## Mở như ứng dụng web

Ứng dụng có thể mở trực tiếp bằng đường dẫn website trong trình duyệt; không cần tải ứng dụng từ cửa hàng hay cài đặt để sử dụng. Trên trình duyệt hỗ trợ PWA, người dùng có thể tùy chọn thêm ứng dụng vào màn hình chính để mở ở chế độ toàn màn hình.

Sau lần truy cập đầu tiên khi có mạng, trình duyệt lưu bộ khung giao diện và các trang để mở lại khi ngoại tuyến. Các thao tác đồng bộ Google Sheets và những chức năng cần dịch vụ bên ngoài vẫn cần kết nối mạng. PWA và service worker yêu cầu website chạy trên HTTPS hoặc localhost.

Giữ các file HTML, `app.js` và `app.css` trong cùng thư mục khi triển khai hoặc di chuyển ứng dụng. Trạng thái đăng nhập được giữ trong `sessionStorage` khi chuyển trang.

## Thông báo sinh nhật

Khi đăng nhập vào website, ứng dụng hiển thị danh sách sinh nhật trong 3 ngày tới. Thông báo chỉ hiện một lần mỗi ngày trên trình duyệt đó; đồng bộ dữ liệu học viên cũng cập nhật danh sách khi website đang mở. Đây là thông báo trong ứng dụng, không phải Web Push, nên không yêu cầu cấp quyền thông báo hay máy chủ Node riêng.

Nút **Thông báo** trên thanh đầu trang mở lịch sử tối đa 30 thông báo gần nhất, gồm thông báo nhanh và nhắc sinh nhật, được lưu riêng trên trình duyệt đang dùng. Số huy hiệu cho biết có bao nhiêu mục chưa xem.

Thông báo nhanh (toast) được đặt cao hơn vùng cạnh dưới trên điện thoại để tránh bị che bởi thanh điều hướng hoặc vùng an toàn của thiết bị.

## CSS và thư viện xuất file

Tailwind được biên dịch thành `tailwind.css` để các trang không phải tải Tailwind CDN lúc mở trang. Khi thêm hoặc đổi utility class trong HTML/`app.js`, chạy:

```sh
npm install
npm run build:css
```

Giữ `tailwind.css` cùng thư mục với các trang HTML khi triển khai. Thư viện Excel, PNG và PDF chỉ được tải khi người dùng chọn chức năng xuất tương ứng.

## Kiểm tra cú pháp

Chạy `npm test` để kiểm tra `app.js` và các script nội tuyến trên tất cả trang HTML.

## Avatar học viên trên Google Drive

Avatar được lưu vào Google Drive bằng chính Apps Script đang đồng bộ Google Sheet. Phần mã Apps Script đã được thêm vào file `code.gs.txt` bạn gửi.

1. Mở dự án Apps Script hiện tại và cập nhật mã bằng phiên bản trong `code.gs.txt`.
2. (Tuỳ chọn) Đặt ID thư mục Drive muốn dùng vào `AVATAR_FOLDER_ID`. Để trống sẽ lưu vào Drive của tài khoản triển khai.
3. Cấp quyền Drive khi Apps Script yêu cầu.
4. Vào **Deploy → Manage deployments**, chỉnh sửa deployment Web app hiện tại và chọn **New version**. Giữ quyền **Execute as: Me** và quyền truy cập cho người dùng website.
5. Giữ nguyên URL `/exec` hiện có; website đã gửi upload tới cùng URL này.

Web app tạo file ảnh công khai bằng quyền “Anyone with the link” để avatar hiển thị trên website. Endpoint kiểm tra định dạng PNG/JPEG/WebP và giới hạn dung lượng 5 MB. Vì deployment được gọi từ website, người có URL web app có thể gửi ảnh lên Drive.

Avatar cũ đang trỏ đến Supabase không được di chuyển tự động. Sau khi deploy endpoint mới, tải lại các avatar cũ từ thẻ hồ sơ bằng nút **Đổi avatar**.