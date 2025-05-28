export interface TableInfo {
  tableName: string;
  tableType: string;
  tableComment?: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault?: string;
  columnComment?: string;
  characterMaximumLength?: number;
  numericPrecision?: number;
  numericScale?: number;
}

export interface ForeignKeyInfo {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  constraintName: string;
}

export interface IndexInfo {
  indexName: string;
  tableName: string;
  columns: string[];
}

export interface EmbeddingRecord {
  embeddingType: "table" | "column" | "relationship";
  tableName: string;
  columnName?: string;
  description: string;
  businessContext: string;
  dataType?: string;
  sampleValues?: string[];
  commonPatterns?: string[];
  embedding: number[];
  metadata: Record<string, any>;
}
