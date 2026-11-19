import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import db from "./config/db.js";
import { redactPrivateColumns, validateReadOnlyQuery } from "./mcp-security.mjs";

const ALLOWED_TABLES = [
  "appointments",
  "medical_records",
  "notifications",
  "staff",
  "students",
  "time_slots",
  "users",
];
const PREVIEW_ORDER_COLUMNS = {
  appointments: "appointment_id",
  medical_records: "record_id",
  notifications: "notification_id",
  staff: "staff_id",
  students: "student_id",
  time_slots: "slot_id",
  users: "user_id",
};

const server = new McpServer({
  name: "school-clinic-mcp",
  version: "1.1.0",
});

// 1. List all tables
server.tool(
  "check_clinic_tables",
  "I-lista ang tanang tables sa school clinic database",
  {},
  async () => {
    try {
      const [rows] = await db.query("SHOW TABLES");
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error) {
      console.error("Failed to inspect clinic tables:", error);
      return {
        content: [{ type: "text", text: "Unable to inspect clinic tables. Check database connectivity." }],
        isError: true,
      };
    }
  }
);

// 2. Inspect columns & schema of a specific table
server.tool(
  "describe_table",
  "Tan-awa ang columns, data types, ug structure sa usa ka table sa schoolclinic_db",
  {
    table_name: z
      .enum(ALLOWED_TABLES)
      .describe("Ngalan sa table (e.g., students, appointments, medical_records)"),
  },
  async ({ table_name }) => {
    try {
      const [rows] = await db.query(`DESCRIBE \`${table_name}\``);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error) {
      console.error("Failed to describe clinic table:", error);
      return {
        content: [{ type: "text", text: "Unable to describe this clinic table. Check database connectivity." }],
        isError: true,
      };
    }
  }
);

// 3. Preview rows from a table
server.tool(
  "get_table_preview",
  "Kuhaa ang pinakabag-ong records gikan sa usa ka table (maximum 20 rows)",
  {
    table_name: z.enum(ALLOWED_TABLES).describe("Ngalan sa table nga tan-awon"),
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Pila ka rows ang kuhaon (1-20)"),
  },
  async ({ table_name, limit }) => {
    try {
      const orderColumn = PREVIEW_ORDER_COLUMNS[table_name];
      const [rows] = await db.query(
        `SELECT * FROM \`${table_name}\` ORDER BY \`${orderColumn}\` DESC LIMIT ?`,
        [limit],
      );
      return {
        content: [{ type: "text", text: JSON.stringify(redactPrivateColumns(rows), null, 2) }],
      };
    } catch (error) {
      console.error("Failed to preview clinic table:", error);
      return {
        content: [{ type: "text", text: "Unable to preview this clinic table. Check database connectivity." }],
        isError: true,
      };
    }
  }
);

// 4. Run custom SELECT query (Read-Only)
server.tool(
  "run_readonly_query",
  "Pag-execute og SELECT query para mag-search o mag-join sa schoolclinic_db",
  {
    sql: z
      .string()
      .describe("Valid MySQL SELECT statement (SELECT ra ang pwede)"),
  },
  async ({ sql }) => {
    let connection;
    try {
      const cleaned = validateReadOnlyQuery(sql);
      connection = await db.getConnection();
      await connection.query("START TRANSACTION READ ONLY");
      const [rows] = await connection.query({ sql: cleaned, timeout: 5000 });
      await connection.commit();
      return {
        content: [{ type: "text", text: JSON.stringify(redactPrivateColumns(rows), null, 2) }],
      };
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Read-only MCP query failed:", error);
      return {
        content: [{ type: "text", text: "Query rejected or failed. Check that it is a permitted SELECT and that the database is available." }],
        isError: true,
      };
    } finally {
      if (connection) connection.release();
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("School Clinic MCP Server v1.1.0 is running...");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});