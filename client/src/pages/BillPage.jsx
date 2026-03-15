import { useEffect, useState, useCallback } from "react";
import {
  Phone,
  MessageCircle,
  ShoppingCart,
  FileText,
  X,
  Download,
  ChevronUp,
} from "lucide-react";

// ── Giữ nguyên hoàn toàn từ code gốc ──────────────────────
const SHEET_URL = import.meta.env.VITE_SHEET_URL;
const CACHE_KEY = "banggia_products";
const CACHE_TIME = "banggia_products_time";
const CACHE_DURATION = 10 * 60 * 1000;

const removeVietnameseTones = (str) =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const parseCSVRow = (row) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
};
// ──────────────────────────────────────────────────────────

// Load jsPDF từ CDN (lazy)
const loadJsPDF = () =>
  new Promise((res) => {
    if (window.jspdf) return res();
    const s1 = document.createElement("script");
    s1.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = res;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });

// Lấy số nguyên từ chuỗi giá "25,000" → 25000
const rawNum = (str) => parseInt((str || "").replace(/[^\d]/g, ""), 10) || 0;

// Phân tích biểu thức số lượng:
//   "3x40"  → multiplier = 120  (3 × 40)
//   "5"     → multiplier = 5
//   "2x3x4" → multiplier = 24
//   ""      → multiplier = 0
const parseQtyExpr = (str) => {
  if (!str || str.trim() === "") return 0;
  // chuẩn hoá: x, X, × đều thành *
  const s = str.trim().replace(/[xX×✕]/g, "*");
  const parts = s.split("*").map((p) => parseInt(p.trim(), 10));
  if (parts.some(isNaN) || parts.length === 0) return 0;
  return parts.reduce((a, b) => a * b, 1);
};

// ── Skeleton ───────────────────────────────────────────────
function SkeletonRow() {
  const skel = (w) => (
    <span
      style={{
        display: "inline-block",
        width: w,
        height: 13,
        borderRadius: 4,
        background:
          "linear-gradient(90deg,#f0e8dc 25%,#e8ddd0 50%,#f0e8dc 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
      }}
    />
  );
  return (
    <tr style={{ borderBottom: "1px solid #f0e8dc" }}>
      <td style={{ padding: "12px 10px" }}>{skel(20)}</td>
      <td style={{ padding: "12px 10px" }}>{skel("65%")}</td>
      <td style={{ padding: "12px 10px", textAlign: "center" }}>{skel(32)}</td>
      <td style={{ padding: "12px 10px", textAlign: "right" }}>{skel(90)}</td>
      <td style={{ padding: "12px 10px", textAlign: "center" }}>{skel(80)}</td>
    </tr>
  );
}

