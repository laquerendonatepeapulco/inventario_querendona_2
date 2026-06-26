require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");
const isVercel = Boolean(process.env.VERCEL);
const databaseUrl = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: databaseUrl
});

let readyPromise = null;

const demoProducts = [
  ["Refresco cola 2 L", "BEB-REF-COLA2", "Botella familiar de refresco de cola", "Bebidas", "Refrescos", "Coca Cola FEMSA", 24, 8, 31, 45, "Bodega / Bebidas"],
  ["Agua natural 1.5 L", "BEB-AGUA15", "Botella de agua natural", "Bebidas", "Agua", "Bonafont", 18, 10, 12, 20, "Bodega / Bebidas"],
  ["Cerveza clara 355 ml", "BEB-CER355", "Botella individual", "Bebidas", "Alcohol", "Grupo Modelo", 30, 12, 16, 32, "Bodega / Refrigerador"],
  ["Arrachera kg", "COC-CAR-ARR", "Corte para cocina por kilo", "Cocina", "Carne", "Carnes del Centro", 9, 6, 185, 280, "Camara fria"],
  ["Queso Oaxaca kg", "COC-LAC-QOX", "Queso para preparaciones", "Cocina", "Lacteos", "Lacteos San Jose", 7, 4, 98, 155, "Camara fria"],
  ["Tomate saladette kg", "COC-VER-TOM", "Tomate fresco para cocina", "Cocina", "Verdura", "Mercado local", 14, 6, 19, 32, "Bodega / Verduras"]
];

const movementTypeLabels = {
  alta: "Alta",
  entrada: "Entrada",
  compra: "Compra",
  reposicion: "Reposicion",
  venta: "Uso en cocina",
  salida: "Uso de insumo",
  ajuste: "Ajuste",
  merma: "Merma",
  danado: "Producto danado",
  consumo_interno: "Consumo interno",
  eliminacion: "Eliminacion"
};

const detailedExitTypes = new Set(["venta", "merma", "danado", "consumo_interno", "ajuste"]);
const purchaseMeasureUnits = new Set([
  "Pieza",
  "Kilogramo",
  "Gramo",
  "Onza",
  "Litro",
  "Mililitro",
  "Caja",
  "Paquete",
  "Bolsa",
  "Botella",
  "Lata",
  "Garrafon",
  "Cubeta",
  "Charola",
  "Costal",
  "Bulto",
  "Manojo",
  "Rollo",
  "Docena",
  "Porcion",
  "Rebanada",
  "Barra",
  "Sobre",
  "Frasco",
  "Galon",
  "1 kg",
  "1/2 kg",
  "1/4 kg"
]);
const shiftExitAlertShifts = [
  {
    key: "turno_1",
    label: "Turno 1",
    start: process.env.SHIFT_1_START || "09:00",
    end: process.env.SHIFT_1_END || "15:00",
    alertFrom: process.env.SHIFT_1_ALERT_FROM || "14:00"
  },
  {
    key: "turno_2",
    label: "Turno 2",
    start: process.env.SHIFT_2_START || "15:00",
    end: process.env.SHIFT_2_END || "21:00",
    alertFrom: process.env.SHIFT_2_ALERT_FROM || "20:00"
  }
];

app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function loginUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  const employeeAlias = normalized.match(/^empleado([1-3])$/);
  return employeeAlias ? `cocinero${employeeAlias[1]}` : normalized;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function databaseFingerprint() {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    return crypto
      .createHash("sha256")
      .update(`${parsed.hostname}${parsed.pathname}`)
      .digest("hex")
      .slice(0, 12);
  } catch {
    return "invalid";
  }
}

app.get("/api/health/notifications", async (req, res) => {
  let databaseConnected = false;

  if (databaseUrl) {
    try {
      await pool.query("SELECT 1");
      databaseConnected = true;
    } catch {
      databaseConnected = false;
    }
  }

  res.json({
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    database: {
      configured: Boolean(databaseUrl),
      connected: databaseConnected,
      fingerprint: databaseFingerprint()
    },
    email: {
      configured: Boolean(
        splitRecipients(process.env.ALERT_EMAIL_TO).length
        && (process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER)
        && process.env.SMTP_HOST
        && process.env.SMTP_USER
        && process.env.SMTP_PASS
      )
    },
    whatsapp: {
      configured: Boolean(
        splitRecipients(process.env.ALERT_WHATSAPP_TO).length
        && process.env.WHATSAPP_ACCESS_TOKEN
        && process.env.WHATSAPP_PHONE_NUMBER_ID
        && process.env.WHATSAPP_TEMPLATE_NAME
      )
    }
  });
});

function sessionDurationDays() {
  const days = Number(process.env.SESSION_DAYS || 30);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function userDto(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    label: user.label
  };
}

function productDto(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory || "",
    supplier: row.supplier,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    cost: Number(row.cost),
    price: Number(row.price),
    location: row.location,
    updatedAt: row.updated_at
  };
}

function movementDto(row) {
  const movementType = normalizeMovementType(row.movement_type, Number(row.quantity), row.note);
  const unitPrice = row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price);
  const unitCost = row.unit_cost === null || row.unit_cost === undefined ? null : Number(row.unit_cost);
  const quantity = Number(row.quantity);
  const units = Math.abs(quantity);
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    quantity,
    movementType,
    movementTypeLabel: movementTypeLabel(movementType),
    unitPrice,
    unitCost,
    supplierType: row.supplier_type || "Proveedor local",
    measureUnit: row.measure_unit || "Pieza",
    totalValue: unitPrice === null ? null : units * unitPrice,
    totalCost: unitCost === null ? null : units * unitCost,
    note: displayMovementNote(row.note, movementType),
    createdAt: row.created_at
  };
}

function quickMovementDto(row) {
  return {
    ...movementDto(row),
    createdByName: row.created_by_name || "Sin usuario"
  };
}

function stockAlertDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    message: row.message,
    status: row.status,
    createdByName: row.created_by_name,
    createdAt: row.last_reported_at || row.created_at,
    reportCount: Number(row.report_count || 1),
    notifications: Array.isArray(row.notification_results) ? row.notification_results : [],
    resolvedAt: row.resolved_at
  };
}

function productQuickSummary(product) {
  const stock = Number(product.stock);
  const cost = Number(product.cost);
  const price = Number(product.price);
  const margin = price - cost;
  const marginPercent = price > 0 ? (margin / price) * 100 : 0;

  return {
    stockValue: stock * price,
    costValue: stock * cost,
    unitMargin: margin,
    marginPercent
  };
}

function purchaseDto(row) {
  return {
    id: row.id,
    movementId: row.movement_id || null,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    category: row.category || "Sin categoria",
    subcategory: row.subcategory || "",
    supplier: row.supplier,
    quantity: Number(row.quantity),
    measureUnit: row.measure_unit || "Pieza",
    unitCost: Number(row.unit_cost),
    totalCost: Number(row.total_cost),
    note: row.note || "",
    createdByName: row.created_by_name || "Sin usuario",
    createdAt: row.created_at
  };
}

async function query(text, params = []) {
  return pool.query(text, params);
}

function normalizePlainText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeMovementType(value, quantity = 0, note = "") {
  const type = normalizePlainText(value);
  if (movementTypeLabels[type]) return type;

  const cleanNote = normalizePlainText(note);
  if (cleanNote.includes("salida_rapida") || cleanNote.includes("venta_rapida") || cleanNote.includes("uso_rapido")) return "venta";
  if (cleanNote.includes("entrada_rapida")) return "entrada";
  if (cleanNote.includes("compra")) return "compra";
  if (cleanNote.includes("reposicion")) return "reposicion";
  if (cleanNote.includes("eliminado")) return "eliminacion";
  if (cleanNote.includes("ajuste")) return "ajuste";
  if (cleanNote.includes("alta")) return "alta";

  return Number(quantity) < 0 ? "salida" : "entrada";
}

function movementTypeLabel(type) {
  return movementTypeLabels[normalizeMovementType(type)] || "Movimiento";
}

function defaultExitNote(type) {
  return {
    venta: "Uso en cocina",
    merma: "Merma",
    danado: "Producto danado",
    consumo_interno: "Consumo interno",
    ajuste: "Ajuste de inventario"
  }[type] || "Uso en cocina";
}

function normalizePurchaseMeasureUnit(value) {
  const clean = String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return "Pieza";
  if (purchaseMeasureUnits.has(clean)) return clean;
  return clean;
}

function measureUnitKgFactor(value) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(",", ".");

  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*kg$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator > 0 ? numerator / denominator : null;
  }

  const kilograms = text.match(/^(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|kilogramo|kilogramos)$/);
  if (kilograms) return Number(kilograms[1]);

  const grams = text.match(/^(\d+(?:\.\d+)?)\s*(g|gr|gramo|gramos)$/);
  if (grams) return Number(grams[1]) / 1000;

  const plainNumber = text.match(/^(\d+(?:\.\d+)?)$/);
  if (plainNumber) return Number(plainNumber[1]) / 1000;

  return null;
}

function measuredUnitValue(baseValue, measureUnit) {
  const value = Number(baseValue || 0);
  const factor = measureUnitKgFactor(measureUnit);
  return Number.isFinite(value) && factor && factor > 0 ? Number((value * factor).toFixed(2)) : value;
}

function normalizeSupplierName(value, fallback = "Proveedor local") {
  const supplier = String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
  return supplier || fallback;
}

function displayMovementNote(note, movementType) {
  const text = String(note || "").trim();
  const cleanNote = normalizePlainText(text);

  if (!text) return defaultExitNote(movementType);
  if (cleanNote === "salida_rapida" || cleanNote === "venta_rapida") return "Uso rapido";
  if (cleanNote === "venta") return "Uso en cocina";
  if (cleanNote === "ajuste_de_salida") return "Ajuste de inventario";

  return text;
}

function splitRecipients(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAlertDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: process.env.NOTIFICATION_TIME_ZONE || "America/Mexico_City"
  }).format(new Date(value));
}

function notificationTimeoutMs() {
  return Number(process.env.NOTIFICATION_TIMEOUT_MS || 10000);
}

function notificationAbortSignal() {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return undefined;
  return AbortSignal.timeout(notificationTimeoutMs());
}

function buildStockAlertNotification(product, alert, user) {
  const date = formatAlertDate(alert.last_reported_at || alert.created_at || new Date());
  const reporterName = user.name || user.username || "Usuario";
  const reporter = `${reporterName} (${user.label || user.role || "sin rol"})`;
  const inventoryLevel = alert.inventoryLevel || "out";
  const currentStock = Number(product.stock);
  const minimumStock = Number(product.minStock ?? product.min_stock ?? 0);
  const isLowStock = inventoryLevel === "low";
  const status = isLowStock
    ? `Stock bajo: ${currentStock} disponibles; minimo ${minimumStock}`
    : "Agotado: 0 disponibles";
  const templateProduct = isLowStock
    ? `${product.name} - Stock bajo (${currentStock} disponibles)`
    : `${product.name} - Agotado`;
  const lines = [
    isLowStock ? "Aviso de inventario bajo" : "Aviso de producto agotado",
    "",
    `Fecha y hora: ${date}`,
    `Producto: ${product.name}`,
    `SKU: ${product.sku}`,
    `Categoria: ${product.category}`,
    `Subcategoria: ${product.subcategory || "Sin subcategoria"}`,
    `Estado: ${status}`,
    `Cantidad actual: ${currentStock}`,
    `Reportado por: ${reporter}`,
    `Mensaje: ${alert.message}`
  ];

  return {
    subject: isLowStock
      ? `Inventario bajo: ${product.name}`
      : `Producto agotado: ${product.name}`,
    text: lines.join("\n"),
    templateParameters: [
      templateProduct,
      product.category,
      date,
      reporterName
    ],
    whatsappTemplateName: isLowStock
      ? process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME || process.env.WHATSAPP_TEMPLATE_NAME
      : process.env.WHATSAPP_TEMPLATE_NAME
  };
}

async function sendStockAlertEmail(notification) {
  const to = splitRecipients(process.env.ALERT_EMAIL_TO);
  const from = process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!to.length || !from || !host) {
    return { channel: "email", status: "skipped", reason: "not_configured" };
  }

  const auth = process.env.SMTP_USER || process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    auth,
    connectionTimeout: notificationTimeoutMs(),
    greetingTimeout: notificationTimeoutMs(),
    socketTimeout: notificationTimeoutMs()
  });

  await transporter.sendMail({
    from,
    to,
    subject: notification.subject,
    text: notification.text
  });

  return { channel: "email", status: "sent", recipients: to.length };
}

