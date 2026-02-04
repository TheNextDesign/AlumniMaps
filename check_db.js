
import { supabase } from './src/supabaseClient.js';

async function checkTable() {
    const { data, error } = await supabase.from('schools').select('*').limit(1);
    if (error) {
        console.error('Error fetching schools:', error.message);
    } else {
        console.log('Schools table exists. Data:', data);
    }
}

checkTable();
