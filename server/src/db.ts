import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
});

export const initializeTables = async () => {
  // Enable pgvector extension
  await query("CREATE EXTENSION IF NOT EXISTS vector;");

  // Create TABLE_SCHEMA table
  await query(`
    CREATE TABLE IF NOT EXISTS TABLE_SCHEMA (
      table_name TEXT PRIMARY KEY,
      analysis JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create schema_embeddings table
  await query(`
    CREATE TABLE IF NOT EXISTS schema_embeddings (
      id SERIAL PRIMARY KEY,
      embedding_type VARCHAR(20) NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      column_name VARCHAR(255),
      description TEXT NOT NULL,
      business_context TEXT,
      data_type VARCHAR(100),
      sample_values TEXT[],
      common_patterns TEXT[],
      embedding VECTOR(1536) NOT NULL,
      metadata JSONB DEFAULT '{}',
      relevance_score FLOAT DEFAULT 1.0,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Conditionally create unique indexes
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_table_embedding'
      ) THEN
        CREATE UNIQUE INDEX idx_unique_table_embedding 
        ON schema_embeddings (embedding_type, table_name)
        WHERE embedding_type = 'table' AND column_name IS NULL;
      END IF;
    END
    $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_column_embedding'
      ) THEN
        CREATE UNIQUE INDEX idx_unique_column_embedding 
        ON schema_embeddings (embedding_type, table_name, column_name)
        WHERE embedding_type = 'column' AND column_name IS NOT NULL;
      END IF;
    END
    $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_relationship_embedding'
      ) THEN
        CREATE UNIQUE INDEX idx_unique_relationship_embedding 
        ON schema_embeddings (embedding_type, table_name, column_name)
        WHERE embedding_type = 'relationship' AND column_name IS NOT NULL;
      END IF;
    END
    $$;
  `);

  // Create additional indexes
  await query(`
    CREATE INDEX IF NOT EXISTS idx_schema_embeddings_vector 
    ON schema_embeddings USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_schema_embeddings_type 
    ON schema_embeddings (embedding_type);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_schema_embeddings_table 
    ON schema_embeddings (table_name);
  `);
};

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getPool = () => pool;
