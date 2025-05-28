import { openai } from "../query-ai";
import { query as queryDb } from "../db";
import { TableInfo } from "../types/schema";

interface SchemaContext {
  relevantTables: string[];
  relevantColumns: Array<{
    tableName: string;
    columnName: string;
    relevance: number;
  }>;
  suggestedJoins: Array<{
    fromTable: string;
    toTable: string;
    fromColumn: string;
    toColumn: string;
    relevance: number;
  }>;
}

class SchemaContextService {
  /**
   * Get relevant schema context for a natural language query
   */
  async getSchemaContext(query: string): Promise<SchemaContext> {
    // 1. Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(query);

    // 2. Find relevant tables and columns
    const relevantComponents = await this.findRelevantComponents(
      queryEmbedding
    );

    // 3. Analyze relationships and suggest joins
    const suggestedJoins = await this.suggestJoins(relevantComponents);

    return {
      relevantTables: relevantComponents.tables,
      relevantColumns: relevantComponents.columns,
      suggestedJoins,
    };
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Find relevant tables and columns based on query embedding
   */
  private async findRelevantComponents(queryEmbedding: number[]): Promise<{
    tables: string[];
    columns: Array<{
      tableName: string;
      columnName: string;
      relevance: number;
    }>;
  }> {
    const query = `
      WITH relevant_components AS (
        SELECT 
          embedding_type,
          table_name,
          column_name,
          1 - (embedding <=> $1) as similarity_score
        FROM schema_embeddings
        WHERE 1 - (embedding <=> $1) > 0.7
        ORDER BY embedding <=> $1
      )
      SELECT 
        embedding_type,
        table_name,
        column_name,
        similarity_score
      FROM relevant_components;
    `;

    const result = await queryDb(query, [`[${queryEmbedding.join(",")}]`]);

    const tables = new Set<string>();
    const columns: Array<{
      tableName: string;
      columnName: string;
      relevance: number;
    }> = [];

    result.rows.forEach((row: any) => {
      if (row.embedding_type === "table") {
        tables.add(row.table_name);
      } else if (row.embedding_type === "column") {
        columns.push({
          tableName: row.table_name,
          columnName: row.column_name,
          relevance: row.similarity_score,
        });
      }
    });

    return {
      tables: Array.from(tables),
      columns,
    };
  }

  /**
   * Suggest joins based on relevant components
   */
  private async suggestJoins(components: {
    tables: string[];
    columns: Array<{
      tableName: string;
      columnName: string;
      relevance: number;
    }>;
  }): Promise<
    Array<{
      fromTable: string;
      toTable: string;
      fromColumn: string;
      toColumn: string;
      relevance: number;
    }>
  > {
    if (components.tables.length <= 1) {
      return [];
    }

    const query = `
      SELECT 
        table_name,
        column_name,
        metadata->>'parentTable' as parent_table,
        metadata->>'parentColumn' as parent_column,
        1 - (embedding <=> $1) as similarity_score
      FROM schema_embeddings
      WHERE embedding_type = 'relationship'
      AND table_name = ANY($2)
      AND metadata->>'parentTable' = ANY($2)
      ORDER BY embedding <=> $1;
    `;

    const queryEmbedding = await this.generateEmbedding(
      components.tables.join(" ")
    );

    const result = await queryDb(query, [
      `[${queryEmbedding.join(",")}]`,
      components.tables,
    ]);

    return result.rows.map((row: any) => ({
      fromTable: row.table_name,
      toTable: row.parent_table,
      fromColumn: row.column_name,
      toColumn: row.parent_column,
      relevance: row.similarity_score,
    }));
  }

  /**
   * Get detailed schema information for relevant tables
   */
  async getDetailedSchemaContext(
    relevantTables: string[]
  ): Promise<Record<string, TableInfo>> {
    const query = `
      SELECT table_name, analysis
      FROM TABLE_SCHEMA
      WHERE table_name = ANY($1);
    `;

    const result = await queryDb(query, [relevantTables]);
    return result.rows.reduce((acc: Record<string, TableInfo>, row: any) => {
      acc[row.table_name] = row.analysis;
      return acc;
    }, {});
  }
}

export default SchemaContextService;
