// Rihla Members Area configuration.
// These two values are publishable by design: they are safe to ship in
// front-end code. Never put the secret key or the database password here.
var SUPABASE_URL = 'https://jklawobuebcqpteekclz.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_S-SKNnSTgM6h_s_kcD21ug_tfEkjUc0';
var SUPABASE_CONFIGURED = SUPABASE_URL.indexOf('https://') === 0 && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