async function sendStockAlertWhatsapp(notification) {
  const recipients = splitRecipients(process.env.ALERT_WHATSAPP_TO);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v20.0";
  const templateName = notification.whatsappTemplateName || process.env.WHATSAPP_TEMPLATE_NAME || "aviso_producto_agotado";
  const templateLanguage = notification.whatsappTemplateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es";
  const headerImageId = notification.whatsappHeaderImageId || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_ID;
  const headerImageUrl = notification.whatsappHeaderImageUrl || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL;

  if (!recipients.length || !token || !phoneNumberId) {
    return { channel: "whatsapp", status: "skipped", reason: "not_configured" };
  }
  if (typeof fetch !== "function") {
    return { channel: "whatsapp", status: "failed", error: "fetch_not_available" };
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const components = [
    {
      type: "body",
      parameters: notification.templateParameters.map((value) => ({
        type: "text",
        text: String(value || "Sin dato").slice(0, 900)
      }))
    }
  ];

  if (headerImageId || headerImageUrl) {
    components.unshift({
      type: "header",
      parameters: [
        {
          type: "image",
          image: headerImageId ? { id: headerImageId } : { link: headerImageUrl }
        }
      ]
    });
  }

  for (const to of recipients) {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: notificationAbortSignal(),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WhatsApp ${response.status}: ${body.slice(0, 300)}`);
    }
  }

  return { channel: "whatsapp", status: "sent", recipients: recipients.length };
}

async function notifyStockAlert(product, alert, user) {
  const notification = buildStockAlertNotification(product, alert, user);
  const results = [];

  for (const send of [sendStockAlertEmail, sendStockAlertWhatsapp]) {
    try {
      results.push(await send(notification));
    } catch (error) {
      console.warn(`No se pudo enviar aviso por ${send.name}:`, error.message);
      results.push({
        channel: notificationChannelName(send),
        status: "failed",
        error: publicNotificationError(error.message)
      });
    }
  }

  console.info(
    `Aviso de inventario para "${product.name}": ${results
      .map((result) => `${result.channel}=${result.status}`)
      .join(", ")}`
  );
  return results;
}

function inventoryLevel(product) {
  const stock = Number(product.stock);
  const minimumStock = Number(product.minStock ?? product.min_stock ?? 0);
  if (stock <= 0) return "out";
  if (stock <= minimumStock) return "low";
  return null;
}

async function notifyAutomaticStockAlertAfterExit(previousProduct, currentProduct, user) {
  const previousLevel = inventoryLevel(previousProduct);
  const level = inventoryLevel(currentProduct);
  if (!level) return { skipped: "healthy_inventory" };

  const existing = await query(
    `SELECT * FROM stock_alerts WHERE product_id = $1 AND status = 'open' LIMIT 1`,
    [currentProduct.id]
  );
  if (previousLevel === level && existing.rows[0]) {
    return { skipped: "alert_already_open", level };
  }

  const currentStock = Number(currentProduct.stock);
  const minimumStock = Number(currentProduct.minStock ?? currentProduct.min_stock ?? 0);
  const message = level === "out"
    ? "El producto quedo agotado despues de registrar una salida."
    : `El producto quedo con inventario bajo despues de registrar una salida: ${currentStock} disponibles; minimo ${minimumStock}.`;
  const alertResult = existing.rows[0]
    ? await query(
        `UPDATE stock_alerts
         SET product_name = $1,
             sku = $2,
             message = $3,
             created_by = $4,
             last_reported_at = now(),
             report_count = report_count + 1
         WHERE id = $5
         RETURNING *`,
        [
          currentProduct.name,
          currentProduct.sku,
          message,
          user.id,
          existing.rows[0].id
        ]
      )
    : await query(
        `INSERT INTO stock_alerts (product_id, product_name, sku, message, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          currentProduct.id,
          currentProduct.name,
          currentProduct.sku,
          message,
          user.id
        ]
      );

  const alert = { ...alertResult.rows[0], inventoryLevel: level };
  const notificationResults = await notifyStockAlert(currentProduct, alert, user);
  const savedAlert = await query(
    `UPDATE stock_alerts
     SET notification_results = $1::jsonb
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(notificationResults), alert.id]
  );

  return {
    level,
    alert: stockAlertDto(savedAlert.rows[0]),
    notifications: notificationResults
  };
}

async function safelyNotifyAutomaticStockAlertAfterExit(previousProduct, currentProduct, user) {
  try {
    return await notifyAutomaticStockAlertAfterExit(previousProduct, currentProduct, user);
  } catch (error) {
    console.warn(`No se pudo procesar el aviso automatico de "${currentProduct.name}":`, error.message);
    return {
      skipped: "notification_failed",
      error: publicNotificationError(error.message)
    };
  }
}

function notificationChannelName(send) {
  if (send === sendStockAlertEmail) return "email";
  if (send === sendStockAlertWhatsapp) return "whatsapp";
  return send.name || "notificacion";
}

function publicNotificationError(message) {
  const text = String(message || "");

  if (text.includes("131030") || text.includes("not in allowed list") || text.includes("lista de autorizados")) {
    return "El numero destinatario no esta autorizado en WhatsApp Cloud API. Revisa ALERT_WHATSAPP_TO y la lista de destinatarios de prueba.";
  }

  if (text.includes("OAuthException") || text.includes("Authentication Error") || text.includes('"code":190')) {
    return "Token de WhatsApp invalido o vencido. Actualiza WHATSAPP_ACCESS_TOKEN y reinicia el servidor.";
  }

  if (text.includes("does not exist") || text.includes("not found")) {
    return "La plantilla, imagen o numero de WhatsApp no existe o no pertenece a esta app.";
  }

  if (text.includes("parameter") || text.includes("template")) {
    return "La plantilla de WhatsApp no coincide con las variables configuradas.";
  }

  return text.slice(0, 180) || "No se pudo enviar la notificacion.";
}

function shiftExitAlertsEnabled() {
  return String(process.env.SHIFT_EXIT_ALERTS_ENABLED || "true").toLowerCase() !== "false";
}

function shiftAlertIntervalMinutes() {
  const minutes = Number(process.env.SHIFT_EXIT_ALERT_INTERVAL_MINUTES || 20);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 20;
}

function shiftAlertMaxRuns() {
  const maxRuns = Number(process.env.SHIFT_EXIT_ALERT_MAX_RUNS || 4);
  return Number.isInteger(maxRuns) && maxRuns > 0 ? maxRuns : 4;
}

function shiftAlertCheckMs() {
  const seconds = Number(process.env.SHIFT_EXIT_ALERT_CHECK_SECONDS || 60);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
}

function cronRequestAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !isVercel;

  const auth = req.get("authorization") || "";
  return auth === `Bearer ${secret}` || req.query.secret === secret;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatShiftTime(value) {
  const [hour, minute] = String(value || "00:00").split(":");
  const date = new Date(Date.UTC(2026, 0, 1, Number(hour), Number(minute || 0), 0));
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  }).format(date);
}

function localDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NOTIFICATION_TIME_ZONE || "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second || 0)
  };
}

function activeShiftExitAlert(now = new Date()) {
  const local = localDateTimeParts(now);
  const currentMinutes = local.hour * 60 + local.minute;
  const interval = shiftAlertIntervalMinutes();

  for (const shift of shiftExitAlertShifts) {
    const alertFrom = timeToMinutes(shift.alertFrom);
    const end = timeToMinutes(shift.end);
    if (currentMinutes >= alertFrom && currentMinutes <= end) {
      return {
        ...shift,
        date: local.date,
        bucketMinutes: Math.floor(currentMinutes / interval) * interval,
        interval
      };
    }
  }

  return null;
}

async function loadShiftExitMissingUsers(shift) {
  const result = await query(
    `SELECT users.*
     FROM users
     WHERE users.role = 'staff'
       AND NOT EXISTS (
         SELECT 1
         FROM movements
         WHERE movements.created_by = users.id
           AND movements.quantity < 0
           AND COALESCE(movements.movement_type, '') <> 'eliminacion'
           AND movements.created_at >= (($1::date + $2::time) AT TIME ZONE $4)
           AND movements.created_at < (($1::date + $3::time) AT TIME ZONE $4) + INTERVAL '1 minute'
       )
     ORDER BY users.name ASC`,
    [
      shift.date,
      shift.start,
      shift.end,
      process.env.NOTIFICATION_TIME_ZONE || "America/Mexico_City"
    ]
  );

  return result.rows.map(userDto);
}

function buildShiftExitNotification(shift, missingUsers) {
  const date = formatAlertDate(new Date());
  const schedule = `${formatShiftTime(shift.start)} a ${formatShiftTime(shift.end)}`;
  const alertFrom = formatShiftTime(shift.alertFrom);
  const missingText = missingUsers.map((user) => `${user.name} (${user.username})`).join(", ");
  const lines = [
    "Aviso de salidas pendientes",
    "",
    `Fecha y hora: ${date}`,
    `Turno: ${shift.label}`,
    `Horario del turno: ${schedule}`,
    `Ventana de avisos: desde ${alertFrom}, cada ${shift.interval} minutos`,
    `Cocineros sin salida registrada: ${missingText}`,
    "",
    "Revisa con el equipo si ya registraron lo utilizado durante el turno."
  ];

  return {
    subject: `Salidas pendientes - ${shift.label}`,
    text: lines.join("\n"),
    whatsappTemplateName: process.env.SHIFT_ALERT_WHATSAPP_TEMPLATE_NAME || "aviso_salida_pendiente",
    whatsappTemplateLanguage: process.env.SHIFT_ALERT_WHATSAPP_TEMPLATE_LANGUAGE || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es",
    whatsappHeaderImageId: process.env.SHIFT_ALERT_WHATSAPP_TEMPLATE_HEADER_IMAGE_ID || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_ID,
    whatsappHeaderImageUrl: process.env.SHIFT_ALERT_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
    templateParameters: [
      shift.label,
      schedule,
      date,
      missingText
    ]
  };
}

function buildShiftExitCompletionNotification(shift, user) {
  const date = formatAlertDate(new Date());
  const schedule = `${formatShiftTime(shift.start)} a ${formatShiftTime(shift.end)}`;
  const cookName = `${user.name} (${user.username})`;
  const lines = [
    "Salida registrada",
    "",
    `Fecha y hora: ${date}`,
    `Turno: ${shift.label}`,
    `Horario del turno: ${schedule}`,
    `Cocinero: ${cookName}`,
    "",
    "El cocinero ya registro una salida. Se dejan de enviar recordatorios para esta cuenta en este turno."
  ];

  return {
    subject: `Salida registrada - ${user.name}`,
    text: lines.join("\n"),
    whatsappTemplateName: process.env.SHIFT_COMPLETION_WHATSAPP_TEMPLATE_NAME || "aviso_salida_realizada",
    whatsappTemplateLanguage: process.env.SHIFT_COMPLETION_WHATSAPP_TEMPLATE_LANGUAGE || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es",
    whatsappHeaderImageId: process.env.SHIFT_COMPLETION_WHATSAPP_TEMPLATE_HEADER_IMAGE_ID || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_ID,
    whatsappHeaderImageUrl: process.env.SHIFT_COMPLETION_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
    templateParameters: [
      cookName,
      shift.label,
      schedule,
      date
    ]
  };
}

async function notifyShiftExitReminder(shift, missingUsers) {
  const notification = buildShiftExitNotification(shift, missingUsers);
  const results = [];

  for (const send of [sendStockAlertEmail, sendStockAlertWhatsapp]) {
    try {
      results.push(await send(notification));
    } catch (error) {
      console.warn(`No se pudo enviar aviso de salidas por ${send.name}:`, error.message);
      results.push({
        channel: notificationChannelName(send),
        status: "failed",
        error: publicNotificationError(error.message)
      });
    }
  }

  return results;
}

async function notifyShiftExitCompletion(shift, user) {
  const notification = buildShiftExitCompletionNotification(shift, user);
  const results = [];

  for (const send of [sendStockAlertEmail, sendStockAlertWhatsapp]) {
    try {
      results.push(await send(notification));
    } catch (error) {
      console.warn(`No se pudo enviar aviso de salida realizada por ${send.name}:`, error.message);
      results.push({
        channel: notificationChannelName(send),
        status: "failed",
        error: publicNotificationError(error.message)
      });
    }
  }

  return results;
}

async function notifyShiftExitCompletionForUser(userId, now = new Date()) {
  if (!shiftExitAlertsEnabled() || !userId) return { skipped: "disabled" };

  const shift = activeShiftExitAlert(now);
  if (!shift) return { skipped: "outside_window" };

  const userResult = await query(`SELECT * FROM users WHERE id = $1 AND role = 'staff'`, [userId]);
  const user = userResult.rows[0];
  if (!user) return { skipped: "not_staff" };

  const previousReminder = await query(
    `SELECT id
     FROM shift_exit_alert_runs
     WHERE shift_key = $1
       AND shift_date = $2
       AND (
         missing_user_ids LIKE '%' || $3 || '%'
         OR missing_users LIKE '%' || $4 || '%'
       )
     LIMIT 1`,
    [shift.key, shift.date, user.id, user.username]
  );

  if (!previousReminder.rows[0]) {
    return { skipped: "no_previous_reminder", shift: shift.key };
  }

  const inserted = await query(
    `INSERT INTO shift_exit_completion_notices (shift_key, shift_date, user_id, user_name, username)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shift_key, shift_date, user_id) DO NOTHING
     RETURNING id`,
    [shift.key, shift.date, user.id, user.name, user.username]
  );

  const notice = inserted.rows[0];
  if (!notice) return { skipped: "already_notified", shift: shift.key };

  const results = await notifyShiftExitCompletion(shift, userDto(user));
  await query(
    `UPDATE shift_exit_completion_notices
     SET notification_results = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(results), notice.id]
  );

  return { sent: true, shift: shift.key, user: user.username, results };
}

