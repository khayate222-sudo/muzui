// Set the mode without POSIX-only shell syntax so npm start also works on Windows.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
