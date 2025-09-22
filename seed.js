// seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Scheme = require('./models/Scheme'); // Import the Scheme model

const dbUri = process.env.DB_CONNECTION_STRING;

const seedDatabase = async () => {
  try {
    // Connect to the database
    await mongoose.connect(dbUri);
    console.log('Database connected for seeding');

    // Clear existing schemes to avoid duplicates
    await Scheme.deleteMany({});
    console.log('Previous schemes deleted');

    // Read the schemes.json file
    const schemesPath = path.join(__dirname, 'schemes.json');
    const schemesData = JSON.parse(fs.readFileSync(schemesPath, 'utf-8'));

    // Insert the new schemes
    await Scheme.insertMany(schemesData);
    console.log(`Successfully seeded ${schemesData.length} schemes`);

  } catch (err) {
    console.error('Error seeding the database:', err);
  } finally {
    // Close the database connection
    mongoose.connection.close();
    console.log('Database connection closed');
  }
};

seedDatabase();