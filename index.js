require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const Scheme = require('./models/Scheme');

const token = process.env.BOT_TOKEN;
const dbUri = process.env.DB_CONNECTION_STRING;

const userSessions = {};

const questions = [
  { key: 'state', text: 'Which State/UT do you live in?', options: [[{ text: 'Karnataka', callback_data: 'Karnataka' }, { text: 'Maharashtra', callback_data: 'Maharashtra' }], [{ text: 'Uttar Pradesh', callback_data: 'Uttar Pradesh' }, { text: 'Other', callback_data: 'Other' }]] },
  { key: 'area', text: 'Do you live in a Rural or Urban area?', options: [[{ text: 'Rural', callback_data: 'Rural' }, { text: 'Urban', callback_data: 'Urban' }]] },
  { key: 'category', text: 'What is your social category?', options: [[{ text: 'General', callback_data: 'General' }, { text: 'OBC', callback_data: 'OBC' }], [{ text: 'SC', callback_data: 'SC' }, { text: 'ST', callback_data: 'ST' }]] },
  { key: 'gender', text: 'What is your gender?', options: [[{ text: 'Male', callback_data: 'Male' }, { text: 'Female', callback_data: 'Female' }]] },
  { key: 'age', text: 'What is your age? (Please type the number)', type: 'text' },
  { key: 'occupation', text: 'What is your primary occupation?', options: [[{ text: 'Farmer', callback_data: 'Farmer' }, { text: 'Student', callback_data: 'Student' }], [{ text: 'Entrepreneur', callback_data: 'Entrepreneur' }, { text: 'Unemployed', callback_data: 'Unemployed' }]] },
  { key: 'disability', text: 'Do you have a disability certificate?', options: [[{ text: 'Yes', callback_data: 'Yes' }, { text: 'No', callback_data: 'No' }]] }
];

mongoose.connect(dbUri)
  .then(() => {
    console.log('Database connected successfully.');

    const bot = new TelegramBot(token, { polling: true });
    console.log('Sarvam Setu Bot is running...');

    // Bot event listeners are defined here, after connection is successful
    bot.onText(/\/start/, (msg) => {
      const startText = `Welcome to Sarvam Setu.\n\nType /check to start the questionnaire.`;
      bot.sendMessage(msg.chat.id, startText);
    });

    bot.onText(/\/check/, (msg) => {
      const chatId = msg.chat.id;
      userSessions[chatId] = { currentQuestion: 0, answers: {} };
      askQuestion(bot, chatId);
    });

    bot.on('callback_query', (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      bot.answerCallbackQuery(callbackQuery.id);
      bot.deleteMessage(chatId, callbackQuery.message.message_id);
      processAnswer(bot, chatId, data);
    });

    bot.on('message', (msg) => {
      const chatId = msg.chat.id;
      const session = userSessions[chatId];

      if (!msg.text || msg.text.startsWith('/') || !session || session.currentQuestion >= questions.length) {
        return;
      }
      
      const question = questions[session.currentQuestion];
      if (question.type === 'text') {
        const answer = msg.text.trim();
        if (!isNaN(answer) && Number(answer) > 0) {
          processAnswer(bot, chatId, Number(answer));
        } else {
          bot.sendMessage(chatId, "Please enter a valid number.");
        }
      }
    });

  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

function processAnswer(bot, chatId, answer) {
  const session = userSessions[chatId];
  if (!session) return;

  const question = questions[session.currentQuestion];
  session.answers[question.key] = answer;
  session.currentQuestion++;

  askQuestion(bot, chatId);
}

function askQuestion(bot, chatId) {
  const session = userSessions[chatId];
  if (!session) return;
  
  const questionIndex = session.currentQuestion;

  if (questionIndex >= questions.length) {
    findSchemes(bot, chatId);
    return;
  }

  const question = questions[questionIndex];
  const opts = question.options ? { reply_markup: { inline_keyboard: question.options } } : {};
  bot.sendMessage(chatId, question.text, opts);
}

async function findSchemes(bot, chatId) {
  const session = userSessions[chatId];
  if (!session) return;

  bot.sendMessage(chatId, 'Searching for schemes based on your profile...');

  const { state, area, category, gender, age, occupation, disability } = session.answers;

  const orConditions = [];

  // Build the OR conditions array. A scheme will match if ANY of these are true.
  if (state) orConditions.push({ 'eligibility.state': { $in: [state, "All"] } });
  if (area) orConditions.push({ 'eligibility.area': area });
  if (category) orConditions.push({ 'eligibility.category': category });
  if (gender) orConditions.push({ 'eligibility.gender': gender });
  if (occupation) orConditions.push({ 'eligibility.occupation': occupation });
  if (disability === 'Yes') orConditions.push({ 'eligibility.disability': true });
  
  if (age) {
    const userAge = Number(age);
    orConditions.push({
      '$and': [
        { $or: [{ 'eligibility.age_min': { $lte: userAge } }, { 'eligibility.age_min': { $exists: false } }] },
        { $or: [{ 'eligibility.age_max': { $gte: userAge } }, { 'eligibility.age_max': { $exists: false } }] }
      ]
    });
  }
  
  // If for some reason no conditions were built, prevent an error.
  if (orConditions.length === 0) {
    bot.sendMessage(chatId, "Please answer at least one question to get results.");
    delete userSessions[chatId];
    return;
  }

  const query = { $or: orConditions };

  try {
    const matchingSchemes = await Scheme.find(query).limit(10);

    if (matchingSchemes.length === 0) {
      bot.sendMessage(chatId, "No matching schemes were found.");
    } else {
      const responseText = matchingSchemes.map(scheme => 
        `*${scheme.schemeName}*\n[Learn More](${scheme.applicationLink})`
      ).join('\n\n');
      bot.sendMessage(chatId, "Based on your answers, here are some possible schemes:\n\n" + responseText, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }
  } catch (error) {
    console.error('Error finding schemes:', error);
    bot.sendMessage(chatId, 'An error occurred during the search.');
  } finally {
    delete userSessions[chatId];
  }
}