import SchemaAnalyzerService from "../services/schemaAnalyzerService";
import SchemaEmbeddingService from "../services/schemaEmbeddingService";

async function generateEmbeddings() {
  const schemaAnalyzer = new SchemaAnalyzerService();
  const embeddingService = new SchemaEmbeddingService();

  // List of tables to analyze
  const tables = [
    "users",
    "teams",
    "team_user",
    "bank_account_transactions",
    "matters",
    "contacts",
    "invoices",
    // Add more tables here
  ];

  try {
    // 1. Analyze and store schema information
    console.log("📊 Analyzing database schema...");
    await schemaAnalyzer.analyzeAndStoreSchema(tables);

    // 2. Get stored schema information
    console.log("📥 Retrieving stored schema information...");
    const schemas = await schemaAnalyzer.getStoredSchemas(tables);

    // 3. Generate embeddings
    console.log("🤖 Generating embeddings...");
    await embeddingService.generateAndStoreAllEmbeddings(tables);

    console.log("✅ Schema embedding generation completed!");
  } catch (error: any) {
    console.error("❌ Error generating embeddings:", error.message);
    process.exit(1);
  }
}

// Run the script
generateEmbeddings();
