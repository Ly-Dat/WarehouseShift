import { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../public/css/Login.css";
import { FiEye, FiEyeOff } from "react-icons/fi";

function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const toggleShowPassword = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="container-fluid vh-100 vw-100 p-0 m-0">
      <div className="row h-100 m-0">
        <div
          className="d-none d-md-block col-md-6 p-0 bg-image"
          style={{
            backgroundImage: "url('/img/background_chen_su.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            height: "100%",
          }}
        >
          <div className="overlay d-flex align-items-center justify-content-center h-100">
            <h1 className="text-white display-4 fw-bold">Gốm Sứ Tân Chí Tài</h1>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="col-12 col-md-6 d-flex align-items-center justify-content-center bg-light p-0">
          <div
            className="login-form p-4 p-md-5 bg-white rounded shadow-lg w-100"
            style={{ maxWidth: "400px" }}
          >
            <h2 className="text-center mb-4 text-dark fw-bold">Đăng Nhập</h2>
            <div className="mb-3">
              <label
                htmlFor="username"
                className="form-label fw-bold text-secondary"
              >
                Tên đăng nhập
              </label>
              <input
                type="text"
                className="form-control"
                id="username"
                placeholder="Nhập tên đăng nhập"
              />
            </div>
            <div className="mb-3 position-relative">
              <label
                htmlFor="password"
                className="form-label fw-bold text-secondary"
              >
                Mật khẩu
              </label>
              <input
                type={showPassword ? "text" : "password"}
                className="form-control"
                id="password"
                placeholder="Nhập mật khẩu"
              />
              <span
                onClick={toggleShowPassword}
                role="button"
                tabIndex={0}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    toggleShowPassword();
                  }
                }}
                style={{
                  position: "absolute",
                  right: "15px",
                  top: "70%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  color: "#b4b4b4ff",
                  userSelect: "none",
                }}
              >
                {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
              </span>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-3">
              <button type="button" className="btn btn-primary btn-ceramic">
                Đăng Nhập
              </button>
              <a href="#" className="text-decoration-none text-primary">
                Quên mật khẩu?
              </a>
            </div>
            <p className="text-center text-secondary">
              Chưa có tài khoản?
              <a
                href="#"
                className="text-decoration-none text-primary fw-semibold"
              >
                Đăng ký
              </a>
              <span className="mx-2 text-muted">|</span>
              <a
                href="/"
                className="text-decoration-none text-primary fw-semibold"
              >
                Trang chủ
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
