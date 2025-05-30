import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import { query, initializeTables } from "./db";
import { parse } from "csv-parse";
import { createReadStream } from "fs";
import { analyzeTable } from "./tableAnalyzer";
import { processQuery } from "./process-query";
import authRoutes from "./routes/authRoutes";

// Helper functions
function isValidDate(value: string): boolean {
  const date = new Date(value);
  return (
    date instanceof Date &&
    !isNaN(date.getTime()) &&
    (value.includes("-") || value.includes("/"))
  );
}

function guessSqlType(value: any): string {
  if (value === null || value === undefined) return "TEXT";
  if (typeof value === "string" && isValidDate(value)) return "TIMESTAMP";
  if (!isNaN(value) && value.toString().includes(".")) return "NUMERIC";
  if (!isNaN(value)) return "INTEGER";
  return "TEXT";
}

function normalizeColumnName(column: string): string {
  const reservedKeywords = [
    "user",
    "group",
    "order",
    "select",
    "where",
    "from",
    "table",
    "column",
  ];
  //   console.log(column);
  let normalized = column
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // If it's a reserved keyword, append '1'
  if (reservedKeywords.includes(normalized.toLowerCase())) {
    normalized += "1";
  }

  return normalized;
}

async function startServer() {
  // Initialize database tables
  await initializeTables();

  const app = express();
  app.use(cors());
  app.use(express.json()); // Add JSON body parser middleware
  const upload = multer({ dest: "uploads/" });

  // Add auth routes
  app.use("/auth", authRoutes);

  app.post("/upload-csv", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const tableName = req.body.tableName;
      if (!tableName) {
        return res.status(400).json({ error: "Table name is required" });
      }

      const csvStream = createReadStream(req.file.path);
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
      });

      // Collect first 10 rows to analyze column types
      const sampleRows: any[] = [];
      const columnTypes = new Map<string, string>();

      for await (const record of csvStream.pipe(parser)) {
        sampleRows.push(record);
        if (sampleRows.length === 10) break;
      }

      if (sampleRows.length === 0) {
        return res.status(400).json({ error: "CSV file is empty" });
      }

      // Determine column types from sample data
      const columns = Object.keys(sampleRows[0]).map(normalizeColumnName);
      columns.forEach((column, index) => {
        const originalColumn = Object.keys(sampleRows[0])[index];
        const values = sampleRows
          .map((row) => row[originalColumn])
          .filter((v) => v !== null && v !== "");
        columnTypes.set(column, guessSqlType(values[0]));
      });

      // Drop existing table if it exists
      await query(`DROP TABLE IF EXISTS ${tableName}`);

      // Create new table
      const createTableSQL = `
        CREATE TABLE ${tableName} (
          ${columns
            .map((column) => `${column} ${columnTypes.get(column)}`)
            .join(",\n")}
        )
      `;
      console.log(createTableSQL);
      await query(createTableSQL);

      // Reset stream for full import
      const insertStream = createReadStream(req.file.path);
      const insertParser = insertStream.pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
        })
      );

      // Insert all records
      for await (const record of insertParser) {
        const originalColumns = Object.keys(record);
        const insertSQL = `
          INSERT INTO ${tableName} (${columns.map((c) => `"${c}"`).join(", ")})
          VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
        `;
        await query(
          insertSQL,
          originalColumns.map((c) => record[c])
        );
      }

      // After successful upload, analyze the table and store the results
      const analysis = await analyzeTable(tableName);

      // Store the analysis in TABLE_SCHEMA
      await query(
        `INSERT INTO TABLE_SCHEMA (table_name, analysis)
         VALUES ($1, $2)
         ON CONFLICT (table_name) 
         DO UPDATE SET 
           analysis = $2,
           updated_at = CURRENT_TIMESTAMP`,
        [tableName, analysis]
      );

      res.json({
        message: "CSV data successfully imported to database",
        tableName,
        columnCount: columns.length,
        columnTypes: Object.fromEntries(columnTypes),
        analysis,
      });
    } catch (error) {
      console.error("Error processing CSV:", error);
      res.status(500).json({ error: "Failed to process CSV file" });
    }
  });

  app.post("/query", express.json(), async (req, res) => {
    try {
      const { message } = req.body;

      // Process the query using our new function
      const result = await processQuery(message);

      res.json(result);
    } catch (error) {
      console.error("Error processing query:", error);
      res.status(500).json({ error: "Failed to process query" });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Start the server and handle any errors
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