async function runShiftExitAlertCheck(now = new Date()) {
  if (!shiftExitAlertsEnabled()) return { skipped: "disabled" };

  const shift = activeShiftExitAlert(now);
  if (!shift) return { skipped: "outside_window" };

  const missingUsers = await loadShiftExitMissingUsers(shift);
  if (!missingUsers.length) return { skipped: "no_missing_users", shift: shift.key };

  const sentCount = await query(
    `SELECT COUNT(*)::int AS total
     FROM shift_exit_alert_runs
     WHERE shift_key = $1 AND shift_date = $2`,
    [shift.key, shift.date]
  );
  if (Number(sentCount.rows[0]?.total || 0) >= shiftAlertMaxRuns()) {
    return { skipped: "max_sent", shift: shift.key };
  }

  const inserted = await query(
    `INSERT INTO shift_exit_alert_runs (shift_key, shift_date, bucket_minutes, missing_users, missing_user_ids)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shift_key, shift_date, bucket_minutes) DO NOTHING
     RETURNING id`,
    [
      shift.key,
      shift.date,
      shift.bucketMinutes,
      missingUsers.map((user) => user.username).join(", "),
      missingUsers.map((user) => user.id).join(",")
    ]
  );

  const run = inserted.rows[0];
  if (!run) return { skipped: "already_sent", shift: shift.key };

  const results = await notifyShiftExitReminder(shift, missingUsers);
  await query(
    `UPDATE shift_exit_alert_runs
     SET notification_results = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(results), run.id]
  );

  return { sent: true, shift: shift.key, missingUsers: missingUsers.length, results };
}

function startShiftExitAlertScheduler() {
  if (!shiftExitAlertsEnabled()) {
    console.log("Avisos de salidas por turno desactivados.");
    return;
  }

  const run = () => {
    runShiftExitAlertCheck().catch((error) => {
      console.warn("No se pudo revisar avisos de salidas por turno:", error.message);
    });
  };

  run();
  setInterval(run, shiftAlertCheckMs());
}

function ensureReady({ scheduler = false } = {}) {
  if (!databaseUrl) {
    return Promise.reject(new Error("Falta DATABASE_URL o POSTGRES_URL. Configura PostgreSQL antes de iniciar."));
  }

  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureSchema();
      await seedUsers();
      await seedProducts();
      if (scheduler) startShiftExitAlertScheduler();
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }

  return readyPromise;
}

function smartAlertTypeLabel(type) {
  return {
    out_of_stock: "Agotado",
    low_stock: "Bajo minimo",
    no_movement: "Sin movimiento",
    fast_consumption: "Consumo rapido",
    depleting_soon: "Proximo a agotarse"
  }[type] || "Alerta";
}

function suggestedRestockAmount(product, alert) {
  const stock = Number(product.stock);
  const minStock = Number(product.min_stock ?? product.minStock ?? 0);
  const coverDays = Number(process.env.SMART_RESTOCK_COVER_DAYS || 14);
  const averageDailyOut = Number(alert?.averageDailyOut || 0);

  let targetStock = Math.max(minStock * 2, minStock + 1);
  if (averageDailyOut > 0) {
    targetStock = Math.max(targetStock, Math.ceil(averageDailyOut * coverDays));
  }

  return Math.max(targetStock - stock, 0);
}

function restockableAlertTypes() {
  return new Set(["out_of_stock", "low_stock", "depleting_soon", "fast_consumption"]);
}

function buildRestockSuggestions(alerts) {
  const alertsByProduct = new Map();
  const types = restockableAlertTypes();

  alerts
    .filter((alert) => types.has(alert.type))
    .forEach((alert) => {
      const current = alertsByProduct.get(alert.productId);
      if (!current || alert.priority > current.priority) {
        alertsByProduct.set(alert.productId, alert);
      }
    });

  return [...alertsByProduct.values()]
    .map((alert) => {
      const amount = suggestedRestockAmount(
        { stock: alert.stock, min_stock: alert.minStock, minStock: alert.minStock },
        alert
      );

      return {
        productId: alert.productId,
        productName: alert.productName,
        sku: alert.sku,
        category: alert.category,
        subcategory: alert.subcategory,
        stock: alert.stock,
        minStock: alert.minStock,
        reason: alert.label,
        reasonType: alert.type,
        message: alert.message,
        suggestedQuantity: amount,
        targetStock: alert.stock + amount,
        priority: alert.priority
      };
    })
    .filter((item) => item.suggestedQuantity > 0)
    .sort((a, b) => b.priority - a.priority || b.suggestedQuantity - a.suggestedQuantity || a.productName.localeCompare(b.productName, "es"));
}

async function loadSmartAlerts() {
  const noMovementDays = Number(process.env.SMART_ALERT_NO_MOVEMENT_DAYS || 14);
  const depletionDays = Number(process.env.SMART_ALERT_DEPLETION_DAYS || 7);
  const fastWindowDays = 7;

  const result = await query(
    `SELECT
       products.*,
       stats.last_movement_at,
       COALESCE(stats.out_7, 0)::int AS out_7,
       COALESCE(stats.out_14, 0)::int AS out_14
     FROM products
     LEFT JOIN (
       SELECT
         product_id,
         MAX(created_at) AS last_movement_at,
         SUM(CASE WHEN quantity < 0 AND COALESCE(movement_type, '') <> 'eliminacion' AND created_at >= now() - INTERVAL '7 days' THEN ABS(quantity) ELSE 0 END)::int AS out_7,
         SUM(CASE WHEN quantity < 0 AND COALESCE(movement_type, '') <> 'eliminacion' AND created_at >= now() - INTERVAL '14 days' THEN ABS(quantity) ELSE 0 END)::int AS out_14
       FROM movements
       GROUP BY product_id
     ) stats ON stats.product_id = products.id
     ORDER BY products.name ASC`
  );

  const alerts = [];
  const now = Date.now();

  result.rows.forEach((row) => {
    const product = productDto(row);
    const out7 = Number(row.out_7 || 0);
    const out14 = Number(row.out_14 || 0);
    const avgDaily7 = out7 / fastWindowDays;
    const avgDaily14 = out14 / 14;
    const lastMovementAt = row.last_movement_at;
    const activityAt = lastMovementAt || row.created_at || row.updated_at;
    const daysSinceMovement = activityAt
      ? Math.floor((now - new Date(activityAt).getTime()) / 86400000)
      : null;
    const daysRemaining = avgDaily14 > 0 ? product.stock / avgDaily14 : null;

    const base = {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      subcategory: product.subcategory,
      stock: product.stock,
      minStock: product.minStock,
      out7,
      out14,
      averageDailyOut: Number(avgDaily14.toFixed(2)),
      daysRemaining: daysRemaining === null ? null : Number(daysRemaining.toFixed(1)),
      lastMovementAt,
      daysSinceMovement
    };

    if (product.stock === 0) {
      alerts.push({
        ...base,
        type: "out_of_stock",
        label: smartAlertTypeLabel("out_of_stock"),
        severity: "critical",
        priority: 100,
        message: "Producto agotado."
      });
      return;
    }

    if (product.stock <= product.minStock) {
      alerts.push({
        ...base,
        type: "low_stock",
        label: smartAlertTypeLabel("low_stock"),
        severity: "high",
        priority: 85,
        message: `Stock bajo: ${product.stock}/${product.minStock}.`
      });
    }

    if (daysRemaining !== null && daysRemaining <= depletionDays) {
      alerts.push({
        ...base,
        type: "depleting_soon",
        label: smartAlertTypeLabel("depleting_soon"),
        severity: "high",
        priority: 80,
    message: `Podria agotarse en ${daysRemaining.toFixed(1)} dias segun usos recientes.`
      });
    }

    if (out7 >= Math.max(5, product.minStock) || avgDaily7 >= 2) {
      alerts.push({
        ...base,
        type: "fast_consumption",
        label: smartAlertTypeLabel("fast_consumption"),
        severity: "medium",
        priority: 70,
        message: `Consumo alto: ${out7} unidades salieron en 7 dias.`
      });
    }

    if ((daysSinceMovement === null || daysSinceMovement >= noMovementDays) && product.stock > 0) {
      alerts.push({
        ...base,
        type: "no_movement",
        label: smartAlertTypeLabel("no_movement"),
        severity: "low",
        priority: 45,
        message: lastMovementAt
          ? `Sin movimientos desde hace ${daysSinceMovement} dias.`
          : `Sin movimientos registrados desde hace ${daysSinceMovement || noMovementDays} dias.`
      });
    }
  });

  const sortedAlerts = alerts.sort((a, b) => b.priority - a.priority || a.productName.localeCompare(b.productName, "es"));
  const summary = sortedAlerts.reduce(
    (acc, alert) => {
      acc.total += 1;
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  return { summary, alerts: sortedAlerts };
}

function defaultReportRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = firstDay.toISOString().slice(0, 10);
  return { from, to };
}

function parseReportRange(req) {
  const defaults = defaultReportRange();
  const from = String(req.query.from || defaults.from).trim();
  const to = String(req.query.to || defaults.to).trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/;

  if (!validDate.test(from) || !validDate.test(to)) {
    const error = new Error("Fechas invalidas. Usa formato YYYY-MM-DD");
    error.status = 400;
    throw error;
  }

  if (from > to) {
    const error = new Error("La fecha inicial no puede ser mayor a la fecha final");
    error.status = 400;
    throw error;
  }

  return { from, to };
}

function parsePurchaseFilters(req) {
  const category = String(req.query.category || "").trim();
  const productId = String(req.query.productId || "").trim();
  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (productId && productId !== "all" && !validUuid.test(productId)) {
    const error = new Error("Producto invalido para el reporte de entradas");
    error.status = 400;
    throw error;
  }

  return {
    category: category && category !== "all" ? category : "",
    productId: productId && productId !== "all" ? productId : ""
  };
}

function reportCategoryPath(item) {
  if (item.subcategory) return `${item.category || "Sin categoria"} / ${item.subcategory}`;
  return item.category || "Sin categoria";
}

function incomeReportDto(row) {
  return {
    id: row.id,
    date: row.created_at,
    productName: row.product_name,
    sku: row.sku,
    category: row.category || "Sin categoria",
    subcategory: row.subcategory || "",
    quantity: Number(row.quantity),
    unitsSold: Number(row.units_sold),
    unitPrice: Number(row.unit_price || 0),
    total: Number(row.total || 0),
    userName: row.created_by_name || "Sin usuario"
  };
}

function summarizeIncomeReport(rows) {
  const totalsByCategory = new Map();
  const summary = rows.reduce(
    (acc, item) => {
      acc.totalIncome += item.total;
      acc.totalUnits += item.unitsSold;
      acc.totalMovements += 1;
      const category = reportCategoryPath(item);
      totalsByCategory.set(category, (totalsByCategory.get(category) || 0) + item.total);
      return acc;
    },
    { totalIncome: 0, totalUnits: 0, totalMovements: 0 }
  );

  return {
    ...summary,
    totalsByCategory: [...totalsByCategory.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  };
}

async function loadIncomeReport(from, to) {
  const result = await query(
    `SELECT
       movements.id,
       movements.product_name,
       movements.sku,
       COALESCE(products.category, 'Sin categoria') AS category,
       COALESCE(products.subcategory, '') AS subcategory,
       movements.quantity,
       ABS(movements.quantity)::int AS units_sold,
       COALESCE(movements.unit_price, products.price, 0)::numeric AS unit_price,
       (ABS(movements.quantity) * COALESCE(movements.unit_price, products.price, 0))::numeric AS total,
       movements.movement_type,
       users.name AS created_by_name,
       movements.created_at
     FROM movements
     LEFT JOIN products ON products.id = movements.product_id
     LEFT JOIN users ON users.id = movements.created_by
     WHERE movements.quantity < 0
       AND (movements.movement_type = 'venta' OR movements.note IN ('Salida rapida', 'Venta rapida', 'Uso rapido'))
       AND movements.created_at >= $1::date
       AND movements.created_at < ($2::date + INTERVAL '1 day')
     ORDER BY movements.created_at ASC`,
    [from, to]
  );
  const rows = result.rows.map(incomeReportDto);
  return { range: { from, to }, summary: summarizeIncomeReport(rows), rows };
}

async function buildIncomeReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario La Querendona";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Ingresos");
  sheet.properties.defaultRowHeight = 20;

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = "Reporte de ingresos - Inventario La Querendona";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF156B73" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.addRow([]);
  sheet.addRow(["Fecha inicial", report.range.from, "", "Fecha final", report.range.to]);
  sheet.addRow(["Valor total", report.summary.totalIncome, "", "Unidades utilizadas", report.summary.totalUnits]);
  sheet.addRow(["Movimientos", report.summary.totalMovements]);
  sheet.addRow([]);

  const header = sheet.addRow(["Fecha y hora", "Producto", "SKU", "Categoria", "Subcategoria", "Cantidad", "Precio unitario", "Total", "Usuario"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17202A" } };

  report.rows.forEach((item) => {
    sheet.addRow([
      new Date(item.date),
      item.productName,
      item.sku,
      item.category,
      item.subcategory,
      item.unitsSold,
      item.unitPrice,
      item.total,
      item.userName
    ]);
  });

  const totalRow = sheet.addRow(["", "", "", "", "TOTAL", report.summary.totalUnits, "", report.summary.totalIncome, ""]);
  totalRow.font = { bold: true };

  sheet.getColumn(1).numFmt = "dd/mm/yyyy hh:mm";
  sheet.getColumn(7).numFmt = '"$"#,##0.00';
  sheet.getColumn(8).numFmt = '"$"#,##0.00';
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 16;
  sheet.getColumn(8).width = 16;
  sheet.getColumn(9).width = 20;
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: Math.max(header.number, header.number + report.rows.length), column: 9 }
  };

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Reporte de ingresos"]);
  summarySheet.addRow(["Periodo", `${report.range.from} a ${report.range.to}`]);
  summarySheet.addRow(["Valor total", report.summary.totalIncome]);
  summarySheet.addRow(["Unidades utilizadas", report.summary.totalUnits]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Categoria", "Total"]);
  report.summary.totalsByCategory.forEach((item) => summarySheet.addRow([item.category, item.total]));
  summarySheet.getColumn(1).width = 26;
  summarySheet.getColumn(2).width = 16;
  summarySheet.getColumn(2).numFmt = '"$"#,##0.00';
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(6).font = { bold: true };

  return workbook;
}

function exitReportDto(row) {
  const movementType = normalizeMovementType(row.movement_type, Number(row.quantity), row.note);
  return {
    id: row.id,
    date: row.created_at,
    productName: row.product_name,
    sku: row.sku,
    category: row.category || "Sin categoria",
    subcategory: row.subcategory || "",
    movementType,
    movementTypeLabel: movementTypeLabel(movementType),
    supplierType: row.supplier_type || "Proveedor local",
    measureUnit: row.measure_unit || "Pieza",
    note: displayMovementNote(row.note, movementType),
    quantity: Number(row.quantity),
    unitsOut: Number(row.units_out),
    unitPrice: Number(row.unit_price || 0),
    total: Number(row.total || 0),
    userName: row.created_by_name || "Sin usuario"
  };
}

function summarizeExitReport(rows) {
  const totalsByReason = new Map();
  const totalsByCategory = new Map();
  const summary = rows.reduce(
    (acc, item) => {
      acc.totalValue += item.total;
      acc.totalUnits += item.unitsOut;
      acc.totalMovements += 1;

      const reason = totalsByReason.get(item.note) || { reason: item.note, units: 0, total: 0 };
      reason.units += item.unitsOut;
      reason.total += item.total;
      totalsByReason.set(item.note, reason);

      const categoryName = reportCategoryPath(item);
      const category = totalsByCategory.get(categoryName) || { category: categoryName, units: 0, total: 0 };
      category.units += item.unitsOut;
      category.total += item.total;
      totalsByCategory.set(categoryName, category);

      return acc;
    },
    { totalValue: 0, totalUnits: 0, totalMovements: 0 }
  );

  return {
    ...summary,
    totalsByReason: [...totalsByReason.values()].sort((a, b) => b.total - a.total),
    totalsByCategory: [...totalsByCategory.values()].sort((a, b) => b.total - a.total)
  };
}

async function loadExitReport(from, to) {
  const result = await query(
    `SELECT
       movements.id,
       movements.product_name,
       movements.sku,
       COALESCE(products.category, 'Sin categoria') AS category,
       COALESCE(products.subcategory, '') AS subcategory,
       movements.quantity,
       ABS(movements.quantity)::int AS units_out,
       COALESCE(movements.unit_price, products.price, 0)::numeric AS unit_price,
       (ABS(movements.quantity) * COALESCE(movements.unit_price, products.price, 0))::numeric AS total,
       movements.movement_type,
       movements.supplier_type,
       movements.measure_unit,
       movements.note,
       users.name AS created_by_name,
       movements.created_at
     FROM movements
     LEFT JOIN products ON products.id = movements.product_id
     LEFT JOIN users ON users.id = movements.created_by
     WHERE movements.quantity < 0
       AND movements.created_at >= $1::date
       AND movements.created_at < ($2::date + INTERVAL '1 day')
     ORDER BY movements.created_at DESC, movements.id DESC`,
    [from, to]
  );
  const rows = result.rows.map(exitReportDto);
  return { range: { from, to }, summary: summarizeExitReport(rows), rows };
}

async function buildExitReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario La Querendona";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Uso de insumos");
  sheet.properties.defaultRowHeight = 20;

  sheet.mergeCells("A1:M1");
  sheet.getCell("A1").value = "Reporte de uso de insumos - Inventario La Querendona";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF156B73" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.addRow([]);
  sheet.addRow(["Fecha inicial", report.range.from, "", "Fecha final", report.range.to]);
  sheet.addRow(["Valor total utilizado", report.summary.totalValue, "", "Unidades utilizadas", report.summary.totalUnits]);
  sheet.addRow(["Movimientos", report.summary.totalMovements]);
  sheet.addRow([]);

  const header = sheet.addRow([
    "Fecha y hora",
    "Producto",
    "SKU",
    "Categoria",
    "Subcategoria",
    "Tipo",
    "Proveedor",
    "Motivo",
    "Cantidad utilizada",
    "Unidad",
    "Precio unitario",
    "Total",
    "Usuario"
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17202A" } };

  report.rows.forEach((item) => {
    sheet.addRow([
      new Date(item.date),
      item.productName,
      item.sku,
      item.category,
      item.subcategory,
      item.movementTypeLabel,
      item.supplierType,
      item.note,
      item.unitsOut,
      item.measureUnit,
      item.unitPrice,
      item.total,
      item.userName
    ]);
  });

  const totalRow = sheet.addRow(["", "", "", "", "", "", "", "TOTAL", report.summary.totalUnits, "", "", report.summary.totalValue, ""]);
  totalRow.font = { bold: true };

  sheet.getColumn(1).numFmt = "dd/mm/yyyy hh:mm";
  sheet.getColumn(11).numFmt = '"$"#,##0.00';
  sheet.getColumn(12).numFmt = '"$"#,##0.00';
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 22;
  sheet.getColumn(8).width = 16;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 16;
  sheet.getColumn(11).width = 16;
  sheet.getColumn(12).width = 16;
  sheet.getColumn(13).width = 20;
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: Math.max(header.number, header.number + report.rows.length), column: 13 }
  };

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Reporte de uso de insumos"]);
  summarySheet.addRow(["Periodo", `${report.range.from} a ${report.range.to}`]);
  summarySheet.addRow(["Valor total utilizado", report.summary.totalValue]);
  summarySheet.addRow(["Unidades utilizadas", report.summary.totalUnits]);
  summarySheet.addRow(["Movimientos", report.summary.totalMovements]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Motivo", "Unidades", "Total"]);
  report.summary.totalsByReason.forEach((item) => summarySheet.addRow([item.reason, item.units, item.total]));
  summarySheet.addRow([]);
  summarySheet.addRow(["Categoria", "Unidades", "Total"]);
  report.summary.totalsByCategory.forEach((item) => summarySheet.addRow([item.category, item.units, item.total]));
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 14;
  summarySheet.getColumn(3).width = 16;
  summarySheet.getColumn(3).numFmt = '"$"#,##0.00';
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(7).font = { bold: true };
  summarySheet.getRow(9 + report.summary.totalsByReason.length).font = { bold: true };

  return workbook;
}

function summarizePurchaseReport(rows) {
  const supplierTotals = new Map();
  const categoryTotals = new Map();
  const suppliers = new Set();
  const summary = rows.reduce(
    (acc, item) => {
      acc.totalCost += item.totalCost;
      acc.totalUnits += item.quantity;
      acc.totalEntries += 1;
      suppliers.add(item.supplier);

      const supplier = supplierTotals.get(item.supplier) || { supplier: item.supplier, units: 0, total: 0 };
      supplier.units += item.quantity;
      supplier.total += item.totalCost;
      supplierTotals.set(item.supplier, supplier);

      const categoryName = reportCategoryPath(item);
      const category = categoryTotals.get(categoryName) || { category: categoryName, units: 0, total: 0 };
      category.units += item.quantity;
      category.total += item.totalCost;
      categoryTotals.set(categoryName, category);

      return acc;
    },
    { totalCost: 0, totalUnits: 0, totalEntries: 0 }
  );

  return {
    ...summary,
    totalSuppliers: suppliers.size,
    totalsBySupplier: [...supplierTotals.values()].sort((a, b) => b.total - a.total),
    totalsByCategory: [...categoryTotals.values()].sort((a, b) => b.total - a.total)
  };
}

async function loadPurchaseReport(from, to, filters = {}) {
  const params = [from, to];
  const conditions = [
    `purchase_entries.created_at >= $1::date`,
    `purchase_entries.created_at < ($2::date + INTERVAL '1 day')`
  ];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`purchase_entries.category = $${params.length}`);
  }

  if (filters.productId) {
    params.push(filters.productId);
    conditions.push(`purchase_entries.product_id = $${params.length}::uuid`);
  }

  const result = await query(
    `SELECT
       purchase_entries.*,
       users.name AS created_by_name
     FROM purchase_entries
     LEFT JOIN users ON users.id = purchase_entries.created_by
     WHERE ${conditions.join("\n       AND ")}
     ORDER BY purchase_entries.created_at DESC`,
    params
  );
  const rows = result.rows.map(purchaseDto);
  return { range: { from, to }, 
  filters, 
  summary: summarizePurchaseReport(rows), 
  rows };
}

  async function loadProductsByCategoryReport(category = "") {
  const params = [];
  let whereClause = "";

  if (category && category !== "all") {
    params.push(category);
    whereClause = `WHERE category = $1`;
  }

  const result = await query(
    `
      SELECT *
      FROM products
      ${whereClause}
      ORDER BY name ASC
    `,
    params
  );

  return result.rows.map(productDto);
}

async function buildPurchaseReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario La Querendona";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Compras");
  sheet.properties.defaultRowHeight = 20;

  sheet.mergeCells("A1:L1");
  sheet.getCell("A1").value = "Reporte de entradas y compras - Inventario La Querendona";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF156B73" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.addRow([]);
  sheet.addRow(["Fecha inicial", report.range.from, "", "Fecha final", report.range.to]);
  sheet.addRow([
    "Categoria",
    report.filters?.category || "Todas",
    "",
    "Producto",
    report.filters?.productId ? report.rows[0]?.productName || report.filters.productId : "Todos"
  ]);
  sheet.addRow(["Costo total", report.summary.totalCost, "", "Unidades compradas", report.summary.totalUnits]);
  sheet.addRow(["Entradas", report.summary.totalEntries, "", "Proveedores", report.summary.totalSuppliers]);
  sheet.addRow([]);

  const header = sheet.addRow([
    "Fecha y hora",
    "Producto",
    "SKU",
    "Categoria",
    "Subcategoria",
    "Proveedor",
    "Cantidad",
    "Unidad",
    "Costo unitario",
    "Total",
    "Nota",
    "Usuario"
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17202A" } };

  report.rows.forEach((item) => {
    sheet.addRow([
      new Date(item.createdAt),
      item.productName,
      item.sku,
      item.category,
      item.subcategory,
      item.supplier,
      item.quantity,
      item.measureUnit,
      item.unitCost,
      item.totalCost,
      item.note,
      item.createdByName
    ]);
  });

  const totalRow = sheet.addRow(["", "", "", "", "", "TOTAL", report.summary.totalUnits, "", "", report.summary.totalCost, "", ""]);
  totalRow.font = { bold: true };

  sheet.getColumn(1).numFmt = "dd/mm/yyyy hh:mm";
  sheet.getColumn(9).numFmt = '"$"#,##0.00';
  sheet.getColumn(10).numFmt = '"$"#,##0.00';
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 24;
  sheet.getColumn(7).width = 16;
  sheet.getColumn(8).width = 16;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 16;
  sheet.getColumn(11).width = 26;
  sheet.getColumn(12).width = 20;
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: Math.max(header.number, header.number + report.rows.length), column: 12 }
  };

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Reporte de entradas y compras"]);
  summarySheet.addRow(["Periodo", `${report.range.from} a ${report.range.to}`]);
  summarySheet.addRow(["Categoria", report.filters?.category || "Todas"]);
  summarySheet.addRow(["Producto", report.filters?.productId ? report.rows[0]?.productName || report.filters.productId : "Todos"]);
  summarySheet.addRow(["Costo total", report.summary.totalCost]);
  summarySheet.addRow(["Unidades compradas", report.summary.totalUnits]);
  summarySheet.addRow(["Entradas", report.summary.totalEntries]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Proveedor", "Unidades", "Total"]);
  report.summary.totalsBySupplier.forEach((item) => summarySheet.addRow([item.supplier, item.units, item.total]));
  summarySheet.addRow([]);
  summarySheet.addRow(["Categoria", "Unidades", "Total"]);
  report.summary.totalsByCategory.forEach((item) => summarySheet.addRow([item.category, item.units, item.total]));
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 14;
  summarySheet.getColumn(3).width = 16;
  summarySheet.getColumn(3).numFmt = '"$"#,##0.00';
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(9).font = { bold: true };
  summarySheet.getRow(11 + report.summary.totalsBySupplier.length).font = { bold: true };

  return workbook;
}


async function buildProductsWorkbook(products, category = "Todas") {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Productos");

  // TITULO
  sheet.mergeCells("A1:H1");
  const titleRow = sheet.getCell("A1");
  titleRow.value = "Inventario La Querendona";
  titleRow.font = {
    bold: true,
    size: 16
  };
  titleRow.alignment = {
    horizontal: "center"
  };

  // FECHA
  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value =
    `Generado: ${new Date().toLocaleDateString()}`;

  // CATEGORIA
  sheet.mergeCells("A3:H3");
  sheet.getCell("A3").value =
    `Categoría: ${category || "Todas"}`;

  // FILA ENCABEZADOS
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    "Producto",
    "Descripcion",
    "Categoria",
    "Subcategoria",
    "Proveedor",
    "Stock",
    "Precio",
    "Costo"
  ]);


headerRow.font = {
  bold: true,
  size: 12
};

headerRow.alignment = {
  vertical: "middle",
  horizontal: "center"
};

headerRow.height = 25;

headerRow.eachCell((cell) => {
  cell.font = {
    bold: true,
    color: { argb: "000000" }
  };

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "D9EAD3" }
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle"
  };

  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" }
  };
});

headerRow.height = 25;

headerRow.height = 25;

headerRow.eachCell((cell) => {
  cell.font = {
    bold: true,
    color: { argb: "000000" }
  };

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "D9EAD3" }
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle"
  };

  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" }
  };
});

sheet.columns = [
  { width: 35 }, // Producto
  { width: 40 }, // Descripcion
  { width: 25 }, // Categoria
  { width: 25 }, // Subcategoria
  { width: 25 }, // Proveedor
  { width: 12 }, // Stock
  { width: 15 }, // Precio
  { width: 15 }  // Costo
];

// Centrar columnas numéricas
sheet.getColumn(6).alignment = {
  horizontal: "center"
};

sheet.getColumn(7).alignment = {
  horizontal: "center"
};

sheet.getColumn(8).alignment = {
  horizontal: "center"
};

// Formato moneda
sheet.getColumn(7).numFmt = '$#,##0.00';
sheet.getColumn(8).numFmt = '$#,##0.00';



  products.forEach((p) => {
  sheet.addRow([
    p.name,
    p.description,
    p.category,
    p.subcategory,
    p.supplier,
    p.stock,
    p.price,
    p.cost
  ]);
});

// FILTROS AUTOMATICOS
sheet.autoFilter = {
  from: {
    row: 5,
    column: 1
  },
  to: {
    row: 5,
    column: 8
  }
};

// CONGELAR ENCABEZADOS
sheet.views = [
  {
    state: "frozen",
    ySplit: 5
  }
];

// ANCHO COLUMNAS
sheet.columns = [
  { width: 30 },
  { width: 30 },
  { width: 20 },
  { width: 20 },
  { width: 25 },
  { width: 12 },
  { width: 12 },
  { width: 12 }
];

// FORMATO MONEDA
sheet.getColumn(7).numFmt = '$#,##0.00';
sheet.getColumn(8).numFmt = '$#,##0.00';

// CENTRAR STOCK
sheet.getColumn(6).alignment = {
  horizontal: "center"
};

sheet.getColumn(7).alignment = {
  horizontal: "center"
};

sheet.getColumn(8).alignment = {
  horizontal: "center"
};

  return workbook;
}



function stockComparisonDto(row) {
  return {
    productKey: row.product_key,
    productName: row.product_name || "Producto sin nombre",
    sku: row.sku || "",
    category: row.category || "Sin categoria",
    subcategory: row.subcategory || "",
    estimatedStartStock: Number(row.estimated_start_stock || 0),
    unitsIn: Number(row.units_in || 0),
    unitsOut: Number(row.units_out || 0),
    balanceUnits: Number(row.balance_units || 0),
    purchaseCost: Number(row.purchase_cost || 0),
    consumedCost: Number(row.consumed_cost || 0),
    consumedValue: Number(row.consumed_value || 0),
    currentStock: Number(row.current_stock || 0),
    entriesCount: Number(row.entries_count || 0),
    exitsCount: Number(row.exits_count || 0)
  };
}

function summarizeStockComparison(rows) {
  return rows.reduce(
    (acc, item) => {
      acc.totalProducts += 1;
      acc.totalUnitsIn += item.unitsIn;
      acc.totalUnitsOut += item.unitsOut;
      acc.totalPurchaseCost += item.purchaseCost;
      acc.totalConsumedCost += item.consumedCost;
      acc.totalCurrentStock += item.currentStock;
      if (item.unitsOut > item.unitsIn) acc.productsUsedMoreThanBought += 1;
      return acc;
    },
    {
      totalProducts: 0,
      totalUnitsIn: 0,
      totalUnitsOut: 0,
      totalPurchaseCost: 0,
      totalConsumedCost: 0,
      totalCurrentStock: 0,
      productsUsedMoreThanBought: 0,
      netUnits: 0
    }
  );
}

async function loadStockComparisonReport(from, to) {
  const result = await query(
    `WITH entries AS (
       SELECT
         COALESCE(product_id::text, sku) AS product_key,
         MIN(product_id::text) AS product_id_text,
         MAX(product_name) AS product_name,
         MAX(sku) AS sku,
         MAX(category) AS category,
         MAX(subcategory) AS subcategory,
         SUM(quantity)::int AS units_in,
         SUM(total_cost)::numeric AS purchase_cost,
         COUNT(*)::int AS entries_count
       FROM purchase_entries
       WHERE created_at >= $1::date
         AND created_at < ($2::date + INTERVAL '1 day')
       GROUP BY COALESCE(product_id::text, sku)
     ),
     exits AS (
       SELECT
         COALESCE(movements.product_id::text, movements.sku) AS product_key,
         MIN(movements.product_id::text) AS product_id_text,
         MAX(movements.product_name) AS product_name,
         MAX(movements.sku) AS sku,
         MAX(COALESCE(products.category, 'Sin categoria')) AS category,
         MAX(COALESCE(products.subcategory, '')) AS subcategory,
         SUM(ABS(movements.quantity))::int AS units_out,
         SUM(ABS(movements.quantity) * COALESCE(movements.unit_cost, products.cost, 0))::numeric AS consumed_cost,
         SUM(ABS(movements.quantity) * COALESCE(movements.unit_price, products.price, 0))::numeric AS consumed_value,
         COUNT(*)::int AS exits_count
       FROM movements
       LEFT JOIN products ON products.id = movements.product_id
       WHERE movements.quantity < 0
         AND movements.created_at >= $1::date
         AND movements.created_at < ($2::date + INTERVAL '1 day')
       GROUP BY COALESCE(movements.product_id::text, movements.sku)
     )
     SELECT
       COALESCE(entries.product_key, exits.product_key) AS product_key,
       COALESCE(products.name, entries.product_name, exits.product_name) AS product_name,
       COALESCE(products.sku, entries.sku, exits.sku) AS sku,
       COALESCE(products.category, entries.category, exits.category, 'Sin categoria') AS category,
       COALESCE(products.subcategory, entries.subcategory, exits.subcategory, '') AS subcategory,
       COALESCE(entries.units_in, 0)::int AS units_in,
       COALESCE(exits.units_out, 0)::int AS units_out,
       COALESCE(entries.purchase_cost, 0)::numeric AS purchase_cost,
       COALESCE(exits.consumed_cost, 0)::numeric AS consumed_cost,
       COALESCE(exits.consumed_value, 0)::numeric AS consumed_value,
       COALESCE(products.stock, 0)::int AS current_stock,
       (COALESCE(entries.units_in, 0) - COALESCE(exits.units_out, 0))::int AS balance_units,
       (COALESCE(products.stock, 0) - (COALESCE(entries.units_in, 0) - COALESCE(exits.units_out, 0)))::int AS estimated_start_stock,
       COALESCE(entries.entries_count, 0)::int AS entries_count,
       COALESCE(exits.exits_count, 0)::int AS exits_count
     FROM entries
     FULL OUTER JOIN exits ON exits.product_key = entries.product_key
     LEFT JOIN products ON products.id::text = COALESCE(entries.product_id_text, exits.product_id_text)
     ORDER BY COALESCE(products.name, entries.product_name, exits.product_name) ASC`,
    [from, to]
  );
  const rows = result.rows.map(stockComparisonDto);
  const summary = summarizeStockComparison(rows);
  summary.netUnits = summary.totalUnitsIn - summary.totalUnitsOut;
  return { range: { from, to }, summary, rows };
}

function stockComparisonStatus(item) {
  if (item.unitsOut > item.unitsIn) return "Se uso mas de lo comprado";
  if (item.currentStock <= 0) return "Sin stock";
  if (item.balanceUnits > 0) return "Quedo disponible";
  return "Equilibrado";
}

async function buildStockComparisonWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario La Querendona";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Comparativa");
  sheet.properties.defaultRowHeight = 20;

  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = "Comparativa de entradas y usos - Inventario La Querendona";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF156B73" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.addRow([]);
  sheet.addRow(["Fecha inicial", report.range.from, "", "Fecha final", report.range.to]);
  sheet.addRow(["Unidades compradas", report.summary.totalUnitsIn, "", "Unidades utilizadas", report.summary.totalUnitsOut]);
  sheet.addRow(["Gasto estimado", report.summary.totalConsumedCost, "", "Saldo del periodo", report.summary.netUnits]);
  sheet.addRow([]);

  const header = sheet.addRow([
    "Producto",
    "SKU",
    "Categoria",
    "Subcategoria",
    "Stock inicial estimado",
    "Entradas",
    "Usos",
    "Saldo periodo",
    "Gasto estimado",
    "Stock quedo",
    "Estado"
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17202A" } };

  report.rows.forEach((item) => {
    sheet.addRow([
      item.productName,
      item.sku,
      item.category,
      item.subcategory,
      item.estimatedStartStock,
      item.unitsIn,
      item.unitsOut,
      item.balanceUnits,
      item.consumedCost,
      item.currentStock,
      stockComparisonStatus(item)
    ]);
  });

  const totalRow = sheet.addRow(["TOTAL", "", "", "", "", report.summary.totalUnitsIn, report.summary.totalUnitsOut, report.summary.netUnits, report.summary.totalConsumedCost, report.summary.totalCurrentStock, ""]);
  totalRow.font = { bold: true };

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;
  sheet.getColumn(8).width = 14;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 14;
  sheet.getColumn(11).width = 24;
  sheet.getColumn(9).numFmt = '"$"#,##0.00';
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: Math.max(header.number, header.number + report.rows.length), column: 11 }
  };

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Comparativa de entradas y usos"]);
  summarySheet.addRow(["Periodo", `${report.range.from} a ${report.range.to}`]);
  summarySheet.addRow(["Productos", report.summary.totalProducts]);
  summarySheet.addRow(["Unidades compradas", report.summary.totalUnitsIn]);
  summarySheet.addRow(["Unidades utilizadas", report.summary.totalUnitsOut]);
  summarySheet.addRow(["Gasto estimado", report.summary.totalConsumedCost]);
  summarySheet.addRow(["Saldo del periodo", report.summary.netUnits]);
  summarySheet.getColumn(1).width = 26;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getCell("B6").numFmt = '"$"#,##0.00';
  summarySheet.getRow(1).font = { bold: true, size: 16 };

  return workbook;
}

function profitReportDto(row) {
  const income = Number(row.income || 0);
  const cost = Number(row.cost || 0);
  const profit = Number(row.profit || 0);
  return {
    productName: row.product_name,
    sku: row.sku,
    category: row.category || "Sin categoria",
    subcategory: row.subcategory || "",
    unitsSold: Number(row.units_sold || 0),
    movements: Number(row.movements || 0),
    averagePrice: Number(row.average_price || 0),
    averageCost: Number(row.average_cost || 0),
    income,
    cost,
    profit,
    margin: income > 0 ? (profit / income) * 100 : 0
  };
}

function summarizeProfitReport(rows) {
  const summary = rows.reduce(
    (acc, item) => {
      acc.totalIncome += item.income;
      acc.totalCost += item.cost;
      acc.totalProfit += item.profit;
      acc.totalUnits += item.unitsSold;
      acc.totalMovements += item.movements;
      return acc;
    },
    { totalIncome: 0, totalCost: 0, totalProfit: 0, totalUnits: 0, totalMovements: 0 }
  );

  return {
    ...summary,
    margin: summary.totalIncome > 0 ? (summary.totalProfit / summary.totalIncome) * 100 : 0,
    bestMargins: [...rows]
      .filter((item) => item.income > 0)
      .sort((a, b) => b.margin - a.margin || b.profit - a.profit)
      .slice(0, 8),
    bestProfits: [...rows].sort((a, b) => b.profit - a.profit).slice(0, 8)
  };
}

async function loadProfitReport(from, to) {
  const result = await query(
    `SELECT
       movements.product_name,
       movements.sku,
       COALESCE(products.category, 'Sin categoria') AS category,
       COALESCE(products.subcategory, '') AS subcategory,
       SUM(ABS(movements.quantity))::int AS units_sold,
       COUNT(*)::int AS movements,
       AVG(COALESCE(movements.unit_price, products.price, 0))::numeric AS average_price,
       AVG(COALESCE(movements.unit_cost, products.cost, 0))::numeric AS average_cost,
       SUM(ABS(movements.quantity) * COALESCE(movements.unit_price, products.price, 0))::numeric AS income,
       SUM(ABS(movements.quantity) * COALESCE(movements.unit_cost, products.cost, 0))::numeric AS cost,
       SUM(ABS(movements.quantity) * (COALESCE(movements.unit_price, products.price, 0) - COALESCE(movements.unit_cost, products.cost, 0)))::numeric AS profit
     FROM movements
     LEFT JOIN products ON products.id = movements.product_id
     WHERE movements.quantity < 0
       AND (movements.movement_type = 'venta' OR movements.note IN ('Salida rapida', 'Venta rapida', 'Uso rapido'))
       AND movements.created_at >= $1::date
       AND movements.created_at < ($2::date + INTERVAL '1 day')
     GROUP BY movements.product_name, movements.sku, COALESCE(products.category, 'Sin categoria'), COALESCE(products.subcategory, '')
     ORDER BY profit DESC, income DESC`,
    [from, to]
  );
  const rows = result.rows.map(profitReportDto);
  return { range: { from, to }, summary: summarizeProfitReport(rows), rows };
}

async function buildProfitReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario La Querendona";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Utilidad");
  sheet.properties.defaultRowHeight = 20;

  sheet.mergeCells("A1:L1");
  sheet.getCell("A1").value = "Reporte de utilidad - Inventario La Querendona";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF156B73" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.addRow([]);
  sheet.addRow(["Fecha inicial", report.range.from, "", "Fecha final", report.range.to]);
  sheet.addRow(["Ingreso estimado", report.summary.totalIncome, "", "Costo estimado", report.summary.totalCost]);
  sheet.addRow(["Ganancia estimada", report.summary.totalProfit, "", "Margen", report.summary.margin / 100]);
  sheet.addRow([]);

  const header = sheet.addRow([
    "Producto",
    "SKU",
    "Categoria",
    "Subcategoria",
    "Unidades",
    "Movimientos",
    "Precio prom.",
    "Costo prom.",
    "Ingreso",
    "Costo",
    "Ganancia",
    "Margen"
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17202A" } };

  report.rows.forEach((item) => {
    sheet.addRow([
      item.productName,
      item.sku,
      item.category,
      item.subcategory,
      item.unitsSold,
      item.movements,
      item.averagePrice,
      item.averageCost,
      item.income,
      item.cost,
      item.profit,
      item.margin / 100
    ]);
  });

  const totalRow = sheet.addRow(["TOTAL", "", "", "", report.summary.totalUnits, report.summary.totalMovements, "", "", report.summary.totalIncome, report.summary.totalCost, report.summary.totalProfit, report.summary.margin / 100]);
  totalRow.font = { bold: true };

  [7, 8, 9, 10, 11].forEach((column) => {
    sheet.getColumn(column).numFmt = '"$"#,##0.00';
  });
  sheet.getColumn(12).numFmt = "0.00%";
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 14;
  sheet.getColumn(8).width = 14;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 16;
  sheet.getColumn(11).width = 16;
  sheet.getColumn(12).width = 12;
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: Math.max(header.number, header.number + report.rows.length), column: 12 }
  };

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Reporte de utilidad"]);
  summarySheet.addRow(["Periodo", `${report.range.from} a ${report.range.to}`]);
  summarySheet.addRow(["Ingreso estimado", report.summary.totalIncome]);
  summarySheet.addRow(["Costo estimado", report.summary.totalCost]);
  summarySheet.addRow(["Ganancia estimada", report.summary.totalProfit]);
  summarySheet.addRow(["Margen", report.summary.margin / 100]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Mejor margen", "Ganancia", "Margen"]);
  report.summary.bestMargins.forEach((item) => summarySheet.addRow([item.productName, item.profit, item.margin / 100]));
  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 16;
  summarySheet.getColumn(3).width = 14;
  summarySheet.getColumn(2).numFmt = '"$"#,##0.00';
  summarySheet.getColumn(3).numFmt = "0.00%";
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(8).font = { bold: true };

  return workbook;
}

async function ensureSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
      cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
      price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      location TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT ''`);
  await query(`
    CREATE TABLE IF NOT EXISTS movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12, 2),
      unit_cost NUMERIC(12, 2),
      movement_type TEXT NOT NULL DEFAULT 'entrada',
      supplier_type TEXT NOT NULL DEFAULT 'Proveedor local',
      measure_unit TEXT NOT NULL DEFAULT 'Pieza',
      note TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2)`);
  await query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2)`);
  await query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS movement_type TEXT NOT NULL DEFAULT 'entrada'`);
  await query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS supplier_type TEXT NOT NULL DEFAULT 'Proveedor local'`);
  await query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS measure_unit TEXT NOT NULL DEFAULT 'Pieza'`);
  await query(`
    UPDATE movements
    SET movement_type = CASE
      WHEN note IN ('Salida rapida', 'Venta rapida', 'Uso rapido') THEN 'venta'
      WHEN note = 'Entrada rapida' THEN 'entrada'
      WHEN note = 'Alta de producto' THEN 'alta'
      WHEN note = 'Ajuste por edicion' THEN 'ajuste'
      WHEN note = 'Producto eliminado' THEN 'eliminacion'
      WHEN note = 'Reposicion sugerida' THEN 'reposicion'
      WHEN note LIKE 'Compra a %' THEN 'compra'
      WHEN quantity < 0 THEN 'salida'
      ELSE 'entrada'
    END
    WHERE movement_type IS NULL OR movement_type = 'entrada'
  `);
  await query(`
    UPDATE movements
    SET unit_cost = products.cost
    FROM products
    WHERE movements.product_id = products.id
      AND movements.unit_cost IS NULL
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS purchase_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      movement_id UUID REFERENCES movements(id) ON DELETE SET NULL,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      measure_unit TEXT NOT NULL DEFAULT 'Pieza',
      unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
      total_cost NUMERIC(12, 2) NOT NULL CHECK (total_cost >= 0),
      note TEXT NOT NULL DEFAULT '',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS movement_id UUID REFERENCES movements(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS measure_unit TEXT NOT NULL DEFAULT 'Pieza'`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      report_count INTEGER NOT NULL DEFAULT 1,
      notification_results JSONB NOT NULL DEFAULT '[]'::jsonb,
      resolved_at TIMESTAMPTZ
    )
  `);
  await query(`ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS last_reported_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await query(`ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS notification_results JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await query(
    `UPDATE stock_alerts
     SET last_reported_at = created_at
     WHERE report_count = 1
       AND notification_results = '[]'::jsonb
       AND last_reported_at > created_at`
  );
  await query(`
    CREATE TABLE IF NOT EXISTS shift_exit_alert_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_key TEXT NOT NULL,
      shift_date DATE NOT NULL,
      bucket_minutes INTEGER NOT NULL,
      missing_users TEXT NOT NULL DEFAULT '',
      missing_user_ids TEXT NOT NULL DEFAULT '',
      notification_results JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (shift_key, shift_date, bucket_minutes)
    )
  `);
  await query(`ALTER TABLE shift_exit_alert_runs ADD COLUMN IF NOT EXISTS missing_user_ids TEXT NOT NULL DEFAULT ''`);
  await query(`
    CREATE TABLE IF NOT EXISTS shift_exit_completion_notices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_key TEXT NOT NULL,
      shift_date DATE NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      username TEXT NOT NULL,
      notification_results JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (shift_key, shift_date, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(category, subcategory)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(movement_type, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_entries_created_at ON purchase_entries(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_entries_supplier ON purchase_entries(supplier)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_alerts_status ON stock_alerts(status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shift_exit_alert_runs_created_at ON shift_exit_alert_runs(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shift_exit_completion_notices_created_at ON shift_exit_completion_notices(created_at DESC)`);
}

async function seedUsers() {
  await query(
    `UPDATE users
     SET username = 'cocinero1', name = 'Cocinero 1', role = 'staff', label = 'Cocinero'
     WHERE username = 'cocinero'
       AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'cocinero1')`
  );

  const users = [
    { username: "admin", password: "admin123", name: "Administrador 1", role: "admin", label: "Administrador" },
    { username: "admin2", password: "admin123", name: "Administrador 2", role: "admin", label: "Administrador" },
    { username: "cocinero1", password: "empleado1", name: "Cocinero 1", role: "staff", label: "Cocinero" },
    { username: "cocinero2", password: "empleado2", name: "Cocinero 2", role: "staff", label: "Cocinero" },
    { username: "cocinero3", password: "empleado3", name: "Cocinero 3", role: "staff", label: "Cocinero" }
  ];
  const rosterMigrationKey = "five-user-roster-2026-06";
  const migration = await query(
    `SELECT migration_key FROM app_migrations WHERE migration_key = $1`,
    [rosterMigrationKey]
  );
  const resetCredentials = !migration.rows[0];

  for (const user of users) {
    const salt = crypto.randomBytes(16).toString("hex");
    if (resetCredentials) {
      await query(
        `INSERT INTO users (username, password_hash, salt, name, role, label)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             salt = EXCLUDED.salt,
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             label = EXCLUDED.label`,
        [user.username, hashPassword(user.password, salt), salt, user.name, user.role, user.label]
      );
    } else {
      await query(
        `INSERT INTO users (username, password_hash, salt, name, role, label)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (username) DO UPDATE
         SET name = EXCLUDED.name,
             role = EXCLUDED.role,
             label = EXCLUDED.label`,
        [user.username, hashPassword(user.password, salt), salt, user.name, user.role, user.label]
      );
    }
  }

  await query(
    `DELETE FROM users
     WHERE username <> ALL($1::text[])`,
    [users.map((user) => user.username)]
  );
  if (resetCredentials) {
    await query(
      `INSERT INTO app_migrations (migration_key) VALUES ($1)
       ON CONFLICT (migration_key) DO NOTHING`,
      [rosterMigrationKey]
    );
  }
}

async function seedProducts() {
  const count = await query(`SELECT COUNT(*)::int AS count FROM products`);
  if (count.rows[0].count > 0) return;

  for (const product of demoProducts) {
    await query(
      `INSERT INTO products (name, sku, description, category, subcategory, supplier, stock, min_stock, cost, price, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (sku) DO NOTHING`,
      product
    );
  }
}

async function recordMovement(client, product, quantity, note, userId, unitPrice = null, movementType = null, unitCost = null, supplierType = "Proveedor local", measureUnit = "Pieza") {
  const type = normalizeMovementType(movementType, quantity, note);
  const price = unitPrice === null || unitPrice === undefined ? null : Number(unitPrice);
  const cost = unitCost === null || unitCost === undefined ? null : Number(unitCost);
  const provider = normalizeSupplierName(supplierType);
  const unit = normalizePurchaseMeasureUnit(measureUnit);
  const result = await client.query(
    `INSERT INTO movements (product_id, product_name, sku, quantity, unit_price, unit_cost, movement_type, supplier_type, measure_unit, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [product.id, product.name, product.sku, quantity, price, cost, type, provider, unit, note, userId]
  );
  return result.rows[0];
}

function sanitizePurchase(input) {
  const purchase = {
    productId: String(input.productId || "").trim(),
    supplier: normalizeSupplierName(input.supplier, ""),
    quantity: Number(input.quantity),
    measureUnit: normalizePurchaseMeasureUnit(input.measureUnit),
    unitCost: Number(input.unitCost),
    note: String(input.note || "").trim().slice(0, 180)
  };

  if (!purchase.productId) {
    const error = new Error("Selecciona un producto");
    error.status = 400;
    throw error;
  }

  if (!purchase.supplier) {
    const error = new Error("El proveedor es obligatorio");
    error.status = 400;
    throw error;
  }

  if (!Number.isFinite(purchase.quantity) || purchase.quantity <= 0) {
    const error = new Error("La cantidad debe ser un número mayor a cero");
    error.status = 400;
    throw error;
}

  if (!Number.isFinite(purchase.unitCost) || purchase.unitCost < 0) {
    const error = new Error("El costo unitario debe ser positivo");
    error.status = 400;
    throw error;
  }

  return purchase;
}

async function applyPurchase(client, purchase, userId) {
  const totalCost = Number((purchase.quantity * purchase.unitCost).toFixed(2));
  const productResult = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [purchase.productId]);
  const product = productResult.rows[0];
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.status = 404;
    throw error;
  }

  const inserted = await client.query(
    `INSERT INTO purchase_entries
     (product_id, product_name, sku, category, subcategory, supplier, quantity, measure_unit, unit_cost, total_cost, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      product.id,
      product.name,
      product.sku,
      product.category,
      product.subcategory || "",
      purchase.supplier,
      purchase.quantity,
      purchase.measureUnit,
      purchase.unitCost,
      totalCost,
      purchase.note,
      userId
    ]
  );

  const updated = await client.query(
    `UPDATE products
     SET stock = stock + $1, supplier = $2, cost = $3, updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [purchase.quantity, purchase.supplier, purchase.unitCost, product.id]
  );
  const movement = await recordMovement(
    client,
    updated.rows[0],
    purchase.quantity,
    `Compra a ${purchase.supplier}`,
    userId,
    null,
    "compra",
    purchase.unitCost,
    purchase.supplier,
    purchase.measureUnit
  );
  const savedPurchase = await client.query(
    `UPDATE purchase_entries SET movement_id = $1 WHERE id = $2 RETURNING *`,
    [movement.id, inserted.rows[0].id]
  );

  return {
    purchase: savedPurchase.rows[0],
    product: updated.rows[0]
  };
}

function sanitizeExitUse(input) {
  const movementType = normalizeMovementType(input.movementType, -1, "");
  const exitUse = {
    productId: String(input.productId || "").trim(),
    quantity: Number(input.quantity),
    measureUnit: normalizePurchaseMeasureUnit(input.measureUnit),
    movementType,
    supplierType: normalizeSupplierName(input.supplierType),
    note: String(input.note || defaultExitNote(movementType)).trim().slice(0, 180)
  };

  if (!exitUse.productId) {
    const error = new Error("Selecciona un producto");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(exitUse.quantity) || exitUse.quantity <= 0) {
    const error = new Error("Cantidad invalida");
    error.status = 400;
    throw error;
  }

  if (!detailedExitTypes.has(exitUse.movementType)) {
    const error = new Error("Tipo de uso invalido");
    error.status = 400;
    throw error;
  }

  return exitUse;
}

async function applyExitUse(client, exitUse, userId) {
  const current = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [exitUse.productId]);
  const product = current.rows[0];
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.status = 404;
    throw error;
  }

  if (Number(product.stock) < exitUse.quantity) {
    const error = new Error(`No hay suficiente stock para ${product.name}`);
    error.status = 400;
    throw error;
  }

  const updated = await client.query(
    `UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [exitUse.quantity, product.id]
  );
  await recordMovement(
    client,
    updated.rows[0],
    -exitUse.quantity,
    exitUse.note || defaultExitNote(exitUse.movementType),
    userId,
    measuredUnitValue(product.price, exitUse.measureUnit),
    exitUse.movementType,
    measuredUnitValue(product.cost, exitUse.measureUnit),
    exitUse.supplierType,
    exitUse.measureUnit
  );

  return {
    previousProduct: productDto(product),
    product: productDto(updated.rows[0])
  };
}

async function authRequired(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tokenHash = hashToken(token);

  try {
    const result = await query(
      `SELECT users.*
       FROM app_sessions
       JOIN users ON users.id = app_sessions.user_id
       WHERE app_sessions.token_hash = $1
         AND app_sessions.expires_at > now()`,
      [tokenHash]
    );
    const user = result.rows[0];

    if (!token || !user) {
      res.status(401).json({ error: "Sesion no valida" });
      return;
    }

    await query(`UPDATE app_sessions SET last_seen_at = now() WHERE token_hash = $1`, [tokenHash]);
    req.token = token;
    req.tokenHash = tokenHash;
    req.user = userDto(user);
    next();
  } catch (error) {
    next(error);
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Solo admin puede realizar esta accion" });
    return;
  }
  next();
}

function stockAccessRequired(req, res, next) {
  if (!["admin", "staff"].includes(req.user.role)) {
    res.status(403).json({ error: "No puedes registrar movimientos de inventario" });
    return;
  }
  next();
}

app.use("/api", (req, res, next) => {
  ensureReady().then(() => next()).catch(next);
});

app.get("/api/cron/shift-exit-alerts", async (req, res, next) => {
  if (!cronRequestAuthorized(req)) {
    res.status(401).json({ error: "Cron no autorizado" });
    return;
  }

  try {
    const result = await runShiftExitAlertCheck();
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username = "", password = "" } = req.body;
    const result = await query(`SELECT * FROM users WHERE username = $1`, [loginUsername(username)]);
    const user = result.rows[0];

    if (!user || hashPassword(password, user.salt) !== user.password_hash) {
      res.status(401).json({ error: "Usuario o contrasena incorrectos" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const safeUser = userDto(user);
    await query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3::int * INTERVAL '1 day'))`,
      [hashToken(token), user.id, sessionDurationDays()]
    );
    res.json({ token, user: safeUser });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", authRequired, async (req, res, next) => {
  try {
    await query(`DELETE FROM app_sessions WHERE token_hash = $1`, [req.tokenHash]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", authRequired, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Captura la contrasena actual y la nueva contrasena" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "La nueva contrasena debe tener al menos 6 caracteres" });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ error: "La nueva contrasena debe ser diferente a la actual" });
      return;
    }

    const result = await query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    const user = result.rows[0];
    if (!user || hashPassword(currentPassword, user.salt) !== user.password_hash) {
      res.status(401).json({ error: "La contrasena actual no es correcta" });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    await query(
      `UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3`,
      [hashPassword(newPassword, salt), salt, user.id]
    );
    await query(`DELETE FROM app_sessions WHERE user_id = $1 AND token_hash <> $2`, [user.id, req.tokenHash]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/users", authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM users ORDER BY role ASC, name ASC, username ASC`);
    res.json({ users: result.rows.map(userDto) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users/:id/reset-password", authRequired, adminRequired, async (req, res, next) => {
  try {
    const newPassword = String(req.body.newPassword || "");
    if (!newPassword) {
      res.status(400).json({ error: "Captura la nueva contrasena temporal" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "La nueva contrasena debe tener al menos 6 caracteres" });
      return;
    }

    const userResult = await query(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    await query(
      `UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3`,
      [hashPassword(newPassword, salt), salt, user.id]
    );
    await query(`DELETE FROM app_sessions WHERE user_id = $1 AND token_hash <> $2`, [user.id, req.tokenHash]);

    res.json({ user: userDto(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", authRequired, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM products ORDER BY name ASC, sku ASC`);
    res.json({ products: result.rows.map(productDto) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id/quick-card", authRequired, async (req, res, next) => {
  try {
    const productResult = await query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    const productRow = productResult.rows[0];
    if (!productRow) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const [movementsResult, lastExitResult, lastPurchaseResult] = await Promise.all([
      query(
        `SELECT movements.*, users.name AS created_by_name
         FROM movements
         LEFT JOIN users ON users.id = movements.created_by
         WHERE movements.product_id = $1 OR movements.sku = $2
         ORDER BY movements.created_at DESC
         LIMIT 6`,
        [productRow.id, productRow.sku]
      ),
      query(
        `SELECT movements.*, users.name AS created_by_name
         FROM movements
         LEFT JOIN users ON users.id = movements.created_by
         WHERE (movements.product_id = $1 OR movements.sku = $2)
           AND movements.quantity < 0
           AND COALESCE(movements.movement_type, '') <> 'eliminacion'
         ORDER BY movements.created_at DESC
         LIMIT 1`,
        [productRow.id, productRow.sku]
      ),
      query(
        `SELECT purchase_entries.*, users.name AS created_by_name
         FROM purchase_entries
         LEFT JOIN users ON users.id = purchase_entries.created_by
         WHERE purchase_entries.product_id = $1 OR purchase_entries.sku = $2
         ORDER BY purchase_entries.created_at DESC
         LIMIT 1`,
        [productRow.id, productRow.sku]
      )
    ]);

    const product = productDto(productRow);
    res.json({
      product,
      summary: productQuickSummary(product),
      recentMovements: movementsResult.rows.map(quickMovementDto),
      lastExit: lastExitResult.rows[0] ? quickMovementDto(lastExitResult.rows[0]) : null,
      lastPurchase: lastPurchaseResult.rows[0] ? purchaseDto(lastPurchaseResult.rows[0]) : null
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", authRequired, adminRequired, async (req, res, next) => {
  try {
    const product = sanitizeProduct(req.body);
    const result = await query(
      `INSERT INTO products (name, sku, description, category, subcategory, supplier, stock, min_stock, cost, price, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      product
    );
    const saved = productDto(result.rows[0]);
    await query(
      `INSERT INTO movements (product_id, product_name, sku, quantity, unit_cost, movement_type, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [saved.id, saved.name, saved.sku, saved.stock, saved.cost, "alta", "Alta de producto", req.user.id]
    );
    res.status(201).json({ product: saved });
  } catch (error) {
    next(error);
  }
});

app.put("/api/products/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const product = sanitizeProduct(req.body);
    await client.query("BEGIN");
    const previousResult = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!previousResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const previous = previousResult.rows[0];
    const result = await client.query(
      `UPDATE products
       SET name = $1, sku = $2, description = $3, category = $4, subcategory = $5, supplier = $6, stock = $7, min_stock = $8,
           cost = $9, price = $10, location = $11, updated_at = now()
       WHERE id = $12
       RETURNING *`,
      [...product, req.params.id]
    );
    const saved = productDto(result.rows[0]);
    const diff = saved.stock - Number(previous.stock);
    if (diff !== 0) {
      await recordMovement(
        client,
        result.rows[0],
        diff,
        "Ajuste por edicion",
        req.user.id,
        diff < 0 ? Number(saved.price) : null,
        "ajuste",
        Number(saved.cost)
      );
    }
    await client.query("COMMIT");
    res.json({ product: saved });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.delete("/api/products/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }
    const product = result.rows[0];
    await recordMovement(
      client,
      product,
      -Number(product.stock),
      "Producto eliminado",
      req.user.id,
      Number(product.price),
      "eliminacion",
      Number(product.cost)
    );
    await client.query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/products/:id/adjust", authRequired, adminRequired, async (req, res, next) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    res.status(400).json({ error: "Cantidad invalida" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const product = current.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const nextStock = Math.max(0, Number(product.stock) + amount);
    const applied = nextStock - Number(product.stock);
    if (applied === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "El stock ya esta en cero" });
      return;
    }

    const updated = await client.query(
      `UPDATE products SET stock = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [nextStock, req.params.id]
    );
    await recordMovement(
      client,
      updated.rows[0],
      applied,
      applied > 0 ? "Entrada rapida" : "Uso rapido",
      req.user.id,
      applied < 0 ? Number(product.price) : null,
      applied > 0 ? "entrada" : "venta",
      Number(product.cost)
    );
    await client.query("COMMIT");
    res.json({ product: productDto(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/products/:id/exit", authRequired, stockAccessRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const exitUse = sanitizeExitUse({ ...req.body, productId: req.params.id });
    await client.query("BEGIN");
    const exitResult = await applyExitUse(client, exitUse, req.user.id);
    await client.query("COMMIT");
    const inventoryAlert = await safelyNotifyAutomaticStockAlertAfterExit(
      exitResult.previousProduct,
      exitResult.product,
      req.user
    );
    let completionNotice = null;
    if (req.user.role === "staff") {
      try {
        completionNotice = await notifyShiftExitCompletionForUser(req.user.id);
      } catch (error) {
        console.warn("No se pudo avisar que la salida ya fue registrada:", error.message);
        completionNotice = {
          skipped: "notification_failed",
          error: publicNotificationError(error.message)
        };
      }
    }
    res.json({
      product: exitResult.product,
      inventoryAlert,
      completionNotice
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/exits/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const movementResult = await client.query(
      `SELECT * FROM movements WHERE id = $1 AND quantity < 0 FOR UPDATE`,
      [req.params.id]
    );
    const movement = movementResult.rows[0];
    if (!movement) {
      const error = new Error("Salida no encontrada");
      error.status = 404;
      throw error;
    }

    const exitUse = sanitizeExitUse({ ...req.body, productId: movement.product_id });
    const productResult = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [movement.product_id]);
    const product = productResult.rows[0];
    if (!product) {
      const error = new Error("El producto relacionado ya no existe");
      error.status = 409;
      throw error;
    }

    const previousQuantity = Math.abs(Number(movement.quantity));
    const nextStock = Number(product.stock) + previousQuantity - exitUse.quantity;
    if (nextStock < 0) {
      const error = new Error(`No hay suficiente stock para aumentar la salida de ${product.name}`);
      error.status = 400;
      throw error;
    }

    const updatedProduct = await client.query(
      `UPDATE products SET stock = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [nextStock, product.id]
    );
    const updatedMovement = await client.query(
      `UPDATE movements
       SET quantity = $1, movement_type = $2, supplier_type = $3, measure_unit = $4, note = $5, unit_price = $6, unit_cost = $7
       WHERE id = $8
       RETURNING *`,
      [
        -exitUse.quantity,
        exitUse.movementType,
        exitUse.supplierType,
        exitUse.measureUnit,
        exitUse.note || defaultExitNote(exitUse.movementType),
        measuredUnitValue(product.price, exitUse.measureUnit),
        measuredUnitValue(product.cost, exitUse.measureUnit),
        movement.id
      ]
    );

    await client.query("COMMIT");
    res.json({
      movement: movementDto(updatedMovement.rows[0]),
      product: productDto(updatedProduct.rows[0])
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/exits/bulk", authRequired, stockAccessRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const movementType = normalizeMovementType(req.body.movementType, -1, "");
    const supplierType = normalizeSupplierName(req.body.supplierType);
    const note = String(req.body.note || defaultExitNote(movementType)).trim().slice(0, 180);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      res.status(400).json({ error: "Agrega al menos un producto" });
      return;
    }

    const exits = items.map((item) => sanitizeExitUse({ ...item, movementType, supplierType, note }));
    await client.query("BEGIN");

    const updatedProducts = [];
    const inventoryTransitions = new Map();
    for (const exitUse of exits) {
      const exitResult = await applyExitUse(client, exitUse, req.user.id);
      updatedProducts.push(exitResult.product);
      const existingTransition = inventoryTransitions.get(exitResult.product.id);
      inventoryTransitions.set(exitResult.product.id, {
        previousProduct: existingTransition?.previousProduct || exitResult.previousProduct,
        product: exitResult.product
      });
    }

    await client.query("COMMIT");
    const inventoryAlerts = [];
    for (const transition of inventoryTransitions.values()) {
      const alert = await safelyNotifyAutomaticStockAlertAfterExit(
        transition.previousProduct,
        transition.product,
        req.user
      );
      if (!alert.skipped || alert.skipped === "notification_failed") {
        inventoryAlerts.push(alert);
      }
    }
    let completionNotice = null;
    if (req.user.role === "staff") {
      try {
        completionNotice = await notifyShiftExitCompletionForUser(req.user.id);
      } catch (error) {
        console.warn("No se pudo avisar que la salida grande ya fue registrada:", error.message);
        completionNotice = {
          skipped: "notification_failed",
          error: publicNotificationError(error.message)
        };
      }
    }
    res.status(201).json({
      products: updatedProducts,
      inventoryAlerts,
      completionNotice,
      summary: {
        totalEntries: exits.length,
        totalUnits: exits.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/products/:id/stock-alert", authRequired, async (req, res, next) => {
  try {
    const productResult = await query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    const product = productResult.rows[0];
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const message = String(req.body.message || "Producto agotado o sin existencia en inventario.").trim().slice(0, 240);
    const existing = await query(
      `SELECT * FROM stock_alerts WHERE product_id = $1 AND status = 'open' LIMIT 1`,
      [product.id]
    );

    const repeated = Boolean(existing.rows[0]);
    const alertResult = repeated
      ? await query(
          `UPDATE stock_alerts
           SET message = $1,
               created_by = $2,
               last_reported_at = now(),
               report_count = report_count + 1
           WHERE id = $3
           RETURNING *`,
          [message, req.user.id, existing.rows[0].id]
        )
      : await query(
          `INSERT INTO stock_alerts (product_id, product_name, sku, message, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [product.id, product.name, product.sku, message, req.user.id]
        );

    const notificationResults = await notifyStockAlert(product, alertResult.rows[0], req.user);
    const savedAlert = await query(
      `UPDATE stock_alerts
       SET notification_results = $1::jsonb
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(notificationResults), alertResult.rows[0].id]
    );
    res.status(repeated ? 200 : 201).json({
      alert: stockAlertDto(savedAlert.rows[0]),
      notifications: notificationResults,
      repeated
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stock-alerts", authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT stock_alerts.*, users.name AS created_by_name
       FROM stock_alerts
       LEFT JOIN users ON users.id = stock_alerts.created_by
       ORDER BY stock_alerts.last_reported_at DESC, stock_alerts.created_at DESC`
    );
    res.json({ alerts: result.rows.map(stockAlertDto) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/smart-alerts", authRequired, adminRequired, async (req, res, next) => {
  try {
    res.json(await loadSmartAlerts());
  } catch (error) {
    next(error);
  }
});

app.get("/api/restock-suggestions", authRequired, adminRequired, async (req, res, next) => {
  try {
    const smartAlerts = await loadSmartAlerts();
    const suggestions = buildRestockSuggestions(smartAlerts.alerts);
    const summary = suggestions.reduce(
      (acc, item) => {
        acc.products += 1;
        acc.units += item.suggestedQuantity;
        return acc;
      },
      { products: 0, units: 0 }
    );

    res.json({ summary, suggestions });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/stock-alerts/:id/resolve", authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE stock_alerts
       SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Aviso no encontrado" });
      return;
    }

    res.json({ alert: stockAlertDto(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/restock-suggested", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const smartAlerts = await loadSmartAlerts();
    const suggestions = buildRestockSuggestions(smartAlerts.alerts);
    const suggestionsByProduct = new Map(suggestions.map((item) => [item.productId, item]));
    const productIds = [...suggestionsByProduct.keys()];
    if (!productIds.length) {
      res.json({ updated: 0, units: 0 });
      return;
    }

    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`, [productIds]);
    let updatedCount = 0;
    let updatedUnits = 0;

    for (const product of result.rows) {
      const suggestion = suggestionsByProduct.get(product.id);
      const amount = suggestion?.suggestedQuantity || 0;
      if (amount <= 0) continue;

      const updated = await client.query(
        `UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [amount, product.id]
      );
      await recordMovement(
        client,
        updated.rows[0],
        amount,
        `Reposicion sugerida: ${suggestion?.reason || "alerta inteligente"}`,
        req.user.id,
        null,
        "reposicion",
        Number(product.cost)
      );
      updatedCount += 1;
      updatedUnits += amount;
    }

    await client.query("COMMIT");
    res.json({ updated: updatedCount, units: updatedUnits, candidates: suggestions.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/purchases", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const filters = parsePurchaseFilters(req);
    const report = await loadPurchaseReport(from, to, filters);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/purchases/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const purchaseResult = await client.query(
      `SELECT * FROM purchase_entries WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const previous = purchaseResult.rows[0];
    if (!previous) {
      const error = new Error("Entrada no encontrada");
      error.status = 404;
      throw error;
    }

    const purchase = sanitizePurchase({ ...req.body, productId: previous.product_id });
    const productResult = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [previous.product_id]);
    const product = productResult.rows[0];
    if (!product) {
      const error = new Error("El producto relacionado ya no existe");
      error.status = 409;
      throw error;
    }

    const nextStock = Number(product.stock) - Number(previous.quantity) + purchase.quantity;
    if (nextStock < 0) {
      const error = new Error(`No se puede reducir la entrada porque ${product.name} ya tiene unidades utilizadas`);
      error.status = 400;
      throw error;
    }

    const newerPurchase = await client.query(
      `SELECT 1
       FROM purchase_entries
       WHERE product_id = $1 AND id <> $2 AND created_at > $3
       LIMIT 1`,
      [previous.product_id, previous.id, previous.created_at]
    );
    const updateCurrentCost = newerPurchase.rowCount === 0;
    const updatedProduct = await client.query(
      `UPDATE products
       SET stock = $1,
           supplier = CASE WHEN $2 THEN $3 ELSE supplier END,
           cost = CASE WHEN $2 THEN $4 ELSE cost END,
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [nextStock, updateCurrentCost, purchase.supplier, purchase.unitCost, product.id]
    );

    let movement = null;
    if (previous.movement_id) {
      const movementResult = await client.query(`SELECT * FROM movements WHERE id = $1 FOR UPDATE`, [previous.movement_id]);
      movement = movementResult.rows[0] || null;
    }
    if (!movement) {
      const movementResult = await client.query(
        `SELECT *
         FROM movements
         WHERE product_id = $1
           AND movement_type = 'compra'
           AND created_at BETWEEN $2::timestamptz - INTERVAL '5 minutes' AND $2::timestamptz + INTERVAL '5 minutes'
         ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $2::timestamptz))) ASC
         LIMIT 1
         FOR UPDATE`,
        [previous.product_id, previous.created_at]
      );
      movement = movementResult.rows[0] || null;
    }

    if (movement) {
      const movementResult = await client.query(
        `UPDATE movements
         SET quantity = $1, unit_cost = $2, supplier_type = $3, measure_unit = $4, note = $5
         WHERE id = $6
         RETURNING *`,
        [
          purchase.quantity,
          purchase.unitCost,
          purchase.supplier,
          purchase.measureUnit,
          `Compra a ${purchase.supplier}`,
          movement.id
        ]
      );
      movement = movementResult.rows[0];
    } else {
      movement = await recordMovement(
        client,
        updatedProduct.rows[0],
        purchase.quantity,
        `Compra a ${purchase.supplier}`,
        previous.created_by,
        null,
        "compra",
        purchase.unitCost,
        purchase.supplier,
        purchase.measureUnit
      );
      await client.query(`UPDATE movements SET created_at = $1 WHERE id = $2`, [previous.created_at, movement.id]);
    }

    const totalCost = Number((purchase.quantity * purchase.unitCost).toFixed(2));
    const updatedPurchase = await client.query(
      `UPDATE purchase_entries
       SET movement_id = $1, supplier = $2, quantity = $3, measure_unit = $4,
           unit_cost = $5, total_cost = $6, note = $7
       WHERE id = $8
       RETURNING *`,
      [
        movement.id,
        purchase.supplier,
        purchase.quantity,
        purchase.measureUnit,
        purchase.unitCost,
        totalCost,
        purchase.note,
        previous.id
      ]
    );

    await client.query("COMMIT");
    res.json({
      purchase: purchaseDto({ ...updatedPurchase.rows[0], created_by_name: req.user.name }),
      product: productDto(updatedProduct.rows[0])
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/purchases", authRequired, stockAccessRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const purchase = sanitizePurchase(req.body);
    await client.query("BEGIN");
    const result = await applyPurchase(client, purchase, req.user.id);
    await client.query("COMMIT");
    res.status(201).json({
      purchase: purchaseDto({ ...result.purchase, created_by_name: req.user.name }),
      product: productDto(result.product)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/purchases/bulk", authRequired, stockAccessRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const supplier = normalizeSupplierName(req.body.supplier, "");
    const note = String(req.body.note || "").trim().slice(0, 180);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!supplier) {
      res.status(400).json({ error: "El proveedor es obligatorio" });
      return;
    }
    if (!items.length) {
      res.status(400).json({ error: "Agrega al menos un producto" });
      return;
    }

    const purchases = items.map((item) => sanitizePurchase({ ...item, supplier, note }));
    await client.query("BEGIN");

    const savedPurchases = [];
    const updatedProducts = [];
    for (const purchase of purchases) {
      const result = await applyPurchase(client, purchase, req.user.id);
      savedPurchases.push(result.purchase);
      updatedProducts.push(result.product);
    }

    await client.query("COMMIT");
    res.status(201).json({
      purchases: savedPurchases.map((row) => purchaseDto({ ...row, created_by_name: req.user.name })),
      products: updatedProducts.map(productDto),
      summary: {
        totalEntries: savedPurchases.length,
        totalUnits: savedPurchases.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        totalCost: savedPurchases.reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/purchases.xlsx", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const filters = parsePurchaseFilters(req);
    const report = await loadPurchaseReport(from, to, filters);
    const workbook = await buildPurchaseReportWorkbook(report);
    const filename = `reporte-compras-${from}-a-${to}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/income", authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadIncomeReport(from, to);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/income.xlsx", authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadIncomeReport(from, to);
    const workbook = await buildIncomeReportWorkbook(report);
    const filename = `reporte-ingresos-${from}-a-${to}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/products.xlsx", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const category = String(req.query.category || "");
    const products = await loadProductsByCategoryReport(category);
    const workbook = await buildProductsWorkbook(products, category);
    const filename =
      category && category !== "all"
        ? `inventario-${category}.xlsx`
        : "inventario-completo.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    next(error);
  }
});

app.get("/api/reports/profit", authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadProfitReport(from, to);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/profit.xlsx", authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadProfitReport(from, to);
    const workbook = await buildProfitReportWorkbook(report);
    const filename = `reporte-utilidad-${from}-a-${to}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/exits", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadExitReport(from, to);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/exits.xlsx", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadExitReport(from, to);
    const workbook = await buildExitReportWorkbook(report);
    const filename = `reporte-uso-insumos-${from}-a-${to}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/stock-comparison", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadStockComparisonReport(from, to);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/stock-comparison.xlsx", authRequired, stockAccessRequired, async (req, res, next) => {
  try {
    const { from, to } = parseReportRange(req);
    const report = await loadStockComparisonReport(from, to);
    const workbook = await buildStockComparisonWorkbook(report);
    const filename = `comparativa-entradas-usos-${from}-a-${to}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/movements", authRequired, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM movements ORDER BY created_at DESC LIMIT 60`);
    res.json({ movements: result.rows.map(movementDto) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/movements", authRequired, adminRequired, async (req, res, next) => {
  try {
    await query(`DELETE FROM movements`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/export", authRequired, adminRequired, async (req, res, next) => {
  try {
    const [products, movements, alerts, purchases] = await Promise.all([
      query(`SELECT * FROM products ORDER BY name ASC`),
      query(`SELECT * FROM movements ORDER BY created_at DESC`),
      query(`SELECT * FROM stock_alerts ORDER BY created_at DESC`),
      query(`SELECT purchase_entries.*, users.name AS created_by_name
             FROM purchase_entries
             LEFT JOIN users ON users.id = purchase_entries.created_by
             ORDER BY purchase_entries.created_at DESC`)
    ]);
    res.json({
      products: products.rows.map(productDto),
      movements: movements.rows.map(movementDto),
      alerts: alerts.rows.map(stockAlertDto),
      purchases: purchases.rows.map(purchaseDto)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import", authRequired, adminRequired, async (req, res, next) => {
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  const purchases = Array.isArray(req.body.purchases) ? req.body.purchases : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM stock_alerts`);
    await client.query(`DELETE FROM purchase_entries`);
    await client.query(`DELETE FROM movements`);
    await client.query(`DELETE FROM products`);
    const productIdsBySku = new Map();
    for (const item of products) {
      const saved = await client.query(
      `INSERT INTO products (name, sku, description, category, subcategory, supplier, stock, min_stock, cost, price, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, sku`,
        sanitizeProduct(item)
      );
      productIdsBySku.set(saved.rows[0].sku, saved.rows[0].id);
    }
    for (const item of purchases) {
      const sku = String(item.sku || "").trim().toUpperCase();
      await client.query(
        `INSERT INTO purchase_entries
         (product_id, product_name, sku, category, subcategory, supplier, quantity, measure_unit, unit_cost, total_cost, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamptz, now()))`,
        sanitizePurchaseBackup(item, productIdsBySku.get(sku) || null)
      );
    }
    await client.query("COMMIT");
    res.json({ imported: products.length, purchases: purchases.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/reset-demo", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM stock_alerts`);
    await client.query(`DELETE FROM purchase_entries`);
    await client.query(`DELETE FROM movements`);
    await client.query(`DELETE FROM products`);
    for (const product of demoProducts) {
      await client.query(
        `INSERT INTO products (name, sku, description, category, subcategory, supplier, stock, min_stock, cost, price, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        product
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

function sanitizeProduct(input) {
  const product = {
    name: String(input.name || "").trim(),
    sku: String(input.sku || "").trim().toUpperCase(),
    description: String(input.description || "").trim(),
    category: String(input.category || "").trim(),
    subcategory: String(input.subcategory || "").trim(),
    supplier: String(input.supplier || "").trim(),
    stock: Number(input.stock),
    minStock: Number(input.minStock),
    cost: Number(input.cost),
    price: Number(input.price),
    location: String(input.location || "").trim()
  };

  if (!product.name || !product.sku || !product.category) {
    const error = new Error("Nombre, SKU y categoria son obligatorios");
    error.status = 400;
    throw error;
  }

  for (const field of ["stock", "minStock"]) {
    if (!Number.isInteger(product[field]) || product[field] < 0) {
      const error = new Error("Stock y minimo deben ser enteros positivos");
      error.status = 400;
      throw error;
    }
  }

  for (const field of ["cost", "price"]) {
    if (!Number.isFinite(product[field]) || product[field] < 0) {
      const error = new Error("Costo y precio deben ser positivos");
      error.status = 400;
      throw error;
    }
  }

  return [
    product.name,
    product.sku,
    product.description,
    product.category,
    product.subcategory,
    product.supplier,
    product.stock,
    product.minStock,
    product.cost,
    product.price,
    product.location
  ];
}

function sanitizePurchaseBackup(input, productId) {
  const productName = String(input.productName || input.product_name || "").trim();
  const sku = String(input.sku || "").trim().toUpperCase();
  const category = String(input.category || "Sin categoria").trim();
  const subcategory = String(input.subcategory || input.subcategory_name || "").trim();
  const supplier = String(input.supplier || "Sin proveedor").trim();
  const quantity = Number(input.quantity);
  const measureUnit = normalizePurchaseMeasureUnit(input.measureUnit || input.measure_unit);
  const unitCost = Number(input.unitCost ?? input.unit_cost);
  const totalCost = Number(input.totalCost ?? input.total_cost ?? quantity * unitCost);
  const note = String(input.note || "").trim().slice(0, 180);
  const createdValue = input.createdAt || input.created_at;
  const createdDate = createdValue ? new Date(createdValue) : null;
  const createdAt = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toISOString() : null;

  if (!productName || !sku) {
    const error = new Error("Las compras importadas requieren producto y SKU");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    const error = new Error("Las compras importadas requieren cantidad valida");
    error.status = 400;
    throw error;
  }

  if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(totalCost) || totalCost < 0) {
    const error = new Error("Las compras importadas requieren costos validos");
    error.status = 400;
    throw error;
  }

  return [productId, productName, sku, category, subcategory, supplier, quantity, measureUnit, unitCost, totalCost, note, createdAt];
}

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, req, res, next) => {
  if (error.code === "23505") {
    res.status(409).json({ error: "Ya existe un registro con ese SKU o usuario" });
    return;
  }
  res.status(error.status || 500).json({ error: error.message || "Error interno" });
});

async function start() {
  await ensureReady({ scheduler: true });

  app.listen(port, () => {
    console.log(`inventario_querendona listo en http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  });
}

module.exports = app;
