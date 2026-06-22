import api from "../api/client.js";

/**
 * Export rows to Excel via the backend.
 * @param {Object[]} rows   — array of flat objects (column: value)
 * @param {string}   title  — worksheet title
 * @param {string}   filename — download filename (without extension)
 */
export default async function exportExcel(rows, title, filename) {
  const resp = await api.post(
    "/api/export/xlsx",
    { title, filename, rows },
    { responseType: "blob" },
  );
  const url = window.URL.createObjectURL(new Blob([resp.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
