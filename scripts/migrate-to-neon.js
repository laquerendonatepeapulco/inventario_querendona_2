const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const dotenv = require("dotenv");

const rootDir = path.join(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const sourceUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.argv[2]
  || process.env.NEON_DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.DATABASE_URL_TARGET;

const tables = [
  ["users", ["id", "username", "password_hash", "salt", "name", "role", "label", "created_at"]],
  ["products", ["id", "name", "sku", "description", "category", "subcategory", "supplier", "stock", "min_stock", "cost", "price", "location", "created_at", "updated_at"]],
  ["movements", ["id", "product_id", "product_name", "sku", "quantity", "unit_price", "unit_cost", "movement_type", "note", "created_by", "created_at"]],
  ["purchase_entries", ["id", "product_id", "product_name", "sku", "category", "subcategory", "supplier", "quantity", "unit_cost", "total_cost", "note", "created_by", "created_at"]],
  ["stock_alerts", ["id", "product_id", "product_name", "sku", "message", "status", "created_by", "resolved_by", "created_at", "resolved_at"]],
  ["shift_exit_alert_runs", ["id", "shift_key", "shift_date", "bucket_minutes", "missing_users", "missing_user_ids", "notification_results", "created_at"], new Set(["notification_results"])],
  ["shift_exit_completion_notices", ["id", "shift_key", "shift_date", "user_id", "user_name", "username", "notification_results", "created_at"], new Set(["notification_results"])]
];

function isLocalUrl(value) {
  return /localhost|127\.0\.0\.1|::1/i.test(String(value || ""));
}

function connectionLabel(value) {
  try {
    const url = new URL(value);
    const database = url.pathname.replace(/^\//, "") || "sin_base";
    return `${url.hostname}/${database}`;
  } catch (_error) {
    return "conexion";
  }
}

function assertConnectionUrls() {
  if (!sourceUrl) {
    throw new Error("No encontre DATABASE_URL en tu .env local.");
  }
  if (!targetUrl) {
    throw new Error("Pasa la URL de Neon como argumento o guardala en NEON_DATABASE_URL.");
  }
  if (isLocalUrl(targetUrl)) {
    throw new Error("La URL destino parece local. El destino debe ser Neon/Vercel/Supabase, no localhost.");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("La URL origen y la URL destino son iguales. Revisa antes de migrar.");
  }
}

function poolFor(connectionString) {
  return new Pool({
    connectionString,
    ssl: isLocalUrl(connectionString) ? undefined : { rejectUnauthorized: false }
  });
}

async function ensureTargetSchema(client) {
  const schemaSql = fs.readFileSync(path.join(rootDir, "schema.sql"), "utf8");
  await client.query(schemaSql);

  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2)`);
  await client.query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2)`);
  await client.query(`ALTER TABLE movements ADD COLUMN IF NOT EXISTS movement_type TEXT NOT NULL DEFAULT 'entrada'`);
  await client.query(`ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE shift_exit_alert_runs ADD COLUMN IF NOT EXISTS missing_user_ids TEXT NOT NULL DEFAULT ''`);
}

async function tableExists(client, table) {
  const result = await client.query(`SELECT to_regclass($1) AS name`, [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

async function readRows(client, table, columns) {
  const exists = await tableExists(client, table);
  if (!exists) return [];

  const result = await client.query(`SELECT ${columns.join(", ")} FROM ${table}`);
  return result.rows;
}

async function insertRows(client, table, columns, rows, jsonColumns = new Set()) {
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (jsonColumns.has(column)) return JSON.stringify(value || []);
      return value === undefined ? null : value;
    });
    const placeholders = columns.map((column, index) => `$${index + 1}${jsonColumns.has(column) ? "::jsonb" : ""}`);

    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );
  }
}

async function main() {
  assertConnectionUrls();

  const source = poolFor(sourceUrl);
  const target = poolFor(targetUrl);
  const sourceClient = await source.connect();
  const targetClient = await target.connect();

  try {
    console.log(`Origen local: ${connectionLabel(sourceUrl)}`);
    console.log(`Destino Neon: ${connectionLabel(targetUrl)}`);
    console.log("Leyendo datos locales...");

    const data = [];
    for (const [table, columns, jsonColumns] of tables) {
      const rows = await readRows(sourceClient, table, columns);
      data.push({ table, columns, rows, jsonColumns: jsonColumns || new Set() });
      console.log(`- ${table}: ${rows.length}`);
    }

    console.log("Preparando destino y reemplazando datos actuales de Neon...");
    await targetClient.query("BEGIN");
    await ensureTargetSchema(targetClient);
    await targetClient.query(`
      TRUNCATE TABLE
        shift_exit_completion_notices,
        shift_exit_alert_runs,
        stock_alerts,
        purchase_entries,
        movements,
        app_sessions,
        products,
        users
      RESTART IDENTITY CASCADE
    `);

    for (const item of data) {
      await insertRows(targetClient, item.table, item.columns, item.rows, item.jsonColumns);
      console.log(`Copiado ${item.table}: ${item.rows.length}`);
    }

    await targetClient.query("COMMIT");
    console.log("Migracion completada. Neon ya tiene los datos de tu base local.");
  } catch (error) {
    await targetClient.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    sourceClient.release();
    targetClient.release();
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error(`No se pudo migrar: ${error.message}`);
  process.exit(1);
});
