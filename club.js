require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware for parsing JSON data
app.use(bodyParser.json());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL client setup using DATABASE_URL from .env file
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Uses the external DATABASE_URL from .env
  ssl: { rejectUnauthorized: false },
});

// Connect to the database
client.connect()
  .then(() => {
    console.log('Connected to the database');

    // Create the table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS participants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        class VARCHAR(100) NOT NULL,
        round_1_score INT DEFAULT 0,
        round_2_score INT DEFAULT 0,
        round_3_score INT DEFAULT 0,
        UNIQUE(name, class)
      );
    `;
    return client.query(createTableQuery);
  })
  .then(() => {
    console.log('Table created or already exists');
  })
  .catch(err => console.error('Database connection error:', err.stack));

// Home route - Serving index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to submit scores for a specific round
app.post('/submit-scores', async (req, res) => {
  const { name, class_name, round, score } = req.body;

  // Log received data
  console.log('Received submission data:', { name, class_name, round, score });

  // Check for valid input data (ensuring score is a number)
  if (!name || !class_name || !round || isNaN(score)) {
    return res.status(400).json({ message: 'Invalid input data.' });
  }

  // Convert score to a number if it's a string
  const numericScore = Number(score);

  try {
    // Validate round number (1 to 3)
    if (round < 1 || round > 3) {
      return res.status(400).json({ message: 'Invalid round number.' });
    }

    // Dynamically construct the column name based on the round
    const column = `round_${round}_score`;

    // Construct the SQL query for inserting/updating the score
    const query = `
      INSERT INTO participants (name, class, ${column}) 
      VALUES ($1, $2, $3)
      ON CONFLICT (name, class) 
      DO UPDATE SET ${column} = $3
    `;

    // Log the query and data before executing it
    console.log('Executing query:', query);
    console.log('Query values:', [name, class_name, numericScore]);

    // Execute the query
    await client.query(query, [name, class_name, numericScore]);

    // Respond with a message
    const message = round === 3
      ? 'Quiz completed! Thank you for participating.'
      : `Round ${round} completed! Proceed to round ${round + 1}.`;

    // Log submission success
    console.log(`Score for ${name} in round ${round} updated successfully.`);

    res.status(200).json({ message });
  } catch (err) {
    console.error('Error executing query:', err.stack);
    res.status(500).json({ message: 'Error updating data.' });
  }
});

// API to get all participants
app.get('/participants', async (req, res) => {
  try {
    // Query to fetch all participant details including scores for each round
    const query = 'SELECT * FROM participants'; // Ensure you're querying the correct table
    const result = await client.query(query);

    // Check if there are no participants
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No participants found.' });
    }

    // Respond with the participants' details
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching participants:', err);
    res.status(500).json({ message: 'Error fetching participants.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

