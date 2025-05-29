import { initializeTables } from "../db";

async function initialize() {
  try {
    console.log("🚀 Initializing database tables...");
    await initializeTables();
    console.log("✅ Database tables initialized successfully!");
  } catch (error: any) {
    console.error("❌ Error initializing database:", error.message);
    process.exit(1);
  }
}

// Run the initialization
initialize();
