import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import db from "./config/db.js";

const ALLOWED_TABLES = [
  "appointments",
  "medical_records",
  "notifications",
  "staff",
  "students",
  "time_slots",
  "users",
];

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
      return {
        content: [{ type: "text", text: `Database Error: ${error.message}` }],
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
      return {
        content: [{ type: "text", text: `Database Error: ${error.message}` }],
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
      const [rows] = await db.query(`SELECT * FROM \`${table_name}\` LIMIT ?`, [
        limit,
      ]);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Database Error: ${error.message}` }],
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
    const cleaned = sql.trim();
    if (!/^select\s/i.test(cleaned)) {
      return {
        content: [
          {
            type: "text",
            text: "Security Error: SELECT queries ra ang gitugotan ani nga tool.",
          },
        ],
        isError: true,
      };
    }

    try {
      const [rows] = await db.query(cleaned);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `SQL Error: ${error.message}` }],
        isError: true,
      };
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