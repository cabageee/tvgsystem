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
- `executive-tracker.html` — Tracker Gantt 7 ngày với phân quyền Giám đốc/Manager/Trợ giảng

Trong giao diện trợ giảng, nút **Điểm danh hôm nay** trên thẻ học viên ghi ngày hiện tại vào buổi còn trống tiếp theo. Trợ giảng không cần mở phần chỉnh sửa ngày hoặc chuyển bàn phím sang chế độ số; nút chỉ khả dụng khi học viên chưa được điểm danh trong ngày và còn buổi học.

## Mở như ứng dụng web

Ứng dụng có thể mở trực tiếp bằng đường dẫn website trong trình duyệt; không cần tải ứng dụng từ cửa hàng hay cài đặt để sử dụng. Trên trình duyệt hỗ trợ PWA, người dùng có thể tùy chọn thêm ứng dụng vào màn hình chính để mở ở chế độ toàn màn hình.

Sau lần truy cập đầu tiên khi có mạng, trình duyệt lưu bộ khung giao diện và các trang để mở lại khi ngoại tuyến. Các thao tác đồng bộ Google Sheets và những chức năng cần dịch vụ bên ngoài vẫn cần kết nối mạng. PWA và service worker yêu cầu website chạy trên HTTPS hoặc localhost.

Giữ các file HTML, `app.js` và `app.css` trong cùng thư mục khi triển khai hoặc di chuyển ứng dụng. Trạng thái đăng nhập được giữ trong `sessionStorage` khi chuyển trang.

## Tracker điều hành

Trang `executive-tracker.html` dùng chung Google Apps Script/Google Sheet, có Gantt theo 7 ngày (Thứ 2–Chủ Nhật), bộ lọc priority 1–4, trợ giảng và trạng thái, đồng thời sắp xếp priority trước rồi deadline.

Apps Script source đã được cập nhật trong `tracker-backend.gs.txt`. Thay toàn bộ mã dự án Apps Script hiện tại bằng nội dung file này, lưu, chọn hàm `initDatabase` và bấm **Run** một lần để xác nhận quyền truy cập và chuẩn hóa các tab, rồi triển khai **New version** của Web app; giữ nguyên URL `/exec`. `initDatabase` tạo các tab còn thiếu. API đọc dữ liệu không tự định dạng/ghi lại toàn bộ sheet mỗi lần tải; nếu thiếu tab, API sẽ trả lỗi nêu rõ tên tab và hướng dẫn khởi tạo.

Quyền Tracker được kiểm tra ở Apps Script: Giám đốc gán Manager; Giám đốc tạo Priority 1; Manager giao Priority 2 hoặc tạo việc cá nhân Priority 3; Trợ giảng tạo việc cá nhân Priority 4, nhận task và gửi yêu cầu hoàn thành. Giám đốc/Manager duyệt task; chỉ Giám đốc duyệt đơn nghỉ/tăng ca. Tracker dùng token phiên hết hạn sau 6 giờ. Đăng nhập website hiện cũng xác minh thông tin qua Apps Script; thông tin mật khẩu không còn được gửi về giao diện trong danh sách trợ giảng/dữ liệu khởi tạo.

Trợ giảng chỉ nhận task được giao và đơn lịch của chính mình. Manager xem toàn bộ task/đơn trong Tracker và có thể duyệt task; Giám đốc quản lý Manager và duyệt lịch nghỉ/tăng ca. Excel lịch dùng thư viện tải khi người dùng chọn Export Excel.

Lối vào được tách theo vai trò: Giám đốc mở **Tracking Giám đốc** từ thanh điều hướng quản trị; task cá nhân được nhúng trực tiếp trong giao diện điểm danh của từng trợ giảng, nơi họ nhận việc, ghi chú và gửi yêu cầu hoàn thành; Manager được cấu hình trong Apps Script/Sheet có thêm nút riêng **Tracking Manager**. Apps Script trả tên Manager hiện tại trong cấu hình không nhạy cảm để website chỉ hiện đúng nút. Phiên Tracker được cấp khi đăng nhập website nên không cần đăng nhập lần hai; API vẫn xác minh vai trò và chỉ trả trợ giảng nhiệm vụ được giao.

Lưu ý giới hạn bảo mật của kiến trúc hiện tại: GitHub Pages gọi Apps Script bằng JSONP nên thông tin đăng nhập được gửi trong query của HTTPS request, không phải POST. Ngoài ra, các API dữ liệu học viên cũ vẫn chưa yêu cầu phiên đăng nhập; phần phân quyền mới bảo vệ các thao tác Tracker, không đồng nghĩa toàn bộ API đã được khóa. Nếu cần bảo vệ dữ liệu toàn hệ thống, cần chuyển API sang backend/proxy có xác thực và POST trước khi dùng dữ liệu nhạy cảm.

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