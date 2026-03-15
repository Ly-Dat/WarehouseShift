import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api"; // link backend của bạn

// Lấy danh sách sản phẩm
export const getProducts = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/products`);
    return res.data;
  } catch (error) {
    console.error("Lỗi khi gọi API getProducts:", error);
    throw error;
  }
};

// Tạo sản phẩm mới
export const createProduct = async (productData) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/products`, productData);
    return res.data;
  } catch (error) {
    console.error("Lỗi khi gọi API createProduct:", error);
    throw error;
  }
};
