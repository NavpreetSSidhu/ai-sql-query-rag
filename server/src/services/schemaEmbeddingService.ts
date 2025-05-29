import dotenv from "dotenv";
import { getPool } from "../db";
import { openai } from "../query-ai";
import {
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  EmbeddingRecord,
} from "../types/schema";

dotenv.config();

class SchemaEmbeddingService {
  private pool = getPool();

  /**
   * Main method to generate and store all embeddings
   */
  async generateAndStoreAllEmbeddings(tables: string[]): Promise<void> {
    console.log("🚀 Starting schema embedding generation...");

    try {
      // 1. Extract schema information
      const schemaInfo = await this.extractSchemaMetadata(tables);

      // 2. Generate and store table embeddings
      await this.generateTableEmbeddings(schemaInfo);

      // 3. Generate and store column embeddings
      await this.generateColumnEmbeddings(schemaInfo);

      // 4. Generate and store relationship embeddings
      await this.generateRelationshipEmbeddings(schemaInfo);

      console.log("✅ Schema embedding generation completed successfully!");
    } catch (error) {
      console.error("❌ Error generating embeddings:", error);
      throw error;
    }
  }

  /**
   * Extract comprehensive schema metadata
   */
  private async extractSchemaMetadata(tables: string[]): Promise<TableInfo[]> {
    const client = await this.pool.connect();

    try {
      // Get table information
      const tablesQuery = `
        SELECT 
          t.table_name,
          t.table_type,
          obj_description(c.oid) as table_comment
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name = ANY($1)
        ORDER BY t.table_name;
      `;

      const tablesResult = await client.query(tablesQuery, [tables]);
      const tablesInfo: TableInfo[] = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;

        // Get columns for this table
        const columns = await this.getTableColumns(client, tableName);

        // Get foreign keys for this table
        const foreignKeys = await this.getTableForeignKeys(client, tableName);

        // Get indexes for this table
        const indexes = await this.getTableIndexes(client, tableName);

        tablesInfo.push({
          tableName,
          tableType: tableRow.table_type,
          tableComment: tableRow.table_comment,
          columns,
          foreignKeys,
          indexes,
        });
      }

      console.log(`📊 Extracted metadata for ${tablesInfo.length} tables`);
      return tablesInfo;
    } finally {
      client.release();
    }
  }

  /**
   * Get column information for a table
   */
  private async getTableColumns(
    client: any,
    tableName: string
  ): Promise<ColumnInfo[]> {
    const columnsQuery = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        col_description(pgc.oid, c.ordinal_position) as column_comment,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale
      FROM information_schema.columns c
      LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
      WHERE c.table_schema = 'public' 
      AND c.table_name = $1
      ORDER BY c.ordinal_position;
    `;

    const result = await client.query(columnsQuery, [tableName]);
    return result.rows.map((row: any) => ({
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable,
      columnDefault: row.column_default,
      columnComment: row.column_comment,
      characterMaximumLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
    }));
  }

  /**
   * Get foreign key relationships for a table
   */
  private async getTableForeignKeys(
    client: any,
    tableName: string
  ): Promise<ForeignKeyInfo[]> {
    const fkQuery = `
      SELECT 
        tc.table_name as child_table,
        kcu.column_name as child_column,
        ccu.table_name as parent_table,
        ccu.column_name as parent_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = $1;
    `;

    const result = await client.query(fkQuery, [tableName]);
    return result.rows.map((row: any) => ({
      childTable: row.child_table,
      childColumn: row.child_column,
      parentTable: row.parent_table,
      parentColumn: row.parent_column,
      constraintName: row.constraint_name,
    }));
  }

  /**
   * Get indexes for a table
   */
  private async getTableIndexes(
    client: any,
    tableName: string
  ): Promise<IndexInfo[]> {
    const indexQuery = `
      SELECT 
        i.relname as index_name,
        t.relname as table_name,
        array_agg(a.attname ORDER BY a.attnum) as columns
      FROM pg_class i
      JOIN pg_index ix ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE i.relkind = 'i' 
      AND t.relname = $1
      AND i.relname NOT LIKE 'pg_%'
      GROUP BY i.relname, t.relname;
    `;

    const result = await client.query(indexQuery, [tableName]);
    return result.rows.map((row: any) => ({
      indexName: row.index_name,
      tableName: row.table_name,
      columns: row.columns,
    }));
  }

  /**
   * Generate embeddings for all tables
   */
  private async generateTableEmbeddings(tables: TableInfo[]): Promise<void> {
    console.log("🔄 Generating table embeddings...");

    for (const table of tables) {
      try {
        const tableContext = this.buildTableContext(table);
        const embedding = await this.generateEmbedding(tableContext);

        const embeddingRecord: EmbeddingRecord = {
          embeddingType: "table",
          tableName: table.tableName,
          description: tableContext,
          businessContext: this.inferTablePurpose(table),
          embedding: embedding,
          metadata: {
            columnCount: table.columns.length,
            foreignKeyCount: table.foreignKeys.length,
            indexCount: table.indexes.length,
            hasTimestamps: this.hasTimestampColumns(table),
            hasAuditFields: this.hasAuditFields(table),
          },
        };

        await this.storeEmbedding(embeddingRecord);
        console.log(`✅ Generated embedding for table: ${table.tableName}`);

        // Rate limiting - OpenAI has rate limits
        await this.sleep(100);
      } catch (error) {
        console.error(
          `❌ Error generating embedding for table ${table.tableName}:`,
          error
        );
      }
    }
  }

  /**
   * Generate embeddings for all columns
   */
  private async generateColumnEmbeddings(tables: TableInfo[]): Promise<void> {
    console.log("🔄 Generating column embeddings...");

    for (const table of tables) {
      for (const column of table.columns) {
        try {
          const columnContext = this.buildColumnContext(table, column);
          const embedding = await this.generateEmbedding(columnContext);

          // Get sample values for this column
          const sampleValues = await this.getSampleValues(
            table.tableName,
            column.columnName
          );

          const embeddingRecord: EmbeddingRecord = {
            embeddingType: "column",
            tableName: table.tableName,
            columnName: column.columnName,
            description: columnContext,
            businessContext: this.inferColumnBusinessMeaning(table, column),
            dataType: column.dataType,
            sampleValues: sampleValues,
            commonPatterns: this.getCommonColumnPatterns(column),
            embedding: embedding,
            metadata: {
              isNullable: column.isNullable === "YES",
              hasDefault: !!column.columnDefault,
              maxLength: column.characterMaximumLength,
              precision: column.numericPrecision,
              scale: column.numericScale,
            },
          };

          await this.storeEmbedding(embeddingRecord);
          console.log(
            `✅ Generated embedding for column: ${table.tableName}.${column.columnName}`
          );

          await this.sleep(100);
        } catch (error) {
          console.error(
            `❌ Error generating embedding for column ${table.tableName}.${column.columnName}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Generate embeddings for relationships
   */
  private async generateRelationshipEmbeddings(
    tables: TableInfo[]
  ): Promise<void> {
    console.log("🔄 Generating relationship embeddings...");

    const processedRelationships = new Set<string>();

    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        const relationshipKey = `${fk.childTable}.${fk.childColumn}->${fk.parentTable}.${fk.parentColumn}`;

        if (processedRelationships.has(relationshipKey)) continue;
        processedRelationships.add(relationshipKey);

        try {
          const relationshipContext = this.buildRelationshipContext(fk);
          const embedding = await this.generateEmbedding(relationshipContext);

          const embeddingRecord: EmbeddingRecord = {
            embeddingType: "relationship",
            tableName: fk.childTable,
            columnName: fk.childColumn,
            description: relationshipContext,
            businessContext: this.inferRelationshipMeaning(fk),
            embedding: embedding,
            metadata: {
              parentTable: fk.parentTable,
              parentColumn: fk.parentColumn,
              constraintName: fk.constraintName,
              relationshipType: "foreign_key",
            },
          };

          await this.storeEmbedding(embeddingRecord);
          console.log(
            `✅ Generated embedding for relationship: ${relationshipKey}`
          );

          await this.sleep(100);
        } catch (error) {
          console.error(
            `❌ Error generating embedding for relationship ${relationshipKey}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Build comprehensive table context for embedding
   */
  private buildTableContext(table: TableInfo): string {
    const columnNames = table.columns.map((col) => col.columnName).join(", ");
    const foreignKeyInfo = table.foreignKeys
      .map((fk) => `${fk.childColumn} -> ${fk.parentTable}.${fk.parentColumn}`)
      .join(", ");

    return `
      TABLE: ${table.tableName}
      PURPOSE: ${this.inferTablePurpose(table)}
      COLUMNS: ${columnNames}
      FOREIGN_KEYS: ${foreignKeyInfo}
      BUSINESS_CONTEXT: ${table.tableComment || "No description available"}
      COMMON_QUERIES: ${this.getCommonQueryPatterns(table).join(", ")}
      RELATED_TABLES: ${this.getRelatedTables(table).join(", ")}
      DATA_PATTERNS: ${this.getDataPatterns(table).join(", ")}
    `.trim();
  }

  /**
   * Build comprehensive column context for embedding
   */
  private buildColumnContext(table: TableInfo, column: ColumnInfo): string {
    return `
      COLUMN: ${table.tableName}.${column.columnName}
      DATA_TYPE: ${column.dataType}
      NULLABLE: ${column.isNullable}
      DEFAULT: ${column.columnDefault || "None"}
      DESCRIPTION: ${column.columnComment || "No description available"}
      BUSINESS_MEANING: ${this.inferColumnBusinessMeaning(table, column)}
      TABLE_CONTEXT: ${this.inferTablePurpose(table)}
      AGGREGATION_TYPE: ${this.inferAggregationType(column)}
      FILTER_PATTERNS: ${this.getCommonColumnPatterns(column).join(", ")}
    `.trim();
  }

  /**
   * Build relationship context for embedding
   */
  private buildRelationshipContext(fk: ForeignKeyInfo): string {
    return `
      RELATIONSHIP: ${fk.childTable}.${fk.childColumn} -> ${fk.parentTable}.${
      fk.parentColumn
    }
      TYPE: foreign_key_relationship
      CHILD_TABLE: ${fk.childTable}
      PARENT_TABLE: ${fk.parentTable}
      BUSINESS_MEANING: ${this.inferRelationshipMeaning(fk)}
      JOIN_PATTERN: ${fk.childTable}.${fk.childColumn} = ${fk.parentTable}.${
      fk.parentColumn
    }
      TYPICAL_USE: Join ${fk.childTable} with ${fk.parentTable} for related data
    `.trim();
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Store embedding in PostgreSQL
   */
  private async storeEmbedding(record: EmbeddingRecord): Promise<void> {
    const client = await this.pool.connect();

    try {
      const query = `
        INSERT INTO schema_embeddings (
          embedding_type, table_name, column_name, description, 
          business_context, data_type, sample_values, common_patterns,
          embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (embedding_type, table_name, COALESCE(column_name, ''))
        DO UPDATE SET
          description = EXCLUDED.description,
          business_context = EXCLUDED.business_context,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = NOW();
      `;

      await client.query(query, [
        record.embeddingType,
        record.tableName,
        record.columnName || null,
        record.description,
        record.businessContext,
        record.dataType || null,
        record.sampleValues || null,
        record.commonPatterns || null,
        `[${record.embedding.join(",")}]`,
        JSON.stringify(record.metadata),
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Get sample values from a column
   */
  private async getSampleValues(
    tableName: string,
    columnName: string,
    limit: number = 5
  ): Promise<string[]> {
    const client = await this.pool.connect();

    try {
      const query = `
        SELECT DISTINCT ${columnName} 
        FROM ${tableName} 
        WHERE ${columnName} IS NOT NULL 
        LIMIT $1;
      `;

      const result = await client.query(query, [limit]);
      return result.rows.map((row: any) => String(row[columnName]));
    } catch (error: any) {
      console.warn(
        `Could not get sample values for ${tableName}.${columnName}:`,
        error.message
      );
      return [];
    } finally {
      client.release();
    }
  }

  // Business Logic Inference Methods
  private inferTablePurpose(table: TableInfo): string {
    const tableName = table.tableName.toLowerCase();
    const purposePatterns: Record<string, string> = {
      user: "Stores user account information and profiles",
      customer: "Customer data and contact information",
      order: "Transaction and purchase records",
      product: "Product catalog and inventory information",
      payment: "Financial transaction and payment records",
      invoice: "Billing and invoice data",
      log: "System activity and audit trails",
      session: "User session and authentication data",
      config: "System configuration and settings",
      audit: "Audit trail and change tracking",
      report: "Reporting and analytics data",
      notification: "System notifications and alerts",
    };

    for (const [pattern, purpose] of Object.entries(purposePatterns)) {
      if (tableName.includes(pattern)) {
        return purpose;
      }
    }

    return `Data storage for ${table.tableName} related operations`;
  }

  private inferColumnBusinessMeaning(
    table: TableInfo,
    column: ColumnInfo
  ): string {
    const columnName = column.columnName.toLowerCase();
    const dataType = column.dataType.toLowerCase();

    // Common business meaning patterns
    if (columnName.includes("email")) return "Email address for communication";
    if (columnName.includes("phone")) return "Phone number for contact";
    if (columnName.includes("name")) return "Identifying name or label";
    if (columnName.includes("address")) return "Physical or mailing address";
    if (columnName.includes("price") || columnName.includes("amount"))
      return "Monetary value or cost";
    if (columnName.includes("date") || columnName.includes("time"))
      return "Timestamp for tracking when events occurred";
    if (columnName.includes("status"))
      return "Current state or condition indicator";
    if (columnName.includes("id") && columnName !== "id")
      return `Reference to related ${columnName.replace("_id", "")} record`;
    if (columnName === "id")
      return `Unique identifier for ${table.tableName} records`;
    if (columnName.includes("count") || columnName.includes("quantity"))
      return "Numerical count or quantity measurement";
    if (dataType.includes("boolean")) return "Yes/No flag or toggle setting";

    return `${column.columnName} data for ${table.tableName}`;
  }

  private inferRelationshipMeaning(fk: ForeignKeyInfo): string {
    return `Each ${fk.childTable} record is associated with a ${fk.parentTable} record through ${fk.childColumn}`;
  }

  private getCommonQueryPatterns(table: TableInfo): string[] {
    const patterns: string[] = [];
    const hasCreatedAt = table.columns.some((col) =>
      col.columnName.toLowerCase().includes("created")
    );
    const hasStatus = table.columns.some((col) =>
      col.columnName.toLowerCase().includes("status")
    );
    const hasUserId = table.columns.some((col) =>
      col.columnName.toLowerCase().includes("user_id")
    );

    patterns.push(`SELECT * FROM ${table.tableName}`);

    if (hasCreatedAt) {
      patterns.push(`SELECT * FROM ${table.tableName} WHERE created_at >= ?`);
    }

    if (hasStatus) {
      patterns.push(`SELECT * FROM ${table.tableName} WHERE status = ?`);
    }

    if (hasUserId) {
      patterns.push(`SELECT * FROM ${table.tableName} WHERE user_id = ?`);
    }

    return patterns;
  }

  private getRelatedTables(table: TableInfo): string[] {
    const related = new Set<string>();

    // Add parent tables (tables this table references)
    table.foreignKeys.forEach((fk) => related.add(fk.parentTable));

    return Array.from(related);
  }

  private getDataPatterns(table: TableInfo): string[] {
    const patterns: string[] = [];

    if (this.hasTimestampColumns(table)) patterns.push("timestamped_data");
    if (this.hasAuditFields(table)) patterns.push("auditable_records");
    if (table.foreignKeys.length > 0) patterns.push("relational_data");
    if (
      table.columns.some((col) =>
        col.columnName.toLowerCase().includes("status")
      )
    )
      patterns.push("status_tracking");

    return patterns;
  }

  private getCommonColumnPatterns(column: ColumnInfo): string[] {
    const patterns: string[] = [];
    const columnName = column.columnName.toLowerCase();
    const dataType = column.dataType.toLowerCase();

    if (columnName.includes("id"))
      patterns.push("equality_filter", "join_condition");
    if (columnName.includes("date") || columnName.includes("time"))
      patterns.push("date_range_filter", "ordering");
    if (columnName.includes("status"))
      patterns.push("equality_filter", "grouping");
    if (columnName.includes("name")) patterns.push("text_search", "ordering");
    if (dataType.includes("numeric") || dataType.includes("integer"))
      patterns.push("range_filter", "aggregation");
    if (dataType.includes("boolean")) patterns.push("boolean_filter");

    return patterns;
  }

  private inferAggregationType(column: ColumnInfo): string {
    const columnName = column.columnName.toLowerCase();
    const dataType = column.dataType.toLowerCase();

    if (columnName.includes("count") || columnName.includes("quantity"))
      return "SUM, COUNT";
    if (columnName.includes("price") || columnName.includes("amount"))
      return "SUM, AVG, MIN, MAX";
    if (columnName.includes("date") || columnName.includes("time"))
      return "MIN, MAX, COUNT";
    if (dataType.includes("numeric") || dataType.includes("integer"))
      return "SUM, AVG, COUNT, MIN, MAX";
    if (dataType.includes("text") || dataType.includes("varchar"))
      return "COUNT, GROUP BY";

    return "COUNT";
  }

  private hasTimestampColumns(table: TableInfo): boolean {
    return table.columns.some(
      (col) =>
        col.columnName.toLowerCase().includes("created") ||
        col.columnName.toLowerCase().includes("updated") ||
        col.columnName.toLowerCase().includes("timestamp")
    );
  }

  private hasAuditFields(table: TableInfo): boolean {
    const auditFields = [
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
      "deleted_at",
    ];
    return auditFields.some((field) =>
      table.columns.some((col) => col.columnName.toLowerCase() === field)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Search for relevant schema components based on query
   */
  async searchRelevantSchema(
    queryEmbedding: number[],
    limit: number = 10
  ): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      const query = `
        SELECT 
          embedding_type,
          table_name,
          column_name,
          description,
          business_context,
          data_type,
          sample_values,
          common_patterns,
          metadata,
          1 - (embedding <=> $1) as similarity_score
        FROM schema_embeddings
        WHERE 1 - (embedding <=> $1) > 0.7
        ORDER BY embedding <=> $1
        LIMIT $2;
      `;

      const result = await client.query(query, [
        `[${queryEmbedding.join(",")}]`,
        limit,
      ]);
      return result.rows;
    } finally {
      client.release();
    }
  }
}

export default SchemaEmbeddingService;
