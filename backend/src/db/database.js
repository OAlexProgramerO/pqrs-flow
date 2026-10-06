import Database from 'better-sqlite3';
const db = new Database(process.env.NODE_ENV === 'test' ? ':memory:' : 'database.sqlite');
export default db;
