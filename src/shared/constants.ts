import dotenv from "dotenv";

dotenv.config();

export const DB_URL = `https://kv-storage.naptest.workers.dev/?key=${process.env.DB_KEY}`;
export const SOURCE_URL = "https://phimsexvietnam.vip";
