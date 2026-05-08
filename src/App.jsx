import { useState, useMemo, useEffect, useRef } from "react";

const SUPABASE_URL = "https://fsmzzjqmzdcsvslbxswe.supabase.co";
const SUPABASE_KEY = "sb_publishable_Pb-jEUw5j14nK64MVSDzRg_c4_5lxWr";

async function supabase(method, body, id) {
  const url = `${SUPABASE_URL}/rest/v1/requisiciones${id ? `?id=eq.${id}` : ""}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const ESTATUS_CONFIG = {
  "Pendiente":      { color: "#F59E0B", bg: "#FEF3C7", icon: "⏳" },
  "Orden colocada": { color: "#3B82F6", bg: "#DBEAFE", icon: "📋" },
  "Entregado":      { color: "#10B981", bg: "#D1FAE5", icon: "✅" },
  "Cancelado":      { color: "#EF4444", bg: "#FEE2E2", icon: "✖" },
};

const TIPOS_ACERO = [
  "Acero al carbono", "Acero inoxidable", "Acero galvanizado",
  "Acero estructural", "Acero laminado en frío", "Acero laminado en caliente",
  "Acero aleado", "Acero para herramientas",
];

const COL_MAP = {
  "no_requisicion":   ["no_requisicion", "no. req.", "requisicion", "num requisicion", "número requisición"],
  "proyecto":         ["proyecto", "project", "nombre proyecto"],
  "toneladas":        ["toneladas", "tons", "ton", "weight"],
  "tipo_acero":       ["tipo_acero", "tipo acero", "tipo de acero", "acero"],
  "fecha_requisicion":["fecha_requisicion", "fecha requisicion", "fecha req", "fecha de requisicion"],
  "fecha_requerida":  ["fecha_requerida", "fecha requerida", "fecha planta", "fecha requerida por planta"],
  "proveedor":        ["proveedor", "supplier", "vendor"],
  "estatus":          ["estatus", "status", "estado"],
  "precio":           ["precio", "costo", "price", "costo estimado"],
  "comentarios":      ["comentarios", "comments", "observaciones", "notas"],
};

function parseExcelDate(val) {
  if (!val) return "";
  if (typeof val === "number") {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }
  if (typeof val === "string") {
    const parts = val.includes("/") ? val.split("/") : val.includes("-") ? val.split("-") : null;
    if (parts && parts.length === 3) {
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
      if (parts[0].length === 4) return val;
    }
  }
  return "";
}

function mapRow(headers, row) {
  const mapped = {};
  headers.forEach((h, i) => {
    const normalized = (h || "").toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      if (aliases.includes(normalized)) {
        mapped[field] = row[i] !== undefined ? String(row[i]).trim() : "";
        break;
      }
    }
  });
  return mapped;
}

const emptyForm = {
  no_requisicion: "", proyecto: "", toneladas: "", tipo_acero: "",
  fecha_requisicion: "", fecha_requerida: "", proveedor: "",
  estatus: "Pendiente", precio: "", comentarios: "",
};

function formatPeso(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}
function formatFecha(f) {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterEstatus, setFilterEstatus] = useState("Todos");
  const [filterFechaDesde, setFilterFechaDesde] = useState("");
  const [filterFechaHasta, setFilterFechaHasta] = useState("");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortCol, setSortCol] = useState("fecha_requisicion");
  const [sortDir, setSortDir] = useState("desc");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await supabase("GET");
      setData(rows);
    } catch (e) {
      setError("Error al cargar datos: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setForm(emptyForm); setEditItem(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ ...item }); setEditItem(item.id); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditItem(null); };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let rows = [...data];
    if (filterEstatus !== "Todos") rows = rows.filter(r => r.estatus === filterEstatus);
    if (filterFechaDesde) rows = rows.filter(r => r.fecha_requerida >= filterFechaDesde);
    if (filterFechaHasta) rows = rows.filter(r => r.fecha_requerida <= filterFechaHasta);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r =>
        (r.proyecto || "").toLowerCase().includes(s) ||
        (r.no_requisicion || "").toLowerCase().includes(s) ||
        (r.proveedor || "").toLowerCase().includes(s)
      );
    }
    rows.sort((a, b) => {
      let av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
      if (typeof av === "string") av = av.toLowerCase(), bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, filterEstatus, filterFechaDesde, filterFechaHasta, search, sortCol, sortDir]);

  const totalTons = filtered.reduce((s, r) => s + Number(r.toneladas || 0), 0);
  const totalPeso = filtered.reduce((s, r) => s + Number(r.precio || 0), 0);

  const handleSave = async () => {
    if (!form.no_requisicion || !form.proyecto || !form.toneladas || !form.tipo_acero || !form.fecha_requerida || !form.fecha_requisicion) {
      alert("Por favor completa los campos obligatorios (*).");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        no_requisicion: form.no_requisicion,
        proyecto: form.proyecto,
        toneladas: Number(form.toneladas),
        tipo_acero: form.tipo_acero,
        fecha_requisicion: form.fecha_requisicion,
        fecha_requerida: form.fecha_requerida,
        proveedor: form.proveedor,
        estatus: form.estatus,
        precio: form.precio ? Number(form.precio) : null,
        comentarios: form.comentarios,
      };
      if (editItem) {
        await supabase("PATCH", payload, editItem);
      } else {
        await supabase("POST", payload);
      }
      await fetchData();
      closeModal();
    } catch (e) {
      alert("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await supabase("DELETE", null, id);
      await fetchData();
    } catch (e) {
      alert("Error al eliminar: " + e.message);
    }
    setDeleteConfirm(null);
  };

  const downloadTemplate = () => {
    const headers = ["no_requisicion","proyecto","toneladas","tipo_acero","fecha_requisicion","fecha_requerida","proveedor","estatus","precio","comentarios"];
    const example = ["REQ-2024-001","Planta Monterrey","45.5","Acero estructural","2024-04-10","2024-06-15","AHMSA","Pendiente","850000","Urgente"];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_requisiciones.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) throw new Error("El archivo está vacío o solo tiene encabezados.");

      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").toLowerCase().trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
        return mapRow(headers, vals);
      }).filter(r => r.proyecto || r.no_requisicion);

      if (rows.length === 0) throw new Error("No se encontraron filas válidas.");

      const payloads = rows.map(r => ({
        no_requisicion: r.no_requisicion || "",
        proyecto: r.proyecto || "",
        toneladas: r.toneladas ? Number(r.toneladas) : null,
        tipo_acero: r.tipo_acero || "",
        fecha_requisicion: parseExcelDate(r.fecha_requisicion) || null,
        fecha_requerida: parseExcelDate(r.fecha_requerida) || null,
        proveedor: r.proveedor || "",
        estatus: Object.keys(ESTATUS_CONFIG).includes(r.estatus) ? r.estatus : "Pendiente",
        precio: r.precio ? Number(r.precio) : null,
        comentarios: r.comentarios || "",
      }));

      let ok = 0, fail = 0;
      for (const p of payloads) {
        try {
          await supabase("POST", p);
          ok++;
        } catch { fail++; }
      }

      await fetchData();
      setImportResult({ ok, fail });
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: "#B45309" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const cols = [
    { key: "no_requisicion", label: "No. Req." },
    { key: "proyecto", label: "Proyecto" },
    { key: "toneladas", label: "Tons" },
    { key: "tipo_acero", label: "Tipo de Acero" },
    { key: "fecha_requisicion", label: "Fecha Req." },
    { key: "fecha_requerida", label: "Fecha Planta" },
    { key: "proveedor", label: "Proveedor" },
    { key: "precio", label: "Costo Est." },
    { key: "estatus", label: "Estatus" },
    { key: "comentarios", label: "Comentarios" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Georgia', serif", color: "#1C1C1C" }}>
      <div style={{
        background: "linear-gradient(135deg, #1C1C1C 0%, #2D2417 60%, #3D2E0F 100%)",
        padding: "28px 40px 24px", borderBottom: "4px solid #B45309",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, background: "#B45309", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⚙</div>
          <div>
            <div style={{ color: "#F5F0E8", fontSize: 22, fontWeight: "bold", letterSpacing: 1 }}>REQUISICIONES DE ACERO</div>
            <div style={{ color: "#B45309", fontSize: 12, letterSpacing: 3, textTransform: "uppercase", marginTop: 2 }}>Control y Seguimiento</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={fetchData} style={{ background: "none", border: "1px solid #B45309", color: "#B45309", padding: "8px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: "Georgia, serif" }}>🔄 Actualizar</button>
          <button onClick={downloadTemplate} style={{ background: "none", border: "1px solid #6B6B5B", color: "#D4C5A9", padding: "8px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: "Georgia, serif" }}>📥 Plantilla CSV</button>
          <button onClick={() => fileInputRef.current.click()} disabled={importing} style={{ background: importing ? "#6B6B5B" : "#2D5016", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 4, cursor: importing ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "Georgia, serif" }}>
            {importing ? "Importando…" : "📤 Importar CSV"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile} style={{ display: "none" }} />
          <button onClick={openNew} style={{ background: "#B45309", color: "#fff", border: "none", padding: "10px 22px", borderRadius: 4, fontSize: 14, fontWeight: "bold", cursor: "pointer", fontFamily: "Georgia, serif" }}>+ Nueva Requisición</button>
        </div>
      </div>

      {importResult && (
        <div style={{ background: importResult.error ? "#FEE2E2" : "#D1FAE5", border: `1px solid ${importResult.error ? "#EF4444" : "#10B981"}`, color: importResult.error ? "#B91C1C" : "#065F46", padding: "12px 40px", fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {importResult.error ? `⚠️ Error: ${importResult.error}` : `✅ Importación completada: ${importResult.ok} registros cargados${importResult.fail > 0 ? `, ${importResult.fail} fallidos` : ""}.`}
          <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid #EF4444", color: "#B91C1C", padding: "12px 40px", fontSize: 14 }}>
          ⚠️ {error} <button onClick={fetchData} style={{ marginLeft: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#B91C1C" }}>Reintentar</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, padding: "20px 40px 0", flexWrap: "wrap" }}>
        {[
          { label: "Registros", value: loading ? "…" : filtered.length, icon: "📦" },
          { label: "Toneladas", value: loading ? "…" : `${totalTons.toLocaleString("es-MX", { maximumFractionDigits: 1 })} t`, icon: "⚖️" },
          { label: "Costo total", value: loading ? "…" : formatPeso(totalPeso), icon: "💰" },
          ...Object.keys(ESTATUS_CONFIG).map(est => ({ label: est, icon: ESTATUS_CONFIG[est].icon, value: loading ? "…" : data.filter(r => r.estatus === est).length, accent: ESTATUS_CONFIG[est].color })),
        ].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "12px 18px", flex: 1, minWidth: 110, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderTop: `3px solid ${s.accent || "#B45309"}` }}>
            <div style={{ fontSize: 10, color: "#6B6B5B", letterSpacing: 1, textTransform: "uppercase" }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: s.accent || "#1C1C1C", marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", margin: "16px 40px 0", borderRadius: 8, padding: "14px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <span style={{ fontWeight: "bold", fontSize: 12, color: "#6B6B5B" }}>FILTROS:</span>
        <input placeholder="🔍 Proyecto, req., proveedor…" value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
        <select value={filterEstatus} onChange={e => setFilterEstatus(e.target.value)} style={inputStyle}>
          <option value="Todos">Todos los estatus</option>
          {Object.keys(ESTATUS_CONFIG).map(e => <option key={e}>{e}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6B6B5B" }}>Fecha planta:</span>
          <input type="date" value={filterFechaDesde} onChange={e => setFilterFechaDesde(e.target.value)} style={{ ...inputStyle, width: 136 }} />
          <span style={{ fontSize: 12, color: "#6B6B5B" }}>—</span>
          <input type="date" value={filterFechaHasta} onChange={e => setFilterFechaHasta(e.target.value)} style={{ ...inputStyle, width: 136 }} />
        </div>
        {(filterEstatus !== "Todos" || filterFechaDesde || filterFechaHasta || search) && (
          <button onClick={() => { setFilterEstatus("Todos"); setFilterFechaDesde(""); setFilterFechaHasta(""); setSearch(""); }}
            style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "#6B6B5B" }}>✕ Limpiar</button>
        )}
      </div>

      <div style={{ margin: "14px 40px 40px", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
        {loading ? (
          <div style={{ background: "#fff", padding: 60, textAlign: "center", color: "#6B6B5B" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Cargando requisiciones...
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#2D2417", color: "#F5F0E8" }}>
                  {cols.map(c => (
                    <th key={c.key} onClick={() => handleSort(c.key)}
                      style={{ padding: "12px 14px", textAlign: "left", fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                      {c.label}<SortIcon col={c.key} />
                    </th>
                  ))}
                  <th style={{ padding: "12px 14px", textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={cols.length + 1} style={{ textAlign: "center", padding: 48, color: "#9CA3AF", fontStyle: "italic" }}>No se encontraron requisiciones.</td></tr>
                ) : filtered.map((row, i) => {
                  const est = ESTATUS_CONFIG[row.estatus] || {};
                  return (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? "#FAFAF7" : "#fff", borderBottom: "1px solid #EEE9DC" }}>
                      <td style={{ padding: "11px 14px", fontWeight: "bold", color: "#B45309", whiteSpace: "nowrap" }}>{row.no_requisicion || "—"}</td>
                      <td style={{ padding: "11px 14px", fontWeight: "600" }}>{row.proyecto}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>{Number(row.toneladas).toLocaleString("es-MX", { maximumFractionDigits: 1 })} t</td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>{row.tipo_acero}</td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>{formatFecha(row.fecha_requisicion)}</td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>{formatFecha(row.fecha_requerida)}</td>
                      <td style={{ padding: "11px 14px" }}>{row.proveedor || "—"}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>{formatPeso(row.precio)}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: est.bg, color: est.color, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: "bold", whiteSpace: "nowrap", border: `1px solid ${est.color}44` }}>
                          {est.icon} {row.estatus}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#6B6B5B", fontStyle: row.comentarios ? "normal" : "italic" }}>
                        {row.comentarios || "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button onClick={() => openEdit(row)} style={actionBtn("#3B82F6")}>✏ Editar</button>
                        <button onClick={() => setDeleteConfirm(row.id)} style={actionBtn("#EF4444")}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ background: "linear-gradient(135deg, #1C1C1C, #2D2417)", padding: "20px 28px", borderBottom: "3px solid #B45309", borderRadius: "10px 10px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#F5F0E8", fontWeight: "bold", fontSize: 16 }}>{editItem ? "✏ Editar Requisición" : "+ Nueva Requisición"}</div>
              <button onClick={closeModal} style={{ background: "none", border: "none", color: "#F5F0E8", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { key: "no_requisicion", label: "No. Requisición *", placeholder: "REQ-2024-XXX" },
                  { key: "proyecto", label: "Proyecto *", placeholder: "Nombre del proyecto" },
                  { key: "toneladas", label: "Toneladas *", placeholder: "0.0", type: "number" },
                  { key: "precio", label: "Costo Estimado ($)", placeholder: "0.00", type: "number" },
                  { key: "fecha_requisicion", label: "Fecha de Requisición *", type: "date" },
                  { key: "fecha_requerida", label: "Fecha Requerida por Planta *", type: "date" },
                  { key: "proveedor", label: "Proveedor", placeholder: "Nombre del proveedor" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input type={f.type || "text"} placeholder={f.placeholder} value={form[f.key] || ""}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={formInput} />
                  </div>
                ))}
                <div>
                  <label style={labelStyle}>Tipo de Acero *</label>
                  <select value={form.tipo_acero} onChange={e => setForm(p => ({ ...p, tipo_acero: e.target.value }))} style={formInput}>
                    <option value="">Seleccionar...</option>
                    {TIPOS_ACERO.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Estatus</label>
                  <select value={form.estatus} onChange={e => setForm(p => ({ ...p, estatus: e.target.value }))} style={formInput}>
                    {Object.keys(ESTATUS_CONFIG).map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Comentarios / Observaciones</label>
                <textarea value={form.comentarios || ""} onChange={e => setForm(p => ({ ...p, comentarios: e.target.value }))}
                  placeholder="Notas adicionales..." rows={3} style={{ ...formInput, resize: "vertical", fontFamily: "Georgia, serif" }} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
                <button onClick={closeModal} style={{ padding: "10px 24px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 14 }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: "10px 28px", background: saving ? "#9CA3AF" : "#B45309", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontWeight: "bold", fontFamily: "Georgia, serif", fontSize: 14 }}>
                  {saving ? "Guardando…" : editItem ? "Guardar cambios" : "Crear requisición"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 32, maxWidth: 380, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: "bold", fontSize: 18, marginBottom: 8 }}>¿Eliminar requisición?</div>
            <div style={{ color: "#6B6B5B", marginBottom: 24, fontSize: 14 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "9px 22px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: "9px 22px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: "7px 12px", borderRadius: 6, border: "1px solid #DDD", fontSize: 13, fontFamily: "Georgia, serif", background: "#FAFAF7", outline: "none", minWidth: 150 };
const formInput = { width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #DDD", fontSize: 13, fontFamily: "Georgia, serif", background: "#FAFAF7", outline: "none", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 11, fontWeight: "bold", color: "#6B6B5B", letterSpacing: 0.5, marginBottom: 5, textTransform: "uppercase" };
const actionBtn = (color) => ({ background: "none", border: `1px solid ${color}44`, color, borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: "bold", marginRight: 4 });
