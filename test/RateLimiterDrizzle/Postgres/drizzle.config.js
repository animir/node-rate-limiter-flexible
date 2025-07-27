import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './schema.js',
  dialect:"postgresql",
  dbCredentials: {
    url:"postgres://root:secret@127.0.0.1:5432",
  },
});