// ── Qty Popup ──────────────────────────────────────────────
function QtyPopup({ productName, expr, onSave, onClose }) {
  const [draft, setDraft] = useState(expr || "");
  const multiplier = parseQtyExpr(draft);
  const isExpr = draft
    .trim()
    .replace(/\s/g, "")
    .match(/[xX×*]/);
  const valid = draft.trim() !== "" && multiplier > 0;

  const commit = () => {
    onSave(valid ? draft.trim() : "");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 320,
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg,#2c1a0e,#5c3317)",
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#e8c98a",
                opacity: 0.75,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 3,
              }}
            >
              Nhập số lượng
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                maxWidth: 230,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {productName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "rgba(255,255,255,.12)",
              borderRadius: 6,
              cursor: "pointer",
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 18px 14px" }}>
          <div style={{ fontSize: 12, color: "#7a6050", marginBottom: 10 }}>
            Nhập số hoặc biểu thức nhân —
            <span style={{ color: "#b5915a", fontWeight: 600 }}>
              vd: 5 &nbsp;hoặc&nbsp; 3x40
            </span>
          </div>

          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) commit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="vd: 3x40"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "2px solid #d9c9b0",
              borderRadius: 10,
              fontFamily: "inherit",
              fontSize: 20,
              fontWeight: 700,
              color: "#2c1a0e",
              textAlign: "center",
              outline: "none",
              letterSpacing: 1,
              transition: "border-color .15s",
              backgroundColor: "#fff",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#b5915a";
              e.target.style.boxShadow = "0 0 0 3px rgba(181,145,90,.2)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#d9c9b0";
              e.target.style.boxShadow = "none";
            }}
          />

          {/* Live preview */}
          <div
            style={{
              marginTop: 10,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {draft.trim() && valid ? (
              <div
                style={{
                  background: "#fdf3e3",
                  border: "1px solid #e8c98a",
                  borderRadius: 8,
                  padding: "4px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#5c3317",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={{ color: "#b5915a" }}>{draft.trim()}</span>
                {isExpr && (
                  <>
                    <span style={{ color: "#c9a97a", fontWeight: 400 }}>=</span>
                    <span>{multiplier.toLocaleString("vi-VN")}</span>
                  </>
                )}
                <span
                  style={{ color: "#a08060", fontWeight: 400, fontSize: 11 }}
                >
                  cái
                </span>
              </div>
            ) : draft.trim() && !valid ? (
              <span style={{ fontSize: 12, color: "#e05c3a" }}>
                Biểu thức không hợp lệ
              </span>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "0 18px 18px", display: "flex", gap: 8 }}>
          {expr && (
            <button
              onClick={() => onSave("")}
              style={{
                flex: "0 0 auto",
                padding: "9px 12px",
                border: "1.5px solid #f5d5cc",
                background: "#fff8f6",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: "#c0604a",
                cursor: "pointer",
              }}
            >
              Xoá
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "9px",
              border: "1.5px solid #d9c9b0",
              background: "#fff",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              color: "#7a6050",
              cursor: "pointer",
            }}
          >
            Huỷ
          </button>
          <button
            onClick={commit}
            disabled={!valid}
            style={{
              flex: 1,
              padding: "9px",
              background: valid
                ? "linear-gradient(135deg,#b5915a,#8b6940)"
                : "#d9c9b0",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              cursor: valid ? "pointer" : "not-allowed",
            }}
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Smart Qty Cell ─────────────────────────────────────────
function QtyCtrl({ productName, expr, onChangeExpr }) {
  const [open, setOpen] = useState(false);
  const multiplier = parseQtyExpr(expr);
  const hasValue = multiplier > 0;
  const isExpr = expr && expr.replace(/\s/g, "").match(/[xX×*]/);

  return (
    <>
      {hasValue ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: "5px 10px",
            borderRadius: 8,
            border: "1.5px solid #b5915a",
            background: "#fffbf5",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            fontSize: 12,
            fontWeight: 700,
            color: "#5c3317",
          }}
        >
          {isExpr ? (
            <>
              <span style={{ color: "#b5915a" }}>{expr}</span>
              <span style={{ color: "#c9a97a", fontWeight: 400, fontSize: 11 }}>
                =
              </span>
              <span>{multiplier.toLocaleString("vi-VN")}</span>
            </>
          ) : (
            <span style={{ color: "#b5915a" }}>{expr}</span>
          )}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="qty-add-btn"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1.5px dashed #c9a97a",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .15s",
            color: "rgb(232, 201, 138)",
            fontWeight: "bold",
            fontSize: "18px",
          }}
        >
          +
        </button>
      )}

      {open && (
        <QtyPopup
          productName={productName}
          expr={expr}
          onSave={(v) => {
            onChangeExpr(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Bill Modal ─────────────────────────────────────────────
// items: [{ ...product, _expr: "3x40", _qty: 120 }]
function BillModal({ items, onClose, onExportPDF }) {
  const [custName, setCustName] = useState("");
  const [custNote, setCustNote] = useState("");
  const now = new Date();
  const dateStr = `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
  const total = items.reduce(
    (s, p) => s + rawNum(p["Đơn Giá (Đồng)"]) * p._qty,
    0,
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid #f0e8dc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 17, color: "#2c1a0e" }}>
            Xuất Hóa Đơn
          </span>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "#a08060",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Inputs */}
        <div style={{ padding: "14px 22px 0" }}>
          {[
            {
              label: "Họ tên khách hàng",
              val: custName,
              set: setCustName,
              ph: "Nhập tên khách hàng...",
            },
            {
              label: "Địa chỉ / Ghi chú",
              val: custNote,
              set: setCustNote,
              ph: "Địa chỉ hoặc ghi chú...",
            },
          ].map(({ label, val, set, ph }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#5c3317",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {label}
              </label>
              <input
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1.5px solid #d9c9b0",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 13,
                  outline: "none",
                  backgroundColor: "#fff",
                }}
              />
            </div>
          ))}
        </div>

        {/* Preview */}
        <div style={{ padding: "16px 22px", fontSize: 13 }}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#2c1a0e" }}>
              CÔNG TY GỐM SỨ TÂN CHÍ TÀI
            </div>
            <div style={{ fontSize: 11, color: "#7a6050", marginTop: 2 }}>
              101/3, Khu Phố Đông Tư, P.Lái Thiêu, TP.HCM &nbsp;|&nbsp; ĐT: 0919
              79 38 37
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#5c3317",
                letterSpacing: 2,
                margin: "8px 0 2px",
                textTransform: "uppercase",
              }}
            >
              Hóa Đơn Bán Hàng
            </div>
            <div style={{ fontSize: 12, color: "#7a6050" }}>{dateStr}</div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#7a6050",
              marginBottom: 12,
            }}
          >
            <span>
              Khách hàng: <b style={{ color: "#2c1a0e" }}>{custName || "—"}</b>
            </span>
            <span style={{ fontStyle: "italic" }}>
              {custNote ? "Ghi chú: " + custNote : ""}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 600,
                borderCollapse: "collapse",
                marginBottom: 14,
              }}
            >
              <thead>
                <tr>
                  {[
                    "#",
                    "Tên Hàng",
                    "ĐVT",
                    "Số lượng",
                    "Đơn Giá",
                    "Thành Tiền",
                  ].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        background: "#2c1a0e",
                        color: "#e8c98a",
                        fontSize: 11,
                        padding: "7px 8px",
                        textAlign:
                          i === 0
                            ? "center"
                            : i >= 3
                              ? "right"
                              : i === 2
                                ? "center"
                                : "left",
                        whiteSpace: "nowrap",
                        width: i === 0 ? 28 : "auto",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {items.map((p, i) => {
                  const u = rawNum(p["Đơn Giá (Đồng)"]);

                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f0e8dc" }}>
                      {/* STT */}
                      <td
                        style={{
                          padding: "7px 4px",
                          fontSize: 12,
                          width: 28,
                          textAlign: "center",
                          fontWeight: 600,
                        }}
                      >
                        {i + 1}
                      </td>

                      {/* Tên hàng */}
                      <td style={{ padding: "7px 8px", fontSize: 12 }}>
                        {p["Tên Hàng"]}
                      </td>

                      {/* ĐVT */}
                      <td
                        style={{
                          padding: "7px 8px",
                          fontSize: 12,
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p["ĐVT"] || "—"}
                      </td>

                      {/* Số lượng */}
                      <td
                        style={{
                          padding: "7px 8px",
                          fontSize: 12,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p._expr}

                        {p._expr !== String(p._qty) && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#a08060",
                              marginLeft: 3,
                            }}
                          >
                            ={p._qty}
                          </span>
                        )}
                      </td>

                      {/* Đơn giá */}
                      <td
                        style={{
                          padding: "7px 8px",
                          fontSize: 12,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p["Đơn Giá (Đồng)"]}
                      </td>

                      {/* Thành tiền */}
                      <td
                        style={{
                          padding: "7px 8px",
                          fontSize: 12,
                          textAlign: "right",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {(u * p._qty).toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  );
                })}

                {/* Tổng tiền */}
                <tr style={{ background: "#fdf8f3" }}>
                  <td
                    colSpan={5}
                    style={{
                      padding: "9px 8px",
                      fontWeight: 700,
                      fontSize: 13,
                      textAlign: "right",
                      color: "#2c1a0e",
                      whiteSpace: "nowrap",
                    }}
                  >
                    CỘNG THÀNH TIỀN:
                  </td>

                  <td
                    style={{
                      padding: "9px 8px",
                      fontWeight: 800,
                      fontSize: 15,
                      textAlign: "right",
                      color: "#b5915a",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {total.toLocaleString("vi-VN")} VND
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bank */}
          <div
            style={{
              background: "#fdf3e3",
              border: "1.5px solid #e8c98a",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
            }}
          >
            {/* title */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "#8b5e3c",
                marginBottom: 12,
              }}
            >
              Thông Tin Chuyển Khoản
            </div>

            {/* layout */}
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap", // 👈 cho phép xuống dòng
                alignItems: "center",
              }}
            >
              {/* bank info */}
              <div style={{ flex: "1 1 220px" }}>
                {[
                  ["Ngân hàng", "Vietcombank (VCB)"],
                  ["Chủ tài khoản", "LY DAT"],
                  ["Số tài khoản", "1024 110 958"],
                  ["Chi nhánh", "TP. Hồ Chí Minh"],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ color: "#7a6050" }}>{label}</span>

                    <span
                      style={{
                        fontWeight: label === "Số tài khoản" ? 800 : 700,
                        fontSize: label === "Số tài khoản" ? 15 : 13,
                        color: label === "Số tài khoản" ? "#5c3317" : "#2c1a0e",
                        letterSpacing: label === "Số tài khoản" ? 1 : 0,
                      }}
                    >
                      {val}
                    </span>
                  </div>
                ))}

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#8b5e3c",
                    fontStyle: "italic",
                  }}
                >
                  * Nội dung CK: Tên + hóa đơn + ngày tạo hóa đơn
                </div>
              </div>

              {/* QR */}
              <div
                style={{
                  flex: "1 1 160px",
                  textAlign: "center",
                  width: "100%", // 👈 mobile sẽ xuống dòng
                }}
              >
                <img
                  src={`https://img.vietqr.io/image/VCB-1024110958-compact2.png?amount=${total}&addInfo=${encodeURIComponent(
                    `${custName} hoa don ${dateStr}`,
                  )}`}
                  alt="QR chuyển khoản"
                  style={{
                    width: 160,
                    borderRadius: 10,
                    border: "1px solid #e8c98a",
                    padding: 6,
                    background: "#fff",
                  }}
                />

                <div
                  style={{
                    fontSize: 11,
                    marginTop: 6,
                    color: "#7a6050",
                  }}
                >
                  Quét QR để thanh toán
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#7a6050",
              fontStyle: "italic",
              marginBottom: 14,
            }}
          >
            Cảm ơn quý khách đã tin tưởng và ủng hộ Gốm Sứ Tân Chí Tài!
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#7a6050",
            }}
          >
            {["Người mua hàng", "Người bán hàng"].map((s) => (
              <div key={s} style={{ textAlign: "center", width: "44%" }}>
                <div style={{ fontWeight: 600, color: "#2c1a0e" }}>{s}</div>
                <div style={{ height: 40 }} />
                <div style={{ fontSize: 10, color: "#a08060" }}>
                  (Ký, ghi rõ họ tên)
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 22px 18px",
            borderTop: "1px solid #f0e8dc",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px",
              border: "1.5px solid #d9c9b0",
              background: "#fff",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              color: "#7a6050",
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
          <button
            onClick={() =>
              onExportPDF({ custName, custNote, items, total, dateStr })
            }
            style={{
              padding: "9px 20px",
              background: "linear-gradient(135deg,#b5915a,#8b6940)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={15} /> Xuất PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────
export default function HomePage() {
  const isMobile = window.innerWidth <= 768;
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // quantities: { [productIndex]: "3x40" | "5" | "" }
  const [quantities, setQuantities] = useState({});
  const [showBill, setShowBill] = useState(false);
  const [showTop, setShowTop] = useState(false);

  // Giữ nguyên từ code gốc
  useEffect(() => {
    const handleBack = () => window.location.reload();
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch — dùng đúng parseCSVRow & cache từ code gốc
  useEffect(() => {
    const fetchData = async () => {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        const cachedTime = sessionStorage.getItem(CACHE_TIME);

        if (cached && cachedTime) {
          const now = Date.now();
          if (now - cachedTime < CACHE_DURATION) {
            setProducts(JSON.parse(cached));
            setLoading(false);
            return;
          }
        }

        const res = await fetch(SHEET_URL);
        const text = await res.text();
        const lines = text.split("\n").filter((l) => l.trim() !== "");
        const headers = parseCSVRow(lines[0]);

        const data = lines
          .slice(1)
          .map((line) => {
            const cols = parseCSVRow(line);
            let obj = {};
            headers.forEach((h, i) => {
              obj[h] = (cols[i] || "").trim();
            });
            return obj;
          })
          .filter((p) => p["Tên Hàng"] && p["Tên Hàng"] !== "");

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TIME, Date.now());
        setProducts(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter — dùng đúng removeVietnameseTones từ code gốc
  const filtered = !search
    ? products
    : products.filter((p) =>
        removeVietnameseTones(p["Tên Hàng"] || "").includes(
          removeVietnameseTones(search),
        ),
      );

  const setExpr = useCallback((idx, expr) => {
    setQuantities((prev) => ({ ...prev, [idx]: expr }));
  }, []);

  // cartItems: sản phẩm có multiplier > 0, kèm _expr và _qty
  const cartItems = products
    .map((p, i) => {
      const expr = quantities[i] || "";
      const qty = parseQtyExpr(expr);
      return { ...p, _expr: expr, _qty: qty };
    })
    .filter((p) => p._qty > 0);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const removeAccents = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  const exportPDF = async ({ custName, custNote, items, total, dateStr }) => {
    await loadJsPDF();

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a5",
    });

    const W = doc.internal.pageSize.getWidth();
    let y = 8;

    // HEADER
    doc.setFillColor(44, 26, 14);
    doc.roundedRect(5, 5, W - 10, 28, 2, 2, "F");

    doc.setTextColor(232, 201, 138);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("CONG TY GOM SU TAN CHI TAI", W / 2, 11, { align: "center" });

    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      "101/3, Khu pho Dong Tu, P. Lai Thieu, TP.HCM  |  DT: 0919 79 38 37",
      W / 2,
      15.5,
      { align: "center" },
    );

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("HOA DON BAN HANG", W / 2, 23, { align: "center" });

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(232, 201, 138);
    doc.text(removeAccents(dateStr), W / 2, 28, { align: "center" });

    y = 38;

    // CUSTOMER
    doc.setTextColor(44, 26, 14);
    doc.setFontSize(7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const labelWidth = doc.getTextWidth("Khach hang: ");
    doc.text("Khach hang: ", 10, y);

    doc.setFont("helvetica", "normal");
    doc.text(removeAccents(custName) || "—", 10 + labelWidth, y);

    if (custNote) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.text("Ghi chu: " + custNote, 10, y + 5);
      y += 5;
    }

    y += 6;

    // TABLE
    doc.autoTable({
      startY: y,

      head: [
        [
          "#",
          "Ten Hang",
          "DVT",
          "So luong",
          "Don Gia (VND)",
          "Thanh Tien (VND)",
        ],
      ],

      body: items.map((p, i) => {
        const u = rawNum(p["Đơn Giá (Đồng)"]);
        const qtyCell =
          p._expr !== String(p._qty)
            ? `${p._expr} (=${p._qty})`
            : String(p._qty);
        return [
          i + 1,
          removeAccents(p["Tên Hàng"]), // ← bỏ dấu
          removeAccents(p["ĐVT"] || "—"), // ← bỏ dấu
          qtyCell,
          p["Đơn Giá (Đồng)"],
          (u * p._qty).toLocaleString("vi-VN"),
        ];
      }),

      foot: [["", "", "", "", "CONG:", total.toLocaleString("vi-VN") + " VND"]],

      theme: "grid",

      headStyles: {
        fillColor: [44, 26, 14],
        textColor: [232, 201, 138],
        fontSize: 6.5,
        fontStyle: "bold",
        halign: "center",
      },

      footStyles: {
        fillColor: [253, 248, 243],
        textColor: [181, 145, 90],
        fontSize: 7.5,
        fontStyle: "bold",
      },

      bodyStyles: {
        fontSize: 6.5,
        textColor: [30, 26, 23],
      },

      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", cellWidth: 28 },
        5: { halign: "right", cellWidth: 30 },
      },

      margin: { left: 5, right: 5 },
      styles: { cellPadding: 2 },
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── KIỂM TRA CÒN ĐỦ TRANG KHÔNG ────────────────────────
    const H = doc.internal.pageSize.getHeight();
    const qrSize = 44;
    const boxH = qrSize + 16;
    const neededH = boxH + 30; // box + thank you + signatures

    if (y + neededH > H - 10) {
      doc.addPage();
      y = 10;
    }

    // QR IMAGE
    const qrUrl = `https://img.vietqr.io/image/VCB-1024110958-compact2.png?amount=${total}&addInfo=${encodeURIComponent(`${custName} hoa don ${dateStr}`)}`;

    const img = await new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = "Anonymous";
      i.onload = () => resolve(i);
      i.src = qrUrl;
    });

    // ── BANK BOX ─────────────────────────────────────────────
    const boxX = 5;
    const boxW = W - 10;
    const textColW = boxW - qrSize - 10;
    const labelW = 28;
    const blockX = boxX + (textColW - labelW - 35) / 2;

    doc.setFillColor(253, 243, 227);
    doc.setDrawColor(232, 201, 138);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "FD");

    doc.setTextColor(139, 94, 60);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("THONG TIN CHUYEN KHOAN", boxX + textColW / 2, y + 7, {
      align: "center",
    });

    doc.setDrawColor(200, 170, 120);
    doc.setLineWidth(0.3);
    doc.line(boxX + 4, y + 9.5, boxX + textColW, y + 9.5);

    let by = y + 16;
    const infoRows = [
      ["Ngan hang:", "Vietcombank (VCB)", false],
      ["Chu tai khoan:", "LY DAT", false],
      ["So tai khoan:", "1024 110 958", true],
      ["Chi nhanh:", "TP. Ho Chi Minh", false],
    ];

    infoRows.forEach(([label, val, isBigAccent]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 110, 85);
      doc.setFontSize(6.5);
      doc.text(label, blockX, by);

      doc.setFont("helvetica", "bold");
      if (isBigAccent) {
        doc.setFontSize(8.5);
        doc.setTextColor(92, 51, 23);
      } else {
        doc.setFontSize(6.5);
        doc.setTextColor(44, 26, 14);
      }
      doc.text(val, blockX + labelW, by);
      by += 8;
    });

    doc.setFont("helvetica", "italic");
    doc.setTextColor(139, 94, 60);
    doc.setFontSize(5.2);
    doc.text(
      "* Noi dung CK: Ten + hoa don + ngay tao hoa don",
      boxX + 5,
      y + boxH - 4,
    );

    const qrX = boxX + boxW - qrSize - 3;
    const qrY = y + (boxH - qrSize) / 2;
    doc.addImage(img, "PNG", qrX, qrY, qrSize, qrSize);

    y += boxH + 5;

    // ── KIỂM TRA THANK YOU + SIGNATURES ─────────────────────
    if (y + 20 > H - 10) {
      doc.addPage();
      y = 10;
    }

    // THANK YOU
    doc.setTextColor(122, 96, 80);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.text(
      "Cam on quy khach da tin tuong va ung ho Gom Su Tan Chi Tai!",
      W / 2,
      y,
      { align: "center" },
    );

    y += 10;

    [
      ["Nguoi mua hang", 18],
      ["Nguoi ban hang", W - 18],
    ].forEach(([s, x]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(44, 26, 14);
      doc.setFontSize(6.5);
      doc.text(s, x, y, { align: "center" });

      doc.setFont("helvetica", "italic");
      doc.setTextColor(122, 96, 80);
      doc.setFontSize(5.5);
      doc.text("(Ky, ghi ro ho ten)", x, y + 4, { align: "center" });
    });
    // ── LƯU VÀO GOOGLE SHEETS ───────────────────────────────
    const SHEET_URL =
      "https://script.google.com/macros/s/AKfycbza9EBj83f_QBSn-__t_OhOK-c9bqqi5_AG5gkQ1c8DIFmPJJawmaN7nxFBI1e4CQ0k/exec";

    const d = new Date();
    const pdfFileName = `HoaDon_GomSu_${d.getDate()}${d.getMonth() + 1}${d.getFullYear()}.pdf`;

    try {
      // convert PDF → base64
      const pdfBlob = doc.output("blob");

      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];

        const formData = new FormData();
        formData.append("date", dateStr);
        formData.append("custName", removeAccents(custName) || "—");
        formData.append("total", total.toLocaleString("vi-VN") + " VND");
        formData.append("fileName", pdfFileName);
        formData.append("pdf", base64);

        await fetch(SHEET_URL, {
          method: "POST",
          body: formData,
        });
      };

      reader.readAsDataURL(pdfBlob);
    } catch (err) {
      console.error("Fetch error:", err);
    }

    // tải PDF về máy
    doc.save(pdfFileName);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { max-width: 100%; overflow-x: hidden; font-family: 'Be Vietnam Pro', Arial, sans-serif; background: #f7f5f2; color: #1a1a1a; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        tbody tr:hover { background: #fdf8f3 !important; }
        .qty-add-btn:hover { background: #fdf3e3 !important; border-color: #b5915a !important; border-style: solid !important; }
        input:focus { border-color: #b5915a !important; box-shadow: 0 0 0 3px rgba(181,145,90,.18); outline: none; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #d9c9b0; border-radius: 3px; }
 
        /* ── STICKY BAR ── */
        .sticky-bar { position: sticky; top: 0; z-index: 100; background: rgba(247,245,242,.97); backdrop-filter: blur(10px); border-bottom: 1px solid #e2d5c3; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
        .sticky-inner { max-width: 900px; margin: 0 auto; padding: 8px 12px; display: flex; align-items: center; gap: 8px; }
        .search-box { flex: 1; min-width: 0; position: relative; }
        .search-box svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: #a08060; pointer-events: none; flex-shrink: 0; }
        .search-box input { width: 100%; padding: 8px 10px 8px 30px; border: 1.5px solid #d9c9b0; border-radius: 8px; font-family: inherit; font-size: 13px; background: #fff; outline: none; }
        .count-badge { background: #2c1a0e; color: #e8c98a; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
        .cart-badge { font-size: 11px; color: #5c3317; font-weight: 600; white-space: nowrap; display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .btn-bill { background: linear-gradient(135deg,#b5915a,#8b6940); color: #fff; font-size: 12px; font-weight: 700; padding: 8px 12px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
        .btn-bill:disabled { background: #d9c9b0; cursor: not-allowed; }
 
        /* ── TABLE ── */
        .table-area { max-width: 900px; margin: 0 auto; padding: 14px 10px 80px; }
        .table-wrap { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.07); }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
 
        /* Desktop col widths */
        .col-stt   { width: 34px; }
        .col-name  { } /* flex */
        .col-dvt   { width: 58px; }
        .col-price { width: 110px; }
        .col-qty   { width: 110px; }
 
        thead tr { background: linear-gradient(135deg,#2c1a0e,#5c3317); }
        thead th { color: #e8c98a; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 11px 8px; }
        .th-center { text-align: center; }
        .th-left   { text-align: left; }
        .th-right  { text-align: right; padding-right: 12px; }
 
        tbody tr { border-bottom: 1px solid #f0e8dc; transition: background .15s; }
        tbody tr:last-child { border-bottom: none; }
        .td-stt   { padding: 10px 8px; color: #a08060; font-size: 11px; text-align: center; }
        .td-name  { padding: 10px 8px; font-size: 13px; font-weight: 500; word-break: break-word; }
        .td-name.selected { font-weight: 600; color: #5c3317; }
        .td-dvt   { padding: 8px 6px; text-align: center; }
        .badge-dvt { background: #f5ede0; color: #8b5e3c; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; display: inline-block; }
        .td-price { padding: 10px 12px 10px 8px; text-align: right; font-weight: 600; font-size: 13px; color: #2c1a0e; white-space: nowrap; }
        .td-price .vnd { font-size: 9px; color: #a08060; margin-left: 2px; font-weight: 400; }
        .td-qty   { padding: 8px 8px; text-align: center; }
        .td-empty { text-align: center; padding: 40px 10px; color: #a08060; font-style: italic; }
 
        /* ── SCROLL TOP ── */
        .scroll-top-btn { position: fixed; bottom: 20px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: #2c1a0e; color: #e8c98a; border: none; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); transition: opacity .3s, transform .3s; display: flex; align-items: center; justify-content: center; }
 
        /* ── MOBILE ≤ 480px ── */
        @media (max-width: 480px) {
          .header { padding: 12px 10px; }
          .header-top { grid-template-columns: 1fr; gap: 8px; text-align: center; }
          .phones-col { flex-direction: row; justify-content: center; gap: 14px; }
          .zalo-col { justify-content: center; }
          .title-col h1 { font-size: 20px; }
 
          .sticky-inner { flex-wrap: wrap; padding: 8px 10px; gap: 6px; }
          .search-box { flex: 1 1 100%; order: 1; }
          .count-badge { order: 2; }
          .cart-badge { order: 3; }
          .btn-bill { order: 4; flex: 1; justify-content: center; }
 
          /* Ẩn cột ĐVT trên mobile rất nhỏ */
          .col-dvt, .td-dvt { display: none; }
          .col-stt  { width: 28px; }
          .col-price { width: 95px; }
          .col-qty  { width: 80px; }
 
          .td-stt  { font-size: 10px; padding: 9px 5px; }
          .td-name { font-size: 12px; padding: 9px 6px; }
          .td-price { font-size: 12px; padding: 9px 8px 9px 4px; }
          .td-qty  { padding: 7px 5px; }
          thead th { font-size: 10px; padding: 10px 5px; letter-spacing: 0; }
        }
 
        /* ── TABLET 481–768px ── */
        @media (min-width: 481px) and (max-width: 768px) {
          .header-top { grid-template-columns: auto 1fr auto; gap: 8px; }
          .company-name { display: none; }
          .title-col h1 { font-size: 20px; }
          .btn-phone { font-size: 11px; }
 
          .col-stt   { width: 30px; }
          .col-dvt   { width: 52px; }
          .col-price { width: 105px; }
          .col-qty   { width: 100px; }
 
          .td-name  { font-size: 13px; }
          .td-price { font-size: 12px; }
          .badge-dvt { font-size: 10px; padding: 2px 6px; }
        }
      `}</style>

      {/* HEADER — giữ nguyên className như code gốc */}
      <div className="header">
        <div className="header-top">
          <div className="phones-col">
            <a href="tel:0913649414" className="btn-phone">
              <Phone size={16} color="#b5915a" style={{ marginRight: "6px" }} />
              0913 64 94 14
            </a>
            <a href="tel:0919793837" className="btn-phone">
              <Phone size={16} color="#b5915a" style={{ marginRight: "6px" }} />
              0919 79 38 37
            </a>
          </div>
          <div className="title-col">
            <p className="company-name">Gốm Sứ Tân Chí Tài</p>
            <h1>Bảng Giá</h1>
            <div className="header-line" />
          </div>
          <div className="zalo-col">
            <a
              href="https://zalo.me/0919793837"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-zalo"
            >
              <span className="zalo-z">Z</span>
              Zalo tư vấn
            </a>
          </div>
        </div>
      </div>

      {/* STICKY BAR */}
      <div className="sticky-bar">
        <div className="sticky-inner">
          <div className="search-box">
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Tìm tên sản phẩm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {!loading && (
            <span className="count-badge">{filtered.length} sp</span>
          )}

          {cartItems.length > 0 && (
            <span className="cart-badge">
              <ShoppingCart size={13} />
              {cartItems.length} món
            </span>
          )}

          <button
            className="btn-bill"
            onClick={() => setShowBill(true)}
            disabled={cartItems.length === 0}
          >
            <FileText size={13} />
            Xuất Bill
          </button>
        </div>
      </div>

      {/* TABLE AREA */}
      <div
        style={{ maxWidth: 900, margin: "0 auto", padding: "20px 12px 80px" }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,.07)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 60 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr
                style={{
                  background: "linear-gradient(135deg,#2c1a0e,#5c3317)",
                }}
              >
                {[
                  ["#", "center"],
                  ["Tên Hàng", "left"],
                  ["ĐVT", "center"],
                  ["Đơn Giá", "right"],
                  ["Số Lượng", "center"],
                ].map(([h, align]) => (
                  <th
                    key={h}
                    style={{
                      color: "#e8c98a",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      padding: "12px 10px",
                      textAlign: align,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length > 0 ? (
                filtered.map((p, i) => {
                  const gIdx = products.indexOf(p);
                  const expr = quantities[gIdx] || "";
                  const qty = parseQtyExpr(expr);
                  return (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid #f0e8dc",
                        background: qty > 0 ? "#fffbf5" : "#fff",
                        transition: "background .15s",
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 10px",
                          color: "#a08060",
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      >
                        {p["STT"] || i + 1}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          fontWeight: qty > 0 ? 600 : 500,
                          color: qty > 0 ? "#5c3317" : "#1a1a1a",
                        }}
                      >
                        {p["Tên Hàng"]}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>
                        <span
                          style={{
                            background: "#f5ede0",
                            color: "#8b5e3c",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 12,
                          }}
                        >
                          {p["ĐVT"] || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px 10px 10px",
                          textAlign: "right",
                          fontWeight: 600,
                          color: "#2c1a0e",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p["Đơn Giá (Đồng)"]}
                        {/* <span
                          style={{
                            fontSize: 10,
                            color: "#a08060",
                            marginLeft: 3,
                            fontWeight: 400,
                          }}
                        >
                          VND
                        </span> */}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <QtyCtrl
                          productName={p["Tên Hàng"]}
                          expr={expr}
                          onChangeExpr={(v) => setExpr(gIdx, v)}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      textAlign: "center",
                      padding: "40px 10px",
                      color: "#a08060",
                      fontStyle: "italic",
                    }}
                  >
                    Không tìm thấy sản phẩm
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SCROLL TOP */}
      <button
        onClick={scrollToTop}
        aria-label="Lên đầu trang"
        style={{
          position: "fixed",
          bottom: 24,
          right: 18,
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: "#2c1a0e",
          color: "#e8c98a",
          border: "none",
          fontSize: 16,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,.25)",
          transition: "opacity .3s,transform .3s",
          opacity: showTop ? 1 : 0,
          transform: showTop ? "none" : "translateY(10px)",
          pointerEvents: showTop ? "auto" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronUp size={18} />
      </button>

      {showBill && (
        <BillModal
          items={cartItems}
          onClose={() => setShowBill(false)}
          onExportPDF={exportPDF}
        />
      )}
    </>
  );
}
