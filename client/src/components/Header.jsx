import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../public/css/Component.css";
import {
  FaPhone,
  FaMapMarkerAlt,
  FaShoppingCart,
  FaFacebook,
  FaSearch,
  FaBars,
  FaChevronRight,
} from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
// import { SiZalo } from "react-icons/si";

const Header = () => {
  const categories = [
    "Sen",
    "Cá Hóa Long",
    "Cò",
    "Gà",
    "Hạc",
    "Hủ",
    "Lân",
    "Nhật Nguyệt",
    "Phụng",
    "Rồng",
    "Châu",
  ];
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <header
      style={{ background: "linear-gradient(90deg, #d97706, #e6b811ff)" }}
      className="text-white shadow-lg"
    >
      {/* Top bar */}
      <div style={{ backgroundColor: "#000000" }} className="py-2">
        <div className="container d-flex justify-content-between align-items-center">
          <div
            className="d-flex align-items-center gap-md-5 gap-3"
            style={{ fontSize: "0.875rem" }}
          >
            <span className="d-flex align-items-center gap-1">
              <a
                href="https://maps.app.goo.gl/awKkH4Y6q5meFwBn9"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#ffffffff",
                  textDecoration: "none",
                  fontWeight: "normal",
                }}
              >
                <FaMapMarkerAlt size={15} /> 101/3, khu phố Đông Tư, Lái Thiêu,
                Thuận An
              </a>
            </span>

            <span className="d-flex align-items-center gap-1">
              <a
                href="mailto:lydat1502@gmail.com"
                style={{
                  color: "#ffffffff",
                  textDecoration: "none",
                  fontWeight: "normal",
                }}
              >
                <MdEmail size={18} /> lydat1502@gmail.com
              </a>
            </span>

            <span className="d-flex align-items-center gap-1">
              <a
                href="tel:0865902484"
                style={{
                  color: "#ffffffff",
                  textDecoration: "none",
                  fontWeight: "normal",
                }}
              >
                <FaPhone size={15} /> 0865 902 484
              </a>
            </span>
            <span className="d-flex align-items-center gap-1">
              <a
                href="https://www.facebook.com/ly.at.130881/"
                style={{
                  color: "#ffffffff",
                  textDecoration: "none",
                  fontWeight: "normal",
                }}
              >
                <FaFacebook size={18} /> Lý Đạt
              </a>
            </span>
          </div>
          <div className="d-flex gap-1">
            <button
              onClick={() => navigate("/login")}
              className="text-white text-decoration-none hover-text-light"
              style={{
                transition: "color 0.3s",
                background: "transparent",
                border: "none",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/login")}
              className="text-white text-decoration-none hover-text-light"
              style={{
                transition: "color 0.3s",
                background: "transparent",
                border: "none",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container py-4 d-flex align-items-center justify-content-between">
        {/* Logo */}
        <div className="fs-3 fw-bold">
          <a
            href="/"
            className="text-white text-decoration-none hover-text-light"
            style={{ transition: "color 0.3s" }}
          >
            <img src="/img/logo1.png" alt="logo" style={{ height: "130px" }} />
          </a>
        </div>

        {/* Search bar */}
        <div className="w-50 mx-3">
          <div className="input-group">
            <input
              type="text"
              className="form-control rounded-pill"
              placeholder="Tìm kiếm..."
              style={{
                borderColor: "#b35900",
                backgroundColor: "#fff",
                color: "#333",
              }}
            />
            <button
              className="btn btn-outline-light rounded-circle position-absolute end-0 top-50 translate-middle-y"
              style={{
                zIndex: 10,
                backgroundColor: "#d97706",
                borderColor: "#d97706",
              }}
            >
              <FaSearch />
            </button>
          </div>
        </div>

        {/* Phone */}
        <div
          className="d-flex align-items-center border border-white rounded p-2 hover-bg-dark"
          style={{ maxWidth: "200px", transition: "background-color 0.3s" }}
        >
          <div className="me-3">
            <FaPhone size={30} />
          </div>
          <div>
            <div className="fw-bold" style={{ fontSize: "0.9rem" }}>
              Số điện thoại
            </div>
            <a
              href="tel:0865902484"
              className="text-white text-decoration-none hover-text-light"
              style={{ fontSize: "0.85rem", transition: "color 0.3s" }}
            >
              0865 902 484
            </a>
          </div>
        </div>

        {/* Address */}
        <div
          className="d-flex align-items-center border border-white rounded p-2 hover-bg-dark"
          style={{ maxWidth: "200px", transition: "background-color 0.3s" }}
        >
          <div className="me-2">
            <FaMapMarkerAlt size={30} />
          </div>
          <div>
            <div className="fw-bold" style={{ fontSize: "0.9rem" }}>
              Địa chỉ
            </div>
            <a
              href="https://maps.app.goo.gl/awKkH4Y6q5meFwBn9"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white text-decoration-none hover-text-light"
              style={{ fontSize: "0.85rem", transition: "color 0.3s" }}
            >
              Google Map
            </a>
          </div>
        </div>

        {/* Cart */}
        <div className="position-relative">
          <button
            className="btn btn-outline-light d-flex align-items-center gap-1 hover-bg-dark"
            style={{ transition: "background-color 0.3s" }}
          >
            <FaShoppingCart size={20} />
            <span>Giỏ hàng</span>
          </button>
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            100
          </span>
        </div>
      </div>

      <nav style={{ backgroundColor: "#b35900" }} className="py-2">
        <div className="container">
          {/* Nút menu chỉ hiện trên mobile */}
          <div className="d-flex justify-content-between align-items-center d-lg-none ">
            <span className="fw-bold text-white">DANH MỤC SẢN PHẨM</span>
            <button
              className="btn text-white"
              onClick={() => setOpenMenu(!openMenu)}
            >
              <FaBars size={22} />
            </button>
          </div>

          {/* Desktop menu */}
          <ul className="nav justify-content-center d-none d-lg-flex">
            {categories.map((category, index) => (
              <li key={index} className="nav-item">
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/?category=${category}`);
                  }}
                  href="#"
                  className="nav-link text-white fw-medium hover-text-light"
                  style={{ transition: "color 0.3s", cursor: "pointer" }}
                >
                  {category}
                </a>
              </li>
            ))}
          </ul>

          {/* Mobile dropdown menu */}

          {openMenu && (
            <ul className="list-group d-lg-none mt-2">
              {categories.map((category, index) => (
                <li
                  key={index}
                  className="list-group-item d-flex justify-content-between align-items-center fw-bold"
                  style={{
                    transition: "background-color 0.3s, color 0.3s",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#d8f5f6ff";
                    e.currentTarget.style.color = "#b35900";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "";
                    e.currentTarget.style.color = "";
                  }}
                >
                  {category}
                  <FaChevronRight className="text-muted" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Header;
