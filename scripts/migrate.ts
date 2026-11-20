import { openDatabase } from "../lib/migrations";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const db = openDatabase();
db.close();
console.log("SQLite migrations applied. Fresh databases contain no user data.");
