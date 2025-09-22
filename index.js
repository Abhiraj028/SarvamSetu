// index.js

// 1. Load Environment Variables and Import Libraries
require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const Scheme = require('./models/Scheme');

// 2. Initialize the Bot and Database Connection
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const dbUri = process.env.DB_CONNECTION_STRING;

mongoose.connect(dbUri)
  .then(() => {
    console.log('Database connected successfully');
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

// 3. In-Memory Session Storage
// This object will hold the questionnaire state for each user.
const userSessions = {};

// 4. Define the Questionnaire
const questions = [
  {
    key: 'state',
    text: 'Which State/UT do you live in?',
    options: [
      [{ text: 'Karnataka', callback_data: 'Karnataka' }, { text: 'Maharashtra', callback_data: 'Maharashtra' }],
      [{ text: 'Uttar Pradesh', callback_data: 'Uttar Pradesh' }, { text: 'West Bengal', callback_data: 'West Bengal' }],
      [{ text: 'Madhya Pradesh', callback_data: 'Madhya Pradesh' }, { text: 'Other', callback_data: 'Other' }],
    ]
  },
  {
    key: 'area',
    text: 'Do you live in a Rural or Urban area?',
    options: [
      [{ text: 'Rural', callback_data: 'Rural' }, { text: 'Urban', callback_data: 'Urban' }]
    ]
  },
  {
    key: 'category',
    text: 'What is your social category?',
    options: [
      [{ text: 'General', callback_data: 'General' }, { text: 'OBC', callback_data: 'OBC' }],
      [{ text: 'SC', callback_data: 'SC' }, { text: 'ST', callback_data: 'ST' }]
    ]
  },
  {
    key: 'age',
    text: 'What is your age? (Please type just the number)',
    type: 'text' // This question requires typed input
  },
  // Add more questions here as needed (gender, income, occupation, disability)
];

// 5. Main Bot Logic
console.log('Bot is running...');

// --- BOT COMMANDS AND MESSAGES ---

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
Welcome to Sarvam Setu!

I can help you find government schemes you might be eligible for.

Type /check to start the eligibility questionnaire.
  `;
  bot.sendMessage(chatId, welcomeMessage);
});

// Command to start the questionnaire
bot.onText(/\/check/, (msg) => {
  const chatId = msg.chat.id;
  // Start a new session for this user
  userSessions[chatId] = {
    currentQuestion: 0,
    answers: {}
  };
  askQuestion(chatId);
});

// Function to ask the current question
function askQuestion(chatId) {
  const session = userSessions[chatId];
  if (!session) return;

  const questionIndex = session.currentQuestion;
  if (questionIndex >= questions.length) {
    // Questionnaire is complete
    findSchemes(chatId);
    return;
  }

  const question = questions[questionIndex];
  const opts = question.options ? { reply_markup: { inline_keyboard: question.options } } : {};
  bot.sendMessage(chatId, question.text, opts);
}

// Handler for button clicks (Callback Queries)
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const session = userSessions[chatId];

  if (!session) {
    bot.answerCallbackQuery(callbackQuery.id);
    return;
  }
  
  const question = questions[session.currentQuestion];
  session.answers[question.key] = data; // Save the answer
  session.currentQuestion++; // Move to the next question

  bot.answerCallbackQuery(callbackQuery.id, { text: `Received: ${data}` });
  bot.deleteMessage(chatId, callbackQuery.message.message_id); // Clean up the old question

  askQuestion(chatId);
});

// Handler for text messages (to capture answers like age)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions[chatId];

    // Ignore if it's a command or if the user is not in a questionnaire
    if (msg.text.startsWith('/') || !session || session.currentQuestion >= questions.length) {
        return;
    }
    
    const question = questions[session.currentQuestion];

    // Check if the current question is expecting text input
    if (question.type === 'text') {
        session.answers[question.key] = msg.text; // Save the text answer
        session.currentQuestion++;
        
        bot.sendMessage(chatId, `Received: ${msg.text}`);
        askQuestion(chatId);
    }
});


// Function to query the database and find schemes
async function findSchemes(chatId) {
  const session = userSessions[chatId];
  if (!session) return;

  bot.sendMessage(chatId, 'Searching for schemes based on your answers...');

  // --- Build the Database Query ---
  const query = {
    "eligibility.state": { $in: [session.answers.state, "All"] }, // Must be in their state OR a national scheme
    "eligibility.area": { $in: [session.answers.area, null] }, // Matches area or if area is not specified
    "eligibility.category": { $in: [session.answers.category, "Poor", "Vulnerable families", null] } // Matches their category or a general one
  };
  
  // Add age query if applicable (more complex, for later)
  // Add income query if applicable (for later)

  try {
    const matchingSchemes = await Scheme.find(query).limit(5); // Limit to 5 results for now

    if (matchingSchemes.length === 0) {
      bot.sendMessage(chatId, "No matching schemes found based on your answers. You can try again with different options.");
    } else {
      let resultsMessage = "Here are some schemes you might be eligible for:\n\n";
      matchingSchemes.forEach(scheme => {
        resultsMessage += `*${scheme.schemeName}*\n`;
        resultsMessage += `${scheme.description.substring(0, 100)}...\n`;
        resultsMessage += `[Learn More](${scheme.applicationLink})\n\n`;
      });
      bot.sendMessage(chatId, resultsMessage, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error finding schemes:', error);
    bot.sendMessage(chatId, 'Something went wrong while searching for schemes.');
  } finally {
    // Clean up the session
    delete userSessions[chatId];
  }
}