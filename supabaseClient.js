// backend/supabaseClient.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://qexnthgfdvtvwoeykgun.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG50aGdmZHZ0dndvZXlrZ3VuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjEwMzYwNywiZXhwIjoyMDYxNjc5NjA3fQ.DX4jf483pIC0y4e9j5qbCCAVH-FujAdLbFF2h8ZtBjE";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
