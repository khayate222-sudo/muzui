import { openDatabase } from './db.js';
import { seed } from './seed.js';
const store = openDatabase(); seed(store); store.sqlite.close();
console.log('Database migrations applied; initial posts inserted only when empty.');
