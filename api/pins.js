import pg from 'pg';
const { Pool } = pg;

// Use a connection pool to manage database connections
// Users must set DATABASE_URL in Vercel environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  let client;

  try {
    client = await pool.connect();

    if (request.method === 'GET') {
      const { rows } = await client.query('SELECT * FROM pins ORDER BY created_at DESC LIMIT 500');
      return response.status(200).json(rows);
    }

    if (request.method === 'POST') {
      const { full_name, school_name, batch_year, profession, company, city, latitude, longitude, contact_info } = request.body;

      // Basic Server-Side Validation
      if (!full_name || !school_name || !city || !latitude || !longitude) {
        return response.status(400).json({ error: 'Missing required fields' });
      }

      const query = `
        INSERT INTO pins (full_name, school_name, batch_year, profession, company, city, latitude, longitude, contact_info)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const values = [full_name, school_name, batch_year, profession, company, city, latitude, longitude, contact_info];

      const result = await client.query(query, values);
      return response.status(201).json(result.rows[0]);
    }

    return response.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Database Error:', error);
    return response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (client) client.release();
  }
}
