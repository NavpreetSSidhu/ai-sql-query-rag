import { query as queryDb } from "../db";
import {
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
} from "../types/schema";

class SchemaAnalyzerService {
  /**
   * Analyze and store schema information for specified tables
   */
  async analyzeAndStoreSchema(tables: string[]): Promise<void> {
    console.log("🔍 Starting schema analysis...");

    for (const tableName of tables) {
      try {
        const tableInfo = await this.analyzeTable(tableName);
        await this.storeTableSchema(tableName, tableInfo);
        console.log(`✅ Analyzed schema for table: ${tableName}`);
      } catch (error: any) {
        console.error(`❌ Error analyzing table ${tableName}:`, error.message);
      }
    }
  }

  /**
   * Analyze a single table's schema
   */
  private async analyzeTable(tableName: string): Promise<TableInfo> {
    // Get basic table information
    const tableQuery = `
      SELECT 
        t.table_name,
        t.table_type,
        obj_description(c.oid) as table_comment
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      WHERE t.table_schema = 'public'
      AND t.table_name = $1;
    `;

    const tableResult = await queryDb(tableQuery, [tableName]);
    const tableRow = tableResult.rows[0];

    // Get columns
    const columns = await this.getTableColumns(tableName);

    // Get foreign keys
    const foreignKeys = await this.getTableForeignKeys(tableName);

    // Get indexes
    const indexes = await this.getTableIndexes(tableName);

    return {
      tableName: tableRow.table_name,
      tableType: tableRow.table_type,
      tableComment: tableRow.table_comment,
      columns,
      foreignKeys,
      indexes,
    };
  }

  /**
   * Get column information for a table
   */
  private async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
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

    const result = await queryDb(columnsQuery, [tableName]);
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

    const result = await queryDb(fkQuery, [tableName]);
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
  private async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
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

    const result = await queryDb(indexQuery, [tableName]);
    return result.rows.map((row: any) => ({
      indexName: row.index_name,
      tableName: row.table_name,
      columns: row.columns,
    }));
  }

  /**
   * Store table schema information
   */
  private async storeTableSchema(
    tableName: string,
    tableInfo: TableInfo
  ): Promise<void> {
    const query = `
      INSERT INTO TABLE_SCHEMA (table_name, analysis)
      VALUES ($1, $2)
      ON CONFLICT (table_name)
      DO UPDATE SET
        analysis = EXCLUDED.analysis,
        updated_at = CURRENT_TIMESTAMP;
    `;

    await queryDb(query, [tableName, JSON.stringify(tableInfo)]);
  }

  /**
   * Get stored schema information for a table
   */
  async getStoredSchema(tableName: string): Promise<TableInfo | null> {
    const query = `
      SELECT analysis
      FROM TABLE_SCHEMA
      WHERE table_name = $1;
    `;

    const result = await queryDb(query, [tableName]);
    return result.rows[0]?.analysis || null;
  }

  /**
   * Get stored schema information for multiple tables
   */
  async getStoredSchemas(
    tableNames: string[]
  ): Promise<Record<string, TableInfo>> {
    const query = `
      SELECT table_name, analysis
      FROM TABLE_SCHEMA
      WHERE table_name = ANY($1);
    `;

    const result = await queryDb(query, [tableNames]);
    return result.rows.reduce((acc: Record<string, TableInfo>, row: any) => {
      acc[row.table_name] = row.analysis;
      return acc;
    }, {});
  }
}

export default SchemaAnalyzerService;
