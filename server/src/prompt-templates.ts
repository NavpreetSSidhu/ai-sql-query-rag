import { TableInfo } from "./types/schema";

export interface SchemaAnalysisInput {
  tables: Array<{
    tableName: string;
    analysis: TableInfo;
  }>;
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

export interface SchemaAnalysisResponse {
  inScope: boolean;
  outOfScopeReason?: string;
  relevantTables: string[];
  requiredColumns: Array<{
    tableName: string;
    columnName: string;
    purpose: string;
  }>;
  requiredJoins: Array<{
    fromTable: string;
    toTable: string;
    fromColumn: string;
    toColumn: string;
    joinType: "INNER" | "LEFT" | "RIGHT";
  }>;
  filters: Array<{
    tableName: string;
    columnName: string;
    operator: string;
    value?: any;
  }>;
  aggregations: Array<{
    tableName: string;
    columnName: string;
    function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
    alias?: string;
  }>;
  sorting: Array<{
    tableName: string;
    columnName: string;
    direction: "ASC" | "DESC";
  }>;
}

export interface TriageResponse {
  queryType: "GENERAL_QUESTION" | "DATA_QUESTION" | "OUT_OF_SCOPE" | "GREETING";
  confidence: number;
  reasoning: string;
}

export interface ValidateAnswerResponse {
  isAnswered: boolean;
  reason?: string;
  missingInformation?: string[];
  suggestedImprovements?: string[];
}

export const prompts = {
  triage: (message: string) => ({
    system: `You are a query classifier for a legal practice management system. 
    The system primarily works with these core tables:
    - users: Contains user-specific information
    - teams: Contains team information
    - team_user: Links users to teams with their roles (contains user_id and team_id)
    - matters: Contains legal matters, belongs to teams
    - bank_account_transactions: Contains financial transactions
    - contacts: Contains contact information
    - invoices: Contains invoice information
    
    All tables have 'id' as their primary key, and there are relationships between these tables.
    Users belong to teams through team_user, and team members have access to their team's matters, transactions, invoices, and contacts.
    
    Classify the user's question into one of these categories:
    - GREETING: Simple greetings or salutations
    - GENERAL_QUESTION: Questions about the system, features, or general information
    - DATA_QUESTION: Questions that require querying the database
    - OUT_OF_SCOPE: Questions that cannot be answered by the system
    
    Respond in JSON format with:
    {
      "queryType": "GREETING" | "GENERAL_QUESTION" | "DATA_QUESTION" | "OUT_OF_SCOPE",
      "confidence": number between 0 and 1,
      "reasoning": "explanation for the classification"
    }`,
    user: "Classify this question:",
  }),

  generalAnswer: (message: string) => ({
    system: `You are a helpful assistant for a legal practice management system. 
    Answer general questions about the system, its features, and usage.
    Provide clear, concise answers and include examples when helpful.
    
    Respond in JSON format with:
    {
      "answer": "your detailed answer",
      "examples": ["example 1", "example 2"]
    }`,
    user: `Answer this question: ${message}`,
  }),

  schemaAnalysis: (input: SchemaAnalysisInput, message: string) => ({
    system: `You are a database schema analyzer for a legal practice management system.
    The system primarily works with these core tables and their relationships:
    
    Core Tables:
    1. users
       - Primary key: id
       - Contains user-specific information
    
    2. teams
       - Primary key: id
       - Contains team information
    
    3. team_user
       - Primary key: id
       - Links users to teams
       - Contains user_id and team_id
       - Contains role information
    
    4. matters
       - Primary key: id
       - Belongs to teams
       - Team members have access to their team's matters
    
    5. bank_account_transactions
       - Primary key: id
       - Contains financial transactions
    
    6. contacts
       - Primary key: id
       - Contains contact information
    
    7. invoices
       - Primary key: id
       - Contains invoice information
    
    Key Relationships:
    - Users belong to teams through team_user table
    - Team members have access to their team's:
      * Matters
      * Transactions
      * Invoices
      * Contacts
    
    Analyze the user's question and determine how to query the database.
    
    Available schema context:
    ${formatSchemaContext(input)}
    
    Respond in JSON format with:
    {
      "inScope": boolean,
      "outOfScopeReason": "explanation if out of scope",
      "relevantTables": ["table1", "table2"],
      "requiredColumns": [
        {
          "tableName": "table1",
          "columnName": "column1",
          "purpose": "explanation of why this column is needed"
        }
      ],
      "requiredJoins": [
        {
          "fromTable": "table1",
          "toTable": "table2",
          "fromColumn": "column1",
          "toColumn": "column2",
          "joinType": "INNER" | "LEFT" | "RIGHT"
        }
      ],
      "filters": [
        {
          "tableName": "table1",
          "columnName": "column1",
          "operator": "=" | ">" | "<" | "LIKE" | "IN",
          "value": "optional value"
        }
      ],
      "aggregations": [
        {
          "tableName": "table1",
          "columnName": "column1",
          "function": "COUNT" | "SUM" | "AVG" | "MIN" | "MAX",
          "alias": "optional alias"
        }
      ],
      "sorting": [
        {
          "tableName": "table1",
          "columnName": "column1",
          "direction": "ASC" | "DESC"
        }
      ]
    }`,
    user: `Analyze this question and determine the required database operations: ${message}`,
  }),

  generateSQL: (analysis: SchemaAnalysisResponse, message: string) => ({
    system: `You are a PostgreSQL query generator for a legal practice management system.
    Generate an efficient and optimized PostgreSQL query based on the schema analysis.
    
    Schema Analysis:
    ${formatSchemaAnalysis(analysis)}
    
    PostgreSQL Best Practices:
    1. Use appropriate PostgreSQL-specific features:
       - Use DISTINCT ON instead of GROUP BY when selecting unique rows
       - Use STRING_AGG for string concatenation with delimiters
       - Use DATE_TRUNC for date/time operations
       - Use WITH for Common Table Expressions (CTEs)
       - Use LATERAL joins for correlated subqueries
       - Use WINDOW functions (ROW_NUMBER, RANK, DENSE_RANK) for ranking
       - Use JSON/JSONB functions for JSON data
       - Use ARRAY_AGG for array aggregation
       - Use FILTER clause for conditional aggregation
       - Use COALESCE for NULL handling
       - Use ILIKE for case-insensitive pattern matching
    
    2. Query Optimization:
       - Use appropriate indexes (check the schema for available indexes)
       - Use materialized CTEs for complex subqueries
       - Use appropriate join types (INNER, LEFT, RIGHT, FULL)
       - Use EXISTS instead of IN for better performance
       - Use LIMIT with ORDER BY for pagination
       - Use OFFSET for skipping rows
       - Use FETCH FIRST n ROWS ONLY for modern pagination
    
    3. Data Type Handling:
       - Use proper type casting (::type)
       - Use appropriate date/time functions
       - Use proper text search functions (to_tsvector, to_tsquery)
       - Use proper numeric functions for calculations
    
    4. Security and Best Practices:
       - Use parameterized queries
       - Use proper escaping for identifiers
       - Use appropriate permissions
       - Use proper error handling
    
    Respond in JSON format with:
    {
      "query": "your optimized PostgreSQL query",
      "explanation": "explanation of the query structure and optimizations",
      "performanceNotes": ["note 1", "note 2"],
      "indexUsage": ["index 1", "index 2"]
    }`,
    user: `Generate a PostgreSQL query for this question: ${message}`,
  }),

  regenerateSQL: (
    analysis: SchemaAnalysisResponse,
    message: string,
    previousQuery: string,
    error: string
  ) => ({
    system: `You are a PostgreSQL query generator for a legal practice management system.
    Regenerate an optimized PostgreSQL query based on the schema analysis and previous error.
    
    Schema Analysis:
    ${formatSchemaAnalysis(analysis)}
    
    Previous Query:
    ${previousQuery}
    
    Error:
    ${error}
    
    PostgreSQL Best Practices:
    1. Use appropriate PostgreSQL-specific features:
       - Use DISTINCT ON instead of GROUP BY when selecting unique rows
       - Use STRING_AGG for string concatenation with delimiters
       - Use DATE_TRUNC for date/time operations
       - Use WITH for Common Table Expressions (CTEs)
       - Use LATERAL joins for correlated subqueries
       - Use WINDOW functions (ROW_NUMBER, RANK, DENSE_RANK) for ranking
       - Use JSON/JSONB functions for JSON data
       - Use ARRAY_AGG for array aggregation
       - Use FILTER clause for conditional aggregation
       - Use COALESCE for NULL handling
       - Use ILIKE for case-insensitive pattern matching
    
    2. Query Optimization:
       - Use appropriate indexes (check the schema for available indexes)
       - Use materialized CTEs for complex subqueries
       - Use appropriate join types (INNER, LEFT, RIGHT, FULL)
       - Use EXISTS instead of IN for better performance
       - Use LIMIT with ORDER BY for pagination
       - Use OFFSET for skipping rows
       - Use FETCH FIRST n ROWS ONLY for modern pagination
    
    3. Data Type Handling:
       - Use proper type casting (::type)
       - Use appropriate date/time functions
       - Use proper text search functions (to_tsvector, to_tsquery)
       - Use proper numeric functions for calculations
    
    4. Security and Best Practices:
       - Use parameterized queries
       - Use proper escaping for identifiers
       - Use appropriate permissions
       - Use proper error handling
    
    Respond in JSON format with:
    {
      "query": "your corrected and optimized PostgreSQL query",
      "explanation": "explanation of the changes and optimizations made",
      "performanceNotes": ["note 1", "note 2"],
      "indexUsage": ["index 1", "index 2"],
      "errorResolution": "explanation of how the error was fixed"
    }`,
    user: `Regenerate a PostgreSQL query for this question: ${message}`,
  }),

  formatAnswer: (message: string, query: string, results: any[]) => ({
    system: `You are a data presentation expert for a legal practice management system.
    Format the query results into a clear, natural language response.
    
    Original Question:
    ${message}
    
    SQL Query:
    ${query}
    
    Query Results:
    ${JSON.stringify(results, null, 2)}
    
    Respond in JSON format with:
    {
      "answer": "your formatted response",
      "highlights": ["key point 1", "key point 2"],
      "caveats": ["limitation 1", "limitation 2"]
    }`,
    user: "Format the results into a clear response",
  }),

  validateAnswer: (message: string, answer: string) => ({
    system: `You are a response validator for a legal practice management system.
    Validate if the answer properly addresses the user's question.
    
    Original Question:
    ${message}
    
    Generated Answer:
    ${answer}
    
    Respond in JSON format with:
    {
      "isAnswered": boolean,
      "reason": "explanation if not answered",
      "missingInformation": ["missing info 1", "missing info 2"],
      "suggestedImprovements": ["improvement 1", "improvement 2"]
    }`,
    user: "Validate if this answer properly addresses the question",
  }),
};

function formatSchemaContext(input: SchemaAnalysisInput): string {
  const tables = input.tables
    .map(
      (table) => `
    Table: ${table.tableName}
    Type: ${table.analysis.tableType}
    Description: ${table.analysis.tableComment || "No description"}
    Columns:
    ${table.analysis.columns
      .map(
        (col) =>
          `  - ${col.columnName} (${col.dataType})${
            col.columnComment ? ` - ${col.columnComment}` : ""
          }`
      )
      .join("\n")}
    Foreign Keys:
    ${table.analysis.foreignKeys
      .map(
        (fk) => `  - ${fk.childColumn} -> ${fk.parentTable}.${fk.parentColumn}`
      )
      .join("\n")}
    Indexes:
    ${table.analysis.indexes
      .map((idx) => `  - ${idx.indexName} (${idx.columns.join(", ")})`)
      .join("\n")}
  `
    )
    .join("\n");

  const relevantColumns = input.relevantColumns
    .map(
      (col) => `
    Column: ${col.tableName}.${col.columnName}
    Relevance: ${col.relevance.toFixed(2)}
  `
    )
    .join("\n");

  const suggestedJoins = input.suggestedJoins
    .map(
      (join) => `
    Join: ${join.fromTable}.${join.fromColumn} -> ${join.toTable}.${
        join.toColumn
      }
    Relevance: ${join.relevance.toFixed(2)}
  `
    )
    .join("\n");

  return `
    Tables:
    ${tables}
    
    Relevant Columns:
    ${relevantColumns}
    
    Suggested Joins:
    ${suggestedJoins}
  `;
}

function formatSchemaAnalysis(analysis: SchemaAnalysisResponse): string {
  return `
    Relevant Tables: ${analysis.relevantTables.join(", ")}
    
    Required Columns:
    ${analysis.requiredColumns
      .map((col) => `  - ${col.tableName}.${col.columnName}: ${col.purpose}`)
      .join("\n")}
    
    Required Joins:
    ${analysis.requiredJoins
      .map(
        (join) =>
          `  - ${join.fromTable}.${join.fromColumn} ${join.joinType} JOIN ${join.toTable}.${join.toColumn}`
      )
      .join("\n")}
    
    Filters:
    ${analysis.filters
      .map(
        (filter) =>
          `  - ${filter.tableName}.${filter.columnName} ${filter.operator} ${
            filter.value || "?"
          }`
      )
      .join("\n")}
    
    Aggregations:
    ${analysis.aggregations
      .map(
        (agg) =>
          `  - ${agg.function}(${agg.tableName}.${agg.columnName})${
            agg.alias ? ` AS ${agg.alias}` : ""
          }`
      )
      .join("\n")}
    
    Sorting:
    ${analysis.sorting
      .map(
        (sort) => `  - ${sort.tableName}.${sort.columnName} ${sort.direction}`
      )
      .join("\n")}
  `;
}
