const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.log('DB size check skipped: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Warning threshold: 350 MB / budget: 500 MB.');process.exit(0);}
console.log('Connect the project-specific pg_database_size RPC before production monitoring. Warning threshold: 350 MB.');
