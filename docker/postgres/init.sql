SELECT 'CREATE DATABASE sims_smk_test OWNER sims'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sims_smk_test')\gexec
