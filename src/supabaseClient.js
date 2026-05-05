import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase project URL and anon public key
const supabaseUrl = 'https://vaqvleudquvhtcxvxudy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcXZsZXVkcXV2aHRjeHZ4dWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTczODcsImV4cCI6MjA5Mjc3MzM4N30.bd88t3WWSQwdNvlVgGewp_QYrzE-4UzgdBGloXl1dxc'

export const supabase = createClient(supabaseUrl, supabaseKey)